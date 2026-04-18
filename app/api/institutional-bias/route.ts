// app/api/institutional-bias/route.ts
import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";
import { fetchAllBondSpreads } from "@/lib/bond-spreads";
import { fetchMultiTF, YF_SYMBOL_MAP } from "@/lib/ohlcv-fetch";
import { computeSMC } from "@/lib/smc-engine";
import type { SMCResult } from "@/lib/smc-engine";
import {
  computeMacroLayer,
  computeSentimentLayer,
  computeSMCLayer,
  computeConfluenceLayer,
  computeEntryLevels,
  generateArguments,
  selectTop6,
  type InstitutionalPairSignal,
} from "@/lib/institutional-bias";
import type { PairSignal } from "@/app/api/signal-analysis/route";
import type { RegimeType } from "@/lib/market-regime";
import type { OHLCV } from "@/lib/ohlcv-fetch";

export const dynamic = "force-dynamic";

const CACHE_KEY = "institutional-bias:v1";
const CACHE_TTL = 15 * 60;

type SMCWithD1 = SMCResult & { d1: OHLCV[] };

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function fetchVIX(): Promise<number> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return 18;
    const json   = await res.json();
    const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []) as number[];
    const valid  = closes.filter((v): v is number => typeof v === "number" && !isNaN(v));
    return valid.at(-1) ?? 18;
  } catch { return 18; }
}

async function fetchOHLCVBatched(pairs: string[]): Promise<Map<string, SMCWithD1>> {
  const results = new Map<string, SMCWithD1>();
  const BATCH = 5;
  const DELAY = 100;

  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const batchRes = await Promise.allSettled(
      batch.map(async (pair) => {
        const symbol = YF_SYMBOL_MAP[pair];
        if (!symbol) return null;
        const tf  = await fetchMultiTF(symbol);
        const smc = computeSMC(tf);
        return { pair, smc: { ...smc, d1: tf.d1 } as SMCWithD1 };
      }),
    );
    for (const r of batchRes) {
      if (r.status === "fulfilled" && r.value) {
        results.set(r.value.pair, r.value.smc);
      }
    }
    if (i + BATCH < pairs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY));
    }
  }
  return results;
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!force) {
    try {
      const cached = await kv.get<{
        top6: InstitutionalPairSignal[];
        regime: string;
        dxyTrend: string;
        vix: number;
        updatedAt: string;
      }>(CACHE_KEY);
      if (cached) return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });
    } catch { /* cache miss */ }
  }

  const baseUrl = getBaseUrl(req);

  try {
    const [signalsRes, regimeRes, bondSpreads, vix] = await Promise.all([
      fetch(`${baseUrl}/api/signal-analysis`, { cache: "no-store", signal: AbortSignal.timeout(30000) }).then(r => r.json() as Promise<PairSignal[]>),
      fetch(`${baseUrl}/api/market-regime`,   { cache: "no-store", signal: AbortSignal.timeout(20000) }).then(r => r.json()).catch(() => null),
      fetchAllBondSpreads(),
      fetchVIX(),
    ]);

    const signals: PairSignal[] = Array.isArray(signalsRes) ? signalsRes : [];
    const regime: RegimeType | null = regimeRes?.snapshot?.regime ?? null;

    // DXY structure
    let dxyStructure: "BULLISH" | "BEARISH" | "RANGING" = "RANGING";
    try {
      const dxyTF  = await fetchMultiTF("DX-Y.NYB");
      dxyStructure = computeSMC(dxyTF).structure;
    } catch { /* keep RANGING */ }

    const smcMap    = await fetchOHLCVBatched(signals.map(s => s.pair));
    const allScores: InstitutionalPairSignal[] = [];

    for (const signal of signals) {
      if (signal.pair === "XCU/USD") continue;
      const smcData = smcMap.get(signal.pair);
      if (!smcData) continue;
      const bond = bondSpreads.get(signal.pair);
      const cat  = (signal.category === "Minor" ? "Major" : signal.category) as "Major" | "Cross" | "Commodity";
      const { d1, ...smc } = smcData;

      for (const direction of ["BUY", "SELL"] as const) {
        const macro      = computeMacroLayer(signal, bond, direction);
        const sentiment  = computeSentimentLayer(signal, regime, signal.pair, direction);
        const smcLayer   = computeSMCLayer(smc, direction);
        const confluence = computeConfluenceLayer(dxyStructure, vix, signal.pair, direction);
        const score      = Math.min(100, macro + sentiment + smcLayer + confluence);
        const entry      = computeEntryLevels(smc, direction, d1);
        const args       = generateArguments(signal, smc, bond, regime, direction, score);

        allScores.push({
          pair:      signal.pair,
          category:  cat,
          direction,
          score,
          layers:    { macro, sentiment, smc: smcLayer, confluence },
          smcContext: {
            structure:  smc.structure,
            lastEvent:  smc.lastEvent,
            hasValidOB: smc.orderBlock?.valid ?? false,
            obZone:     smc.orderBlock?.valid ? { low: smc.orderBlock.low, high: smc.orderBlock.high } : null,
          },
          entry,
          arguments:  args,
          bondSpread: bond?.spread_bps ?? 0,
        });
      }
    }

    const top6     = selectTop6(allScores);
    const dxyTrend = dxyStructure === "BULLISH" ? "BULLISH" : dxyStructure === "BEARISH" ? "BEARISH" : "NEUTRAL";
    const data     = { top6, regime: regime ?? "MIXED", dxyTrend, vix, updatedAt: new Date().toISOString() };

    kv.set(CACHE_KEY, data, { ex: CACHE_TTL }).catch(() => {});

    return NextResponse.json(data, { headers: { "X-Cache": "MISS", "X-Top6": String(top6.length) } });

  } catch (err) {
    console.error("[institutional-bias]", err);
    return NextResponse.json(
      { error: String(err), top6: [], regime: "MIXED", dxyTrend: "NEUTRAL", vix: 18, updatedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}
