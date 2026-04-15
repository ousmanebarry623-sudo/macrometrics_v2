// Retail Sentiment Pro — History storage, delta computation, scoring & divergence detection
import { kv } from "@/lib/redis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SentimentPoint {
  ts: number;      // Unix milliseconds
  longPct: number; // 0–100
}

export type SentimentZone =
  | "EXTREME_LONG"   // longPct ≥ 70  → contrarian SELL
  | "LEANING_LONG"   // longPct 55–69
  | "NEUTRAL"        // longPct 45–54
  | "LEANING_SHORT"  // longPct 30–44
  | "EXTREME_SHORT"; // longPct ≤ 29  → contrarian BUY

export interface SentimentDeltas {
  d24h: number | null;
  d48h: number | null;
  d7d:  number | null;
  d30d: number | null;
}

export interface DivergenceResult {
  signal:   "BULLISH" | "BEARISH" | null;
  strength: number; // 0–100
}

// ── Redis key helpers ─────────────────────────────────────────────────────────

function historyKey(pair: string): string {
  // "EUR/USD" → "rsp:history:EURUSD"
  return `rsp:history:${pair.replace(/\//g, "")}`;
}

// ── Snapshot persistence ──────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 min dedup guard
const MAX_ENTRIES     = 720;             // ≈7.5 days @ 15-min cadence
const HISTORY_TTL_S   = 32 * 24 * 3600; // 32 days

export async function saveSentimentSnapshot(
  map: Record<string, number>
): Promise<void> {
  const now = Date.now();
  await Promise.allSettled(
    Object.entries(map).map(async ([pair, longPct]) => {
      const key  = historyKey(pair);
      const hist: SentimentPoint[] = (await kv.get<SentimentPoint[]>(key)) ?? [];

      // Skip if the last snapshot is too recent
      const last = hist[hist.length - 1];
      if (last && now - last.ts < MIN_INTERVAL_MS) return;

      hist.push({ ts: now, longPct });
      await kv.set(key, hist.slice(-MAX_ENTRIES), { ex: HISTORY_TTL_S });
    })
  );
}

export async function getSentimentHistory(pair: string): Promise<SentimentPoint[]> {
  try {
    return (await kv.get<SentimentPoint[]>(historyKey(pair))) ?? [];
  } catch {
    return [];
  }
}

// ── Delta computation ─────────────────────────────────────────────────────────

function nearestPoint(
  history: SentimentPoint[],
  targetTs: number,
  toleranceMs = 2 * 3600 * 1000
): SentimentPoint | null {
  let best: SentimentPoint | null = null;
  let bestDist = Infinity;
  for (const p of history) {
    const dist = Math.abs(p.ts - targetTs);
    if (dist < toleranceMs && dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function computeDeltas(
  history: SentimentPoint[],
  currentLong: number
): SentimentDeltas {
  const now = Date.now();
  const h = (hrs: number) => nearestPoint(history, now - hrs * 3_600_000)?.longPct ?? null;

  const ago24  = h(24);
  const ago48  = h(48);
  const ago168 = h(24 * 7);   // 7 days
  const ago720 = h(24 * 30);  // 30 days

  return {
    d24h: ago24  !== null ? Math.round((currentLong - ago24)  * 10) / 10 : null,
    d48h: ago48  !== null ? Math.round((currentLong - ago48)  * 10) / 10 : null,
    d7d:  ago168 !== null ? Math.round((currentLong - ago168) * 10) / 10 : null,
    d30d: ago720 !== null ? Math.round((currentLong - ago720) * 10) / 10 : null,
  };
}

// ── Zone classification ───────────────────────────────────────────────────────

export function computeZone(longPct: number): SentimentZone {
  if (longPct >= 70) return "EXTREME_LONG";
  if (longPct >= 55) return "LEANING_LONG";
  if (longPct >= 45) return "NEUTRAL";
  if (longPct >= 30) return "LEANING_SHORT";
  return "EXTREME_SHORT";
}

// ── Composite sentiment score (0–100) ────────────────────────────────────────
//
// High score (≥70) = retail heavily short → contrarian BUY opportunity
// Low score  (≤30) = retail heavily long  → contrarian SELL opportunity
// Mid score  (45–55) = neutral
//
// Formula:
//   base      = shortPct  (= 100 - longPct)
//   d7d boost = –d7d × 0.5   (longs rising fast → sell signal strengthens → score ↓)
//   d24h boost= –d24h × 0.2  (momentum fine-tune)
// ─────────────────────────────────────────────────────────────────────────────
export function computeScore(
  longPct: number,
  d24h:    number | null,
  d7d:     number | null
): number {
  let score = 100 - longPct;
  if (d7d  !== null) score -= d7d  * 0.5;
  if (d24h !== null) score -= d24h * 0.2;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreDirection(score: number): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (score >= 60) return "BULLISH";
  if (score <= 40) return "BEARISH";
  return "NEUTRAL";
}

// ── Divergence detection ──────────────────────────────────────────────────────
//
// BULLISH divergence : price rises  + retail adds shorts (d24h < –3)
//   → institutions absorbing retail shorts → likely continuation up
//
// BEARISH divergence : price falls  + retail adds longs  (d24h >  3)
//   → institutions distributing to retail buyers → likely continuation down
// ─────────────────────────────────────────────────────────────────────────────
export function detectDivergence(
  priceChange24hPct: number | null,
  d24h:              number | null
): DivergenceResult {
  if (priceChange24hPct === null || d24h === null) return { signal: null, strength: 0 };

  if (priceChange24hPct > 0.2 && d24h < -3) {
    const strength = Math.min(100, Math.round(priceChange24hPct * 20 + Math.abs(d24h) * 3));
    return { signal: "BULLISH", strength };
  }
  if (priceChange24hPct < -0.2 && d24h > 3) {
    const strength = Math.min(100, Math.round(Math.abs(priceChange24hPct) * 20 + d24h * 3));
    return { signal: "BEARISH", strength };
  }
  return { signal: null, strength: 0 };
}
