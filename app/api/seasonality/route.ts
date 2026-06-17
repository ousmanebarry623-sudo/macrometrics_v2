// app/api/seasonality/route.ts
// Retourne les stats de saisonnalité pour toutes les paires G8.
// Source unique : Google Sheets de l'utilisateur (lib/seasonality-sheets.ts).
// Pas de fallback Yahoo Finance — si une paire n'est pas dans le sheet, retourne stats vides.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { kv } from "@/lib/redis";
import { G8_PAIRS, type G8Pair } from "@/lib/g8-pairs";
import {
  PAIR_TO_TAB,
  fetchSheetRaw,
  MONTH_NAMES,
  type YearlyRow,
} from "@/lib/seasonality-sheets";

const REDIS_KEY = "seasonality:g8:v1";
const REDIS_TTL = 6 * 60 * 60; // 6h
const CONCURRENCY = 5;         // limite anti rate-limit Google Sheets

// ── Types ───────────────────────────────────────────────────────────────────
interface MonthStat {
  month: string;
  avg: number; median: number; positive: number;
  best: number; worst: number; count: number;
}
interface SeasonalityResult {
  pair: string; group: string;
  stats: MonthStat[];
  yearlyData: YearlyRow[];
  source: "gsheets" | "none";
}

// ── Calcul des stats mensuelles ──────────────────────────────────────────────
function computeStats(yearlyData: YearlyRow[]): MonthStat[] {
  return MONTH_NAMES.map((month, i) => {
    const vals = yearlyData.map(y => y.returns[i]).filter((v): v is number => v !== null);
    if (!vals.length) return { month, avg: 0, median: 0, positive: 50, best: 0, worst: 0, count: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const avg    = vals.reduce((a, b) => a + b, 0) / vals.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const positive = (vals.filter(v => v > 0).length / vals.length) * 100;
    return {
      month, count: vals.length,
      avg:      parseFloat(avg.toFixed(3)),
      median:   parseFloat(median.toFixed(3)),
      positive: parseFloat(positive.toFixed(1)),
      best:     parseFloat(Math.max(...vals).toFixed(3)),
      worst:    parseFloat(Math.min(...vals).toFixed(3)),
    };
  });
}

async function fetchPair(p: G8Pair): Promise<SeasonalityResult> {
  // Dériver le nom de l'onglet : PAIR_TO_TAB d'abord, sinon label.replace("/","")
  const tab = PAIR_TO_TAB[p.label] ?? p.label.replace("/", "");
  const sheetsData = await fetchSheetRaw(tab);

  if (sheetsData && sheetsData.length > 0) {
    return {
      pair: p.label,
      group: p.group,
      stats: computeStats(sheetsData),
      yearlyData: sheetsData,
      source: "gsheets",
    };
  }

  // Pas de données dans le sheet → stats vides (pas de fallback Yahoo)
  return {
    pair: p.label,
    group: p.group,
    stats: computeStats([]),
    yearlyData: [],
    source: "none",
  };
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function GET() {
  // 1. Cache Redis partagé (survit aux cold starts serverless)
  try {
    const cached = await kv.get<SeasonalityResult[]>(REDIS_KEY);
    if (cached && cached.length > 0) {
      return Response.json(cached, { headers: { "X-Cache": "HIT" } });
    }
  } catch { /* Redis indisponible → continuer */ }

  // 2. Fetch batché (concurrence limitée) pour éviter le rate-limit Google Sheets
  const all: SeasonalityResult[] = [];
  for (let i = 0; i < G8_PAIRS.length; i += CONCURRENCY) {
    const batch = G8_PAIRS.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(fetchPair));
    settled.forEach((r, j) => {
      const p = batch[j];
      all.push(r.status === "fulfilled"
        ? r.value
        : { pair: p.label, group: p.group, stats: computeStats([]), yearlyData: [], source: "none" });
    });
  }

  // 3. Ne cacher que si les données sont quasi-complètes (≥80% gsheets) — évite de figer un résultat partiel
  const ok = all.filter(r => r.source === "gsheets").length;
  if (ok >= Math.floor(G8_PAIRS.length * 0.8)) {
    kv.set(REDIS_KEY, all, { ex: REDIS_TTL }).catch(() => {});
  }

  return Response.json(all, { headers: { "X-Cache": "MISS", "X-OK": String(ok) } });
}
