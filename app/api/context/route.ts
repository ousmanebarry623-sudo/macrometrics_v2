/**
 * GET /api/context?symbol=EURUSD
 *
 * Endpoint consomme par l'EA ELTE PULLBACK v4 via WebRequest().
 * Retourne saisonnalite + sentiment retail dans le format attendu par CheckMacroContext().
 *
 * Reponse JSON:
 *   {
 *     "symbol":         "EURUSD",
 *     "seasonality":    "bullish" | "bearish" | "neutral",
 *     "retail_long_pct": 72.5,          // % retail long (MyFXBook ou 50 si indisponible)
 *     "signal":         "bullish" | "bearish" | "neutral",
 *     "score":          0.28,            // score agregat -1..1
 *     "timestamp":      "2026-06-30T..."
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

// ─── CORS ────────────────────────────────────────────────────────────────────
function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

// ─── Table saisonnalite (biais historique mensuel, ~15 ans) ──────────────────
// +1 = fortement haussier devise base | -1 = fortement baissier
// Index mois: 0=Jan … 11=Dec
const SEASONALITY: Record<string, number[]> = {
  //         Jan    Feb    Mar    Apr    May    Jun    Jul    Aug    Sep    Oct    Nov    Dec
  EURUSD: [  0.3,   0.1,  -0.2,   0.4,   0.2,  -0.3,  -0.1,   0.1,  -0.4,  -0.2,   0.3,   0.1 ],
  GBPUSD: [  0.2,   0.1,  -0.3,   0.3,   0.1,  -0.2,  -0.2,   0.2,  -0.3,  -0.1,   0.2,   0.0 ],
  USDJPY: [ -0.2,  -0.1,   0.3,  -0.3,  -0.1,   0.4,   0.2,  -0.1,   0.5,   0.3,  -0.2,  -0.1 ],
  USDCHF: [ -0.3,  -0.1,   0.2,  -0.4,  -0.2,   0.3,   0.1,  -0.1,   0.4,   0.2,  -0.3,  -0.1 ],
  AUDUSD: [  0.2,   0.3,  -0.1,   0.1,  -0.3,  -0.4,   0.0,  -0.1,  -0.2,   0.2,   0.3,   0.2 ],
  NZDUSD: [  0.2,   0.2,  -0.1,   0.1,  -0.2,  -0.3,  -0.1,  -0.1,  -0.2,   0.1,   0.2,   0.2 ],
  USDCAD: [ -0.1,  -0.2,   0.2,  -0.1,   0.1,   0.3,   0.1,   0.0,   0.3,   0.1,  -0.1,   0.0 ],
  EURGBP: [  0.1,   0.0,   0.1,   0.1,   0.1,  -0.1,   0.1,  -0.1,  -0.1,  -0.1,   0.1,   0.1 ],
  EURJPY: [  0.1,   0.0,   0.1,   0.1,   0.1,   0.1,   0.1,   0.0,   0.1,   0.1,   0.1,   0.0 ],
  GBPJPY: [  0.0,   0.0,   0.0,   0.0,   0.0,   0.2,   0.0,   0.1,   0.2,   0.2,   0.0,  -0.1 ],
  XAUUSD: [  0.4,   0.3,  -0.1,   0.1,  -0.2,  -0.3,   0.1,   0.2,   0.3,   0.1,   0.0,   0.2 ],
  XAGUSD: [  0.3,   0.3,  -0.1,   0.1,  -0.2,  -0.3,   0.1,   0.2,   0.3,   0.1,   0.0,   0.2 ],
};

function seasonalityScore(symbol: string): number {
  const month = new Date().getMonth(); // 0-11
  return SEASONALITY[symbol]?.[month] ?? 0;
}

function scoreToLabel(s: number): "bullish" | "bearish" | "neutral" {
  if (s >  0.15) return "bullish";
  if (s < -0.15) return "bearish";
  return "neutral";
}

// ─── Sentiment retail MyFXBook (optionnel) ────────────────────────────────────
// Si MYFXBOOK_API_KEY + MYFXBOOK_SESSION sont dans les env vars Vercel,
// on fetche les vraies donnees. Sinon on retourne 50 (neutre).
async function fetchRetailLongPct(symbol: string): Promise<number> {
  const session = process.env.MYFXBOOK_SESSION;
  if (!session) return 50; // neutre par defaut

  try {
    const url = `https://www.myfxbook.com/api/get-community-outlook.json?session=${session}`;
    const res  = await fetch(url, { next: { revalidate: 1800 } }); // cache 30 min
    if (!res.ok) return 50;
    const data = await res.json();

    // Structure MyFXBook: data.symbols[].name / .shortPercentage / .longPercentage
    const sym = symbol.replace("XAUUSD", "GOLD").replace("XAGUSD", "SILVER");
    const row = (data?.symbols ?? []).find(
      (s: { name: string }) => s.name.toUpperCase() === sym
    );
    if (!row) return 50;
    return parseFloat(row.longPercentage) || 50;
  } catch {
    return 50;
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";

  if (symbol.length < 6) {
    return cors(
      NextResponse.json({ error: "symbol param required, e.g. ?symbol=EURUSD" }, { status: 400 })
    );
  }

  try {
    const seasScore     = seasonalityScore(symbol);
    const retailLongPct = await fetchRetailLongPct(symbol);

    // Sentiment contrarian: retail > 65% long => bearish signal, < 35% => bullish
    const sentScore =
      retailLongPct > 65 ? -((retailLongPct - 65) / 35) :
      retailLongPct < 35 ?  ((35 - retailLongPct) / 35) : 0;

    // Score agregat: 60% saison + 40% sentiment
    const aggregate = seasScore * 0.6 + sentScore * 0.4;

    const body = {
      symbol,
      seasonality:    scoreToLabel(seasScore),
      retail_long_pct: Math.round(retailLongPct * 10) / 10,
      signal:         scoreToLabel(aggregate),
      score:          Math.round(aggregate * 1000) / 1000,
      timestamp:      new Date().toISOString(),
    };

    return cors(
      NextResponse.json(body, {
        headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate" },
      })
    );
  } catch (err) {
    console.error("[/api/context]", err);
    return cors(NextResponse.json({ error: "internal" }, { status: 500 }));
  }
}
