import { NextResponse } from "next/server";
import {
  PAIR_TO_TAB, MONTH_NAMES,
  fetchSheetRaw, computeRangeStats,
} from "@/lib/seasonality-sheets";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface MonthStat {
  month:      string;
  avg:        number;
  bullishPct: number;
  bias:       number;  // +1 / 0 / -1
  count:      number;  // nb d'années avec données
}

export interface SeasonRangeResult {
  pair:    string;
  from:    number;
  to:      number;
  months:  MonthStat[];
  trend:   number[];  // 12 valeurs
  source:  "sheets" | "fallback";
}

// ── Cache résultats finaux par (from-to-pairs) ─────────────────────────────────
const resultCache = new Map<string, { data: SeasonRangeResult[]; ts: number }>();
const RESULT_TTL  = 30 * 60 * 1000; // 30 min

// ── GET /api/seasonality-range?from=2010&to=2025&pairs=EUR/USD,GBP/USD ─────────
export async function GET(req: Request) {
  const url    = new URL(req.url);
  const from   = parseInt(url.searchParams.get("from") ?? "1971");
  const to     = parseInt(url.searchParams.get("to")   ?? String(new Date().getFullYear()));
  const pairsQ = url.searchParams.get("pairs");
  const pairs  = pairsQ ? pairsQ.split(",").map(p => p.trim()) : Object.keys(PAIR_TO_TAB);

  if (isNaN(from) || isNaN(to) || from >= to || from < 1971 || to > new Date().getFullYear()) {
    return NextResponse.json({ error: "Plage invalide. from ≥ 1971, from < to ≤ année courante" }, { status: 400 });
  }

  const cacheKey = `${from}-${to}-${pairs.join(",")}`;
  const cached   = resultCache.get(cacheKey);
  if (cached && Date.now() < cached.ts) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const results = await Promise.all(
    pairs.map(async (pair): Promise<SeasonRangeResult> => {
      const tab  = PAIR_TO_TAB[pair];
      const rows = tab ? await fetchSheetRaw(tab) : null;

      if (rows && rows.length > 0) {
        const { months, trend } = computeRangeStats(rows, from, to);
        return { pair, from, to, months: months as MonthStat[], trend, source: "sheets" };
      }

      // Fallback : retourne des 0 si pas de données
      return {
        pair, from, to,
        months: MONTH_NAMES.map(m => ({ month: m, avg: 0, bullishPct: 50, bias: 0, count: 0 })),
        trend:  new Array(12).fill(0),
        source: "fallback",
      };
    })
  );

  resultCache.set(cacheKey, { data: results, ts: Date.now() + RESULT_TTL });
  return NextResponse.json(results, {
    headers: { "X-Cache": "MISS", "X-From": String(from), "X-To": String(to) },
  });
}
