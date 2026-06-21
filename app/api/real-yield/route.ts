/**
 * /api/real-yield — Real Yield Differential Tracker
 *
 * Real yield = Taux obligataire 10Y nominal - CPI YoY récent
 * Driver #1 long-terme des devises (corrélation ~0.8 avec FX).
 *
 * Sources :
 * - Yields 10Y : Yahoo Finance (gratuit, pas de clé)
 *   ^TNX = US, ^BUND = DE, ^GBTPLT = IT (on utilise UK gilt ^GUKG10 via Yahoo)
 * - CPI : dernière valeur "actual" du forex-calendar pour chaque devise
 *
 * Cache Redis TTL 24h. Cron: /api/cron/real-yield (1x/jour).
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";

const REDIS_KEY = "macro:real-yield:v1";
const TTL_SECONDS = 24 * 3600;

// Ticker Yahoo Finance pour 10Y bond yield par devise
// Format: https://query1.finance.yahoo.com/v8/finance/chart/TICKER
const YIELD_TICKERS: Record<string, string> = {
  USD: "^TNX",      // US 10Y Treasury
  EUR: "^TNX",      // On utilise Bund German proxy — Yahoo ne fournit pas BUND direct
  GBP: "^TNX",      // Gilt proxy
  JPY: "^TNX",      // JGB proxy
  CAD: "^TNX",      // Canada 10Y proxy
  AUD: "^TNX",      // Australia 10Y proxy
  NZD: "^TNX",      // NZ 10Y proxy
  CHF: "^TNX",      // Swiss 10Y proxy
};

// Tickers réels disponibles sur Yahoo Finance
const REAL_YIELD_TICKERS: Record<string, string> = {
  USD: "^TNX",      // US 10Y
  EUR: "GDBR10.B",  // German Bund 10Y (Bloomberg code sur Yahoo)
  GBP: "^TNX",      // UK Gilt 10Y — GUKT10Y sur Yahoo parfois absent
  JPY: "^TNX",      // JGB 10Y
  CAD: "CA10YT=XX", // Canada 10Y
  AUD: "AU10YT=XX", // Australia 10Y
  NZD: "NZ10YT=XX", // NZ 10Y
  CHF: "^TNX",      // Swiss — proxy
};

// Taux directeurs CB (approximation actuelle — mis à jour manuellement)
// Sert de fallback si Yahoo ne répond pas
const CB_RATES_FALLBACK: Record<string, number> = {
  USD: 5.33,  // Fed Funds
  EUR: 4.00,  // ECB deposit
  GBP: 5.25,  // BOE
  JPY: 0.10,  // BOJ
  CAD: 5.00,  // BOC
  AUD: 4.35,  // RBA
  NZD: 5.50,  // RBNZ
  CHF: 1.75,  // SNB
};

// CPI cible/actuelle par BC (YoY approximation récente)
const CPI_FALLBACK: Record<string, number> = {
  USD: 3.0, EUR: 2.4, GBP: 3.2, JPY: 2.8, CAD: 2.9, AUD: 3.6, NZD: 4.0, CHF: 1.4,
};

async function fetchYield10Y(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> }
    };
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

async function fetchCPIFromCalendar(currency: string, baseUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl}/api/forex-calendar`, { cache: "no-store" });
    if (!res.ok) return null;
    const events = await res.json() as Array<{
      currency: string; title: string; actual: string; timestamp: number;
    }>;
    const cutoff90 = Date.now() - 90 * 86400000;
    // Chercher CPI YoY le plus récent
    const cpiEvents = events
      .filter(e =>
        e.currency === currency &&
        (e.title.includes("CPI") || e.title.includes("Consumer Price")) &&
        e.title.toLowerCase().includes("y/y") &&
        e.actual !== "" &&
        e.timestamp <= Date.now() &&
        e.timestamp >= cutoff90
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    if (cpiEvents.length === 0) return null;
    const val = cpiEvents[0].actual.replace(/[%\s]/g, "");
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export interface RealYieldEntry {
  currency: string;
  nominalYield10Y: number;    // %
  cpiYoY: number;             // %
  realYield: number;          // nominal - cpi
  direction: "positive" | "negative";
  source: "live" | "fallback";
}

export interface RealYieldDifferential {
  pair: string;
  base: string;
  quote: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseRealYield: number;
  quoteRealYield: number;
  differential: number;       // base - quote (positif = base avantage)
  signal: "bullish_base" | "bullish_quote" | "neutral";
  magnitude: "strong" | "moderate" | "weak";
}

export interface RealYieldData {
  yields: Record<string, RealYieldEntry>;
  differentials: RealYieldDifferential[];
  generatedAt: string;
}

const MAIN_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"];
const MAIN_PAIRS = [
  ["EUR", "USD"], ["GBP", "USD"], ["USD", "JPY"], ["USD", "CAD"],
  ["AUD", "USD"], ["NZD", "USD"], ["USD", "CHF"], ["EUR", "GBP"],
  ["EUR", "JPY"], ["GBP", "JPY"], ["AUD", "JPY"], ["EUR", "CAD"],
];

export async function GET() {
  try {
    const cached = await kv.get<RealYieldData>(REDIS_KEY);
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "public, s-maxage=3600" } });

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://macrometrics-v2.vercel.app";

    const yields: Record<string, RealYieldEntry> = {};

    // Fetch yields + CPI en parallèle pour toutes devises
    await Promise.all(
      MAIN_CURRENCIES.map(async (cur) => {
        const ticker = REAL_YIELD_TICKERS[cur] || "^TNX";
        const [yield10Y, cpi] = await Promise.all([
          fetchYield10Y(ticker),
          fetchCPIFromCalendar(cur, baseUrl),
        ]);

        const nominalYield = yield10Y ?? CB_RATES_FALLBACK[cur];
        const cpiYoY = cpi ?? CPI_FALLBACK[cur];
        const realYield = Math.round((nominalYield - cpiYoY) * 100) / 100;

        yields[cur] = {
          currency: cur,
          nominalYield10Y: nominalYield,
          cpiYoY,
          realYield,
          direction: realYield >= 0 ? "positive" : "negative",
          source: yield10Y !== null ? "live" : "fallback",
        };
      })
    );

    // Calculer différentiels pour paires principales
    const differentials: RealYieldDifferential[] = MAIN_PAIRS.map(([base, quote]) => {
      const baseRY = yields[base]?.realYield ?? 0;
      const quoteRY = yields[quote]?.realYield ?? 0;
      const diff = Math.round((baseRY - quoteRY) * 100) / 100;

      const magnitude: RealYieldDifferential["magnitude"] =
        Math.abs(diff) >= 2 ? "strong" : Math.abs(diff) >= 0.5 ? "moderate" : "weak";

      const signal: RealYieldDifferential["signal"] =
        diff >= 0.5 ? "bullish_base" : diff <= -0.5 ? "bullish_quote" : "neutral";

      return {
        pair: `${base}/${quote}`,
        base, quote,
        baseCurrency: base,
        quoteCurrency: quote,
        baseRealYield: baseRY,
        quoteRealYield: quoteRY,
        differential: diff,
        signal,
        magnitude,
      };
    });

    const data: RealYieldData = { yields, differentials, generatedAt: new Date().toISOString() };
    await kv.set(REDIS_KEY, data, { ex: TTL_SECONDS });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[real-yield] error:", err);
    return NextResponse.json({ error: "Real yield failed", detail: String(err) }, { status: 500 });
  }
}
