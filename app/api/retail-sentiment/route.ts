import { fetchMyfxbookMapWithMeta, setMyfxbookCache } from "@/lib/myfxbook";
import type { MfxSource } from "@/lib/myfxbook";

export const dynamic = "force-dynamic";

export interface RetailSentiment {
  pair:       string;
  longPct:    number;
  shortPct:   number;
  source:     string;
  contrarian: "Buy" | "Sell" | "Neutral";
  note:       string;
  delta?:     number | null;
}

function contrarian(longPct: number): "Buy" | "Sell" | "Neutral" {
  return longPct >= 65 ? "Sell" : longPct <= 35 ? "Buy" : "Neutral";
}

function makeEntry(pair: string, longPct: number, source: string, delta?: number | null): RetailSentiment {
  const shortPct = 100 - longPct;
  const sig      = contrarian(longPct);
  return {
    pair, longPct, shortPct, source, contrarian: sig,
    note: sig !== "Neutral"
      ? `${longPct}% ${longPct >= 65 ? "Long" : "Short"} → Signal ${sig}`
      : "Sentiment equilibre",
    delta: delta ?? null,
  };
}

// ─── DELTA : stockage dans localStorage-like via module cache ─────────────────
let lastWeekCache: { data: Record<string, number>; ts: number } | null = null;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function computeDeltas(
  current: Record<string, number>,
  previous: Record<string, number> | null,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const pair of Object.keys(current)) {
    if (previous && previous[pair] !== undefined) {
      result[pair] = current[pair] - previous[pair];
    } else {
      result[pair] = null;
    }
  }
  return result;
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const result = await fetchMyfxbookMapWithMeta();
    const mfxMap = result.data;

    // Alimenter le cache partagé avec le résultat frais
    setMyfxbookCache(mfxMap);

    // Calculer les deltas (semaine N vs N-1)
    const now = Date.now();
    if (!lastWeekCache || now - lastWeekCache.ts >= WEEK_MS) {
      // Snapshot actuel devient la référence de la semaine passée
      if (Object.keys(mfxMap).length > 0) {
        lastWeekCache = { data: { ...mfxMap }, ts: now };
      }
    }
    const deltas = computeDeltas(mfxMap, lastWeekCache?.data ?? null);

    // Convertir le map → RetailSentiment[]
    const all: RetailSentiment[] = Object.entries(mfxMap).map(([pair, longPct]) =>
      makeEntry(pair, longPct, result.source === "dukascopy" ? "Dukascopy SWFX" : "MyFXBook", deltas[pair])
    );

    // Mettre XAU/USD en premier
    all.sort((a, b) => {
      if (a.pair === "XAU/USD") return -1;
      if (b.pair === "XAU/USD") return 1;
      if (a.pair === "XAG/USD") return -1;
      if (b.pair === "XAG/USD") return 1;
      return 0;
    });

    const responseData = {
      data: all,
      meta: {
        source: result.source as MfxSource,
        stale: result.stale,
        pairsCount: all.length,
        fetchedAt: new Date().toISOString(),
        error: result.error || null,
      },
    };

    return Response.json(responseData, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
        "X-Source": result.source,
        "X-Pairs-Count": String(all.length),
      },
    });
  } catch (err) {
    console.error("[retail-sentiment] Fatal error:", err instanceof Error ? err.message : err);
    return Response.json(
      {
        data: [],
        meta: { source: "none", stale: true, pairsCount: 0, fetchedAt: new Date().toISOString(), error: "Erreur serveur" },
      },
      { status: 500 }
    );
  }
}
