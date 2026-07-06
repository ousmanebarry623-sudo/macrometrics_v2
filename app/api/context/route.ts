/**
 * GET /api/context?symbol=EURUSD
 *
 * Endpoint consommé par l'EA ELTE PULLBACK v4 via WebRequest().
 * Utilise les MÊMES sources de données que la page Analyse MacroMetrics:
 *   - COT institutionnel : CFTC API (z-score 52 semaines, données en temps réel)
 *   - Sentiment retail   : lib/myfxbook (MyFXBook community outlook + Redis cache)
 *   - Saisonnalité       : lib/seasonality-sheets (Google Sheets 11 ans)
 *
 * Réponse JSON (format attendu par CheckMacroContext() dans l'EA):
 *   {
 *     "symbol":          "EURUSD",
 *     "seasonality":     "bullish" | "bearish" | "neutral",
 *     "retail_long_pct": 72.5,
 *     "signal":          "bullish" | "bearish" | "neutral",
 *     "score":           0.28,
 *     "timestamp":       "2026-..."
 *   }
 *
 * Poids: COT 50% · Sentiment retail 30% · Saisonnalité 20%
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchMyfxbookMap }          from "@/lib/myfxbook";
import { fetchAllPairsSeasonality }  from "@/lib/seasonality-sheets";

// ─── CORS ─────────────────────────────────────────────────────────────────────
function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

// ─── Pair format helpers ──────────────────────────────────────────────────────
/** "AUDCAD" → "AUD/CAD" */
function toPairSlash(symbol: string): string {
  return symbol.length === 6
    ? `${symbol.slice(0, 3)}/${symbol.slice(3)}`
    : symbol;
}

// ─── COT: CFTC API — z-score net speculator positions (52 semaines) ──────────
const CFTC_MARKETS: Record<string, { market: string; invert: boolean; legacy?: boolean }> = {
  EUR: { market: "EURO FX - CHICAGO MERCANTILE EXCHANGE",           invert: false },
  GBP: { market: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",     invert: false },
  JPY: { market: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",      invert: true  },
  CAD: { market: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",   invert: true  },
  AUD: { market: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE", invert: false },
  NZD: { market: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",         invert: false },
  CHF: { market: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",       invert: true  },
  USD: { market: "U.S. DOLLAR INDEX - ICE FUTURES U.S.",            invert: false },
  MXN: { market: "MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE",      invert: true  },
  XAU: { market: "GOLD - COMMODITY EXCHANGE INC.",                  invert: false, legacy: true },
  XAG: { market: "SILVER - COMMODITY EXCHANGE INC.",                invert: false, legacy: true },
};

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

async function fetchCOTScore(symbol: string): Promise<number> {
  const base  = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3, 6).toUpperCase();
  const [baseZ, quoteZ] = await Promise.all([
    fetchCurrencyZScore(base),
    fetchCurrencyZScore(quote),
  ]);
  // Normalise: (baseZ - quoteZ) / 3, clamped [-1, 1]
  return Math.max(-1, Math.min(1, (baseZ - quoteZ) / 3));
}

// ─── Retail sentiment : MyFXBook (via lib Redis-cached) ──────────────────────
async function fetchRetailLongPct(symbol: string): Promise<number> {
  try {
    const map  = await fetchMyfxbookMap();
    const pair = toPairSlash(symbol);
    return map[pair] ?? 50;
  } catch {
    // Fallback: direct Myfxbook public API
    const session = process.env.MYFXBOOK_SESSION;
    if (!session) return 50;
    try {
      const url = `https://www.myfxbook.com/api/get-community-outlook.json?session=${session}`;
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) return 50;
      const data = await res.json();
      const sym  = symbol.replace("XAUUSD", "GOLD").replace("XAGUSD", "SILVER");
      const row  = (data?.symbols ?? []).find(
        (s: { name: string }) => s.name.toUpperCase() === sym
      );
      return row ? (parseFloat(row.longPercentage) || 50) : 50;
    } catch {
      return 50;
    }
  }
}

// ─── Saisonnalité : Google Sheets 11 ans (via lib Redis-cached) ──────────────
async function fetchSeasonalityScore(symbol: string): Promise<number> {
  const monthIdx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  ).getMonth();

  try {
    const map  = await fetchAllPairsSeasonality();
    const pair = toPairSlash(symbol);
    return map[pair]?.trend?.[monthIdx] ?? 0;
  } catch {
    return 0;
  }
}

// ─── Score → label EA ─────────────────────────────────────────────────────────
function toLabel(s: number): "bullish" | "bearish" | "neutral" {
  if (s >  0.15) return "bullish";
  if (s < -0.15) return "bearish";
  return "neutral";
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")
    ?.toUpperCase()
    .replace(/[^A-Z]/g, "") ?? "";

  if (symbol.length < 6) {
    return cors(
      NextResponse.json({ error: "symbol param required, e.g. ?symbol=EURUSD" }, { status: 400 })
    );
  }

  try {
    const [cotScore, retailLongPct, seasScore] = await Promise.all([
      fetchCOTScore(symbol),
      fetchRetailLongPct(symbol),
      fetchSeasonalityScore(symbol),
    ]);

    // Sentiment contrarian: retail > 65% long → bearish, < 35% → bullish
    const sentScore =
      retailLongPct > 65 ? -((retailLongPct - 65) / 35) :
      retailLongPct < 35 ?  ((35 - retailLongPct) / 35) : 0;

    // Agrégat: COT 50% · Sentiment 30% · Saisonnalité 20%
    const aggregate = cotScore * 0.5 + sentScore * 0.3 + seasScore * 0.2;

    return cors(
      NextResponse.json(
        {
          symbol,
          seasonality:     toLabel(seasScore),
          retail_long_pct: Math.round(retailLongPct * 10) / 10,
          signal:          toLabel(aggregate),
          score:           Math.round(aggregate * 1000) / 1000,
          timestamp:       new Date().toISOString(),
        },
        { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate" } }
      )
    );
  } catch (err) {
    console.error("[/api/context]", err);
    return cors(NextResponse.json({ error: "internal" }, { status: 500 }));
  }
}
