/**
 * GET /api/signals?symbol=EURUSD
 *
 * Returns macro bias for a forex pair.
 * MT4 EA (ELTE PULLBACK) calls this via WebRequest() before opening a trade.
 *
 * Response:
 *   { "symbol":"EURUSD", "bias":"BUY"|"SELL"|"NEUTRAL",
 *     "score": -1.0..1.0, "cot":"BUY", "sentiment":"SELL", "seasonality":"BUY" }
 *
 * Weights: COT 50% · Sentiment 30% · Seasonality 20%
 * (Different from /api/signal-analysis which weights: Seas 45%, Sent 40%, COT 15%)
 * Here we weight COT higher because the EA uses this as a macro gate.)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchMyfxbookMap } from "@/lib/myfxbook";
import { fetchAllPairsSeasonality } from "@/lib/seasonality-sheets";

// ─── CORS ─────────────────────────────────────────────────────────────────────
function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

// ─── Weights ──────────────────────────────────────────────────────────────────
const W_COT         = 0.5;
const W_SENTIMENT   = 0.3;
const W_SEASONALITY = 0.2;

// ─── Pair format helpers ──────────────────────────────────────────────────────
/** "EURUSD" → "EUR/USD" */
function toPair(symbol: string): string {
  if (symbol.length === 6) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return symbol;
}

// ─── CFTC market config (mirrors signal-analysis/route.ts) ───────────────────
const CFTC_MARKETS: Record<string, { market: string; invert: boolean; legacy?: boolean }> = {
  EUR: { market: "EURO FX - CHICAGO MERCANTILE EXCHANGE",                invert: false },
  GBP: { market: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",          invert: false },
  JPY: { market: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",           invert: true  },
  CAD: { market: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",        invert: true  },
  AUD: { market: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",      invert: false },
  NZD: { market: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",              invert: false },
  CHF: { market: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",            invert: true  },
  USD: { market: "U.S. DOLLAR INDEX - ICE FUTURES U.S.",                 invert: false },
  MXN: { market: "MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE",           invert: true  },
  XAU: { market: "GOLD - COMMODITY EXCHANGE INC.",                       invert: false, legacy: true },
  XAG: { market: "SILVER - COMMODITY EXCHANGE INC.",                     invert: false, legacy: true },
};

// ─── Fetch CFTC z-score for a single currency ────────────────────────────────
async function fetchCurrencyZScore(currency: string): Promise<number> {
  const cfg = CFTC_MARKETS[currency];
  if (!cfg) return 0;
  const BASE_URL = cfg.legacy
    ? "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
    : "https://publicreporting.cftc.gov/resource/jun7-fc8e.json";
  try {
    const url = [
      BASE_URL,
      `?market_and_exchange_names=${encodeURIComponent(cfg.market)}`,
      "&$order=report_date_as_yyyy_mm_dd DESC",
      "&$limit=52",
      "&$select=noncomm_positions_long_all,noncomm_positions_short_all",
    ].join("");
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return 0;
    const rows: Record<string, string>[] = await res.json();
    if (!rows.length) return 0;
    const nets = rows.map(r =>
      parseInt(r.noncomm_positions_long_all  || "0") -
      parseInt(r.noncomm_positions_short_all || "0")
    );
    const mean = nets.reduce((a, b) => a + b, 0) / nets.length;
    const std  = Math.sqrt(nets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nets.length) || 1;
    const z    = (nets[0] - mean) / std;
    return cfg.invert ? -z : z;
  } catch {
    return 0;
  }
}

// ─── COT bias: (baseZ - quoteZ) / 3, clamped [-1, 1] ────────────────────────
async function fetchCOTBias(symbol: string): Promise<number> {
  const base  = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3, 6).toUpperCase();
  const [baseZ, quoteZ] = await Promise.all([
    fetchCurrencyZScore(base),
    fetchCurrencyZScore(quote),
  ]);
  return Math.max(-1, Math.min(1, (baseZ - quoteZ) / 3));
}

// ─── Sentiment bias: contrarian retail, clamped [-1, 1] ──────────────────────
// longPct 70% long → -1 (contrarian bearish), 30% long → +1 (contrarian bullish)
async function fetchSentimentBias(symbol: string): Promise<number> {
  const pair   = toPair(symbol);
  const mfxMap = await fetchMyfxbookMap();
  const longPct = mfxMap[pair] ?? 50;
  return Math.max(-1, Math.min(1, -(longPct - 50) / 20));
}

// ─── Seasonality bias: current-month trend score (-1 / 0 / +1) ───────────────
async function fetchSeasonalityBias(symbol: string): Promise<number> {
  const pair      = toPair(symbol);
  const seasonMap = await fetchAllPairsSeasonality();
  const monthIdx  = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  ).getMonth();
  return seasonMap[pair]?.trend[monthIdx] ?? 0;
}

// ─── Label ────────────────────────────────────────────────────────────────────
function scoreToLabel(score: number): "BUY" | "SELL" | "NEUTRAL" {
  if (score >  0.15) return "BUY";
  if (score < -0.15) return "SELL";
  return "NEUTRAL";
}

// ─── GET handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol || symbol.length !== 6) {
    return cors(
      NextResponse.json({ error: "symbol param required, e.g. ?symbol=EURUSD" }, { status: 400 })
    );
  }
  try {
    const [cotScore, sentScore, seasScore] = await Promise.all([
      fetchCOTBias(symbol),
      fetchSentimentBias(symbol),
      fetchSeasonalityBias(symbol),
    ]);
    const aggregate =
      cotScore  * W_COT +
      sentScore * W_SENTIMENT +
      seasScore * W_SEASONALITY;

    const body = {
      symbol,
      bias:        scoreToLabel(aggregate),
      score:       Math.round(aggregate * 1000) / 1000,
      cot:         scoreToLabel(cotScore),
      sentiment:   scoreToLabel(sentScore),
      seasonality: scoreToLabel(seasScore),
      timestamp:   new Date().toISOString(),
    };
    return cors(
      NextResponse.json(body, {
        headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate" },
      })
    );
  } catch (err) {
    console.error("[/api/signals]", err);
    return cors(NextResponse.json({ error: "internal" }, { status: 500 }));
  }
}
