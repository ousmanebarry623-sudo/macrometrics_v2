/**
 * /api/bond-spread — Bond Yield Spread Monitor
 *
 * Le spread 10Y entre deux pays est l'un des meilleurs prédicteurs court-terme des FX.
 * EUR/USD corrèle à ~85% avec spread US10Y - DE10Y.
 *
 * Sources : Yahoo Finance (gratuit, sans clé API).
 * Cache Redis TTL 4h.
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";

const REDIS_KEY = "macro:bond-spread:v1";
const TTL_SECONDS = 4 * 3600;

// Tickers Yahoo Finance 10Y souverains
// Note: Yahoo couvre principalement US. Pour les autres on utilise
// les tickers OECD/ICE disponibles via Yahoo Finance international.
const BOND_TICKERS: Record<string, { ticker: string; fallback: number; name: string }> = {
  USD: { ticker: "^TNX",        fallback: 4.45, name: "US 10Y Treasury"      },
  EUR: { ticker: "^BUND",       fallback: 2.50, name: "German Bund 10Y"      },
  GBP: { ticker: "^FTMIB",      fallback: 4.20, name: "UK Gilt 10Y"          }, // proxy approximatif
  JPY: { ticker: "^JGB10",      fallback: 0.90, name: "Japan JGB 10Y"        },
  CAD: { ticker: "CA10YT=RR",   fallback: 3.80, name: "Canada 10Y"           },
  AUD: { ticker: "GSBG10.AX",   fallback: 4.40, name: "Australia 10Y"        },
  NZD: { ticker: "NZGG2.NZ",    fallback: 4.80, name: "NZ Govt 10Y"          },
  CHF: { ticker: "CH10YT=RR",   fallback: 0.90, name: "Swiss 10Y"            },
};

async function fetchYield(ticker: string, fallback: number): Promise<{ value: number; source: "live" | "fallback" }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { value: fallback, source: "fallback" };
    const json = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> }
    };
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === "number" && price > 0) {
      return { value: Math.round(price * 100) / 100, source: "live" };
    }
    return { value: fallback, source: "fallback" };
  } catch {
    return { value: fallback, source: "fallback" };
  }
}

export interface BondYield {
  currency: string;
  name: string;
  yield: number;
  source: "live" | "fallback";
}

export interface BondSpread {
  pair: string;
  base: string;
  quote: string;
  baseYield: number;
  quoteYield: number;
  spread: number;             // base - quote (pb: points de base = /100)
  spreadBps: number;          // en basis points
  signal: "bullish_base" | "bullish_quote" | "neutral";
  magnitude: "extreme" | "strong" | "moderate" | "weak";
  correlation: "high" | "medium" | "low"; // corrélation historique connue avec FX
  interpretation: string;
}

export interface BondSpreadData {
  yields: Record<string, BondYield>;
  spreads: BondSpread[];
  generatedAt: string;
}

// Corrélation connue spread→FX (direction: si spread monte, devise va dans quel sens)
const PAIR_CORRELATIONS: Record<string, { correlation: "high" | "medium" | "low"; note: string }> = {
  "USD/EUR": { correlation: "high",   note: "US-DE 10Y spread → EUR/USD inversé (r~0.85)"  },
  "USD/JPY": { correlation: "high",   note: "US-JP 10Y spread → USD/JPY direct (r~0.75)"   },
  "GBP/USD": { correlation: "medium", note: "UK-US 10Y spread → GBP/USD (r~0.55)"          },
  "AUD/USD": { correlation: "medium", note: "AU-US 10Y spread → AUD/USD (r~0.50)"          },
  "USD/CAD": { correlation: "medium", note: "US-CA 10Y spread → USD/CAD (r~0.45)"          },
  "USD/CHF": { correlation: "medium", note: "US-CH 10Y spread → USD/CHF (r~0.60)"          },
  "NZD/USD": { correlation: "low",    note: "NZ-US 10Y spread → NZD/USD (r~0.35)"          },
};

const MAIN_PAIRS: Array<[string, string]> = [
  ["USD", "EUR"], ["USD", "JPY"], ["GBP", "USD"],
  ["USD", "CAD"], ["AUD", "USD"], ["NZD", "USD"],
  ["USD", "CHF"], ["EUR", "GBP"], ["EUR", "JPY"],
  ["AUD", "JPY"], ["GBP", "JPY"],
];

export async function GET() {
  try {
    const cached = await kv.get<BondSpreadData>(REDIS_KEY);
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "public, s-maxage=1800" } });

    // Fetch tous les yields en parallèle
    const yieldResults = await Promise.all(
      Object.entries(BOND_TICKERS).map(async ([cur, { ticker, fallback, name }]) => {
        const result = await fetchYield(ticker, fallback);
        return [cur, { currency: cur, name, yield: result.value, source: result.source }] as const;
      })
    );

    const yields: Record<string, BondYield> = Object.fromEntries(yieldResults);

    const spreads: BondSpread[] = MAIN_PAIRS.map(([base, quote]) => {
      const baseYield = yields[base]?.yield ?? 0;
      const quoteYield = yields[quote]?.yield ?? 0;
      const spread = Math.round((baseYield - quoteYield) * 100) / 100;
      const spreadBps = Math.round(spread * 100);

      const magnitude: BondSpread["magnitude"] =
        Math.abs(spreadBps) >= 250 ? "extreme" :
        Math.abs(spreadBps) >= 100 ? "strong"  :
        Math.abs(spreadBps) >= 50  ? "moderate" : "weak";

      const signal: BondSpread["signal"] =
        spread >= 0.3  ? "bullish_base"  :
        spread <= -0.3 ? "bullish_quote" : "neutral";

      const pairKey = `${base}/${quote}`;
      const corrInfo = PAIR_CORRELATIONS[pairKey] || { correlation: "low" as const, note: "" };

      const interpretation = spread >= 0.5
        ? `${base} 10Y ${spreadBps}bps au-dessus ${quote} → avantage rendement ${base}`
        : spread <= -0.5
        ? `${quote} 10Y ${Math.abs(spreadBps)}bps au-dessus ${base} → avantage rendement ${quote}`
        : `Spread neutre (${spreadBps}bps) — pas de signal directionnel fort`;

      return {
        pair: `${base}/${quote}`,
        base, quote,
        baseYield, quoteYield,
        spread, spreadBps,
        signal, magnitude,
        correlation: corrInfo.correlation,
        interpretation,
      };
    });

    const data: BondSpreadData = { yields, spreads, generatedAt: new Date().toISOString() };
    await kv.set(REDIS_KEY, data, { ex: TTL_SECONDS });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[bond-spread] error:", err);
    return NextResponse.json({ error: "Bond spread failed", detail: String(err) }, { status: 500 });
  }
}
