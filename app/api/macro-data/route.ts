import { NextResponse } from "next/server";
import { fetchAllMacroData, CENTRAL_BANKS_FALLBACK, computeFXMacro, type CountryMacro } from "@/lib/trading-economics";
import { kv } from "@/lib/redis";

const REDIS_MACRO_KEY = "macro:override:v1";

export const dynamic = "force-dynamic";

// G8 FX pairs to compute macro scores for
const FX_PAIRS: [string, string][] = [
  ["EU","US"],["GB","US"],["US","JP"],["US","CH"],["US","CA"],
  ["AU","US"],["NZ","US"],["EU","GB"],["EU","JP"],["GB","JP"],
  ["AU","JP"],["NZ","JP"],["EU","CA"],["GB","CA"],["AU","CA"],
];

export async function GET(req: Request) {
  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? "all";

  try {
    let countries = await fetchAllMacroData();

    // Apply Redis manual overrides (server-only — highest priority)
    try {
      const overrides = await kv.get<Record<string, Partial<CountryMacro>>>(REDIS_MACRO_KEY);
      if (overrides) {
        countries = countries.map(c => {
          const ov = overrides[c.code];
          return ov ? { ...c, ...ov, source: "live" as const } : c;
        });
      }
    } catch { /* Redis not available — use fallback */ }

    const byCode: Record<string, CountryMacro> = Object.fromEntries(countries.map(c => [c.code, c]));

    if (type === "countries") {
      return NextResponse.json(countries);
    }

    if (type === "central-banks") {
      return NextResponse.json(CENTRAL_BANKS_FALLBACK);
    }

    if (type === "fx-scores") {
      const scores = FX_PAIRS
        .filter(([b, q]) => byCode[b] && byCode[q])
        .map(([b, q]) => computeFXMacro(byCode[b], byCode[q]));
      return NextResponse.json(scores);
    }

    // type === "all"
    const fxScores = FX_PAIRS
      .filter(([b, q]) => byCode[b] && byCode[q])
      .map(([b, q]) => computeFXMacro(byCode[b], byCode[q]));

    return NextResponse.json({
      countries,
      centralBanks: CENTRAL_BANKS_FALLBACK,
      fxScores,
      source:       countries[0]?.source ?? "fallback",
      updatedAt:    new Date().toISOString(),
    });

  } catch {
    return NextResponse.json(
      { error: "Erreur chargement données macro", countries: [], centralBanks: [], fxScores: [] },
      { status: 500 }
    );
  }
}
