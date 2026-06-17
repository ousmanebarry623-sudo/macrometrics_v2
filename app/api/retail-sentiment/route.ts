import { fetchMyfxbookMap, setMyfxbookCache } from "@/lib/myfxbook";
import { PAIR_TO_TAB } from "@/lib/seasonality-sheets";

export const dynamic = "force-dynamic";

// Paires présentes dans le Google Sheet — seules celles-ci sont affichées
const SHEET_PAIRS = new Set(Object.keys(PAIR_TO_TAB));

export interface RetailSentiment {
  pair:       string;
  longPct:    number;
  shortPct:   number;
  source:     string;
  contrarian: "Buy" | "Sell" | "Neutral";
  note:       string;
}

function contrarian(longPct: number): "Buy" | "Sell" | "Neutral" {
  // Neutre seulement dans la bande 40–60 % ; au-delà = signal contrarian.
  return longPct > 60 ? "Sell" : longPct < 40 ? "Buy" : "Neutral";
}

function makeEntry(pair: string, longPct: number, source: string): RetailSentiment {
  const shortPct = 100 - longPct;
  const sig      = contrarian(longPct);
  return {
    pair, longPct, shortPct, source, contrarian: sig,
    note: sig !== "Neutral"
      ? `${longPct}% ${longPct > 60 ? "Long" : "Short"} → Signal ${sig}`
      : "Sentiment équilibré",
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function GET() {
  const mfxMap = await fetchMyfxbookMap();

  // Alimenter le cache partagé avec le résultat frais
  setMyfxbookCache(mfxMap);

  // Convertir le map MyFXBook → RetailSentiment[]
  // Filtre : uniquement les paires présentes dans le Google Sheet
  const all: RetailSentiment[] = Object.entries(mfxMap)
    .filter(([pair]) => SHEET_PAIRS.has(pair))
    .map(([pair, longPct]) => makeEntry(pair, longPct, "MyFXBook"));

  return Response.json(all);
}
