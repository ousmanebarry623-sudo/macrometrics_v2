import { fetchMyfxbookMap, setMyfxbookCache } from "@/lib/myfxbook";

export const dynamic = "force-dynamic";

export interface RetailSentiment {
  pair:       string;
  longPct:    number;
  shortPct:   number;
  source:     string;
  contrarian: "Buy" | "Sell" | "Neutral";
  note:       string;
}

function contrarian(longPct: number): "Buy" | "Sell" | "Neutral" {
  return longPct >= 65 ? "Sell" : longPct <= 35 ? "Buy" : "Neutral";
}

function makeEntry(pair: string, longPct: number, source: string): RetailSentiment {
  const shortPct = 100 - longPct;
  const sig      = contrarian(longPct);
  return {
    pair, longPct, shortPct, source, contrarian: sig,
    note: sig !== "Neutral"
      ? `${longPct}% ${longPct >= 65 ? "Long" : "Short"} → Signal ${sig}`
      : "Sentiment équilibré",
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function GET() {
  const mfxMap = await fetchMyfxbookMap();

  // Alimenter le cache partagé avec le résultat frais
  setMyfxbookCache(mfxMap);

  // Convertir le map MyFXBook → RetailSentiment[] (toutes les paires disponibles)
  const all: RetailSentiment[] = Object.entries(mfxMap).map(([pair, longPct]) =>
    makeEntry(pair, longPct, "MyFXBook")
  );

  return Response.json(all);
}
