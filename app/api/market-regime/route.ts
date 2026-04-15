import { kv } from "@/lib/redis";
import {
  percentileRank,
  currentWeeklyReturn,
  rollingWeeklyReturns,
  classifyRegime,
  computeComposite,
  computeConfidence,
  detectDivergences,
  WEIGHTS,
  RegimeSnapshot,
} from "@/lib/market-regime";

export const dynamic = "force-dynamic";

// ── Redis keys ────────────────────────────────────────────────────────────────

const KEYS = {
  indicators: "regime:indicators",
  history:    "regime:history",
} as const;

const INDICATOR_TTL = 30 * 60;          // 30-min cache for raw indicators
const HISTORY_TTL   = 366 * 24 * 3600;  // 1-year TTL for history array
const MAX_HISTORY   = 365;
const MIN_SNAP_MS   = 30 * 60 * 1000;   // 30-min dedup guard

// ── Yahoo Finance data fetcher ────────────────────────────────────────────────

interface YFResult {
  latest: number;
  closes: number[]; // 1-year daily closes
}

async function fetchYF(symbol: string): Promise<YFResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMetrics/1.0)" },
      cache:   "no-store",
      signal:  AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const json   = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? [])
      .filter((v: unknown): v is number => typeof v === "number" && !isNaN(v));
    if (closes.length < 10) return null;
    return { closes, latest: closes[closes.length - 1] };
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<number | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      cache:  "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const val  = json?.data?.[0]?.value;
    return val !== undefined ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

// ── Cached indicator fetch ────────────────────────────────────────────────────

interface CachedIndicators {
  vix:    YFResult | null;
  sp500:  YFResult | null;
  dxy:    YFResult | null;
  skew:   YFResult | null;
  gold:   YFResult | null;
  us10y:  YFResult | null;
  fg:     number | null;
  fetchedAt: number;
}

async function getIndicators(): Promise<CachedIndicators> {
  // Try Redis cache first
  try {
    const cached = await kv.get<CachedIndicators>(KEYS.indicators);
    if (cached) return cached;
  } catch { /* Redis miss — fetch fresh */ }

  // Parallel fetch all sources
  const [vix, sp500, dxy, skew, gold, us10y, fg] = await Promise.all([
    fetchYF("^VIX"),
    fetchYF("^GSPC"),
    fetchYF("DX-Y.NYB"),
    fetchYF("^SKEW"),
    fetchYF("GC=F"),
    fetchYF("^TNX"),
    fetchFearGreed(),
  ]);

  const result: CachedIndicators = { vix, sp500, dxy, skew, gold, us10y, fg, fetchedAt: Date.now() };

  // Cache for 30 min (best-effort)
  kv.set(KEYS.indicators, result, { ex: INDICATOR_TTL }).catch(() => {});

  return result;
}

// ── Score builders ────────────────────────────────────────────────────────────

function buildVixScore(data: YFResult | null): number {
  if (!data) return 50;
  // High VIX percentile → low Risk-On score (inverted)
  const pct = percentileRank(data.latest, data.closes.slice(0, -1));
  return Math.round(100 - pct);
}

function buildEquityScore(data: YFResult | null): number {
  if (!data) return 50;
  const ret  = currentWeeklyReturn(data.closes);
  if (ret === null) return 50;
  const hist = rollingWeeklyReturns(data.closes);
  return percentileRank(ret, hist);
}

function buildUsdScore(data: YFResult | null): number {
  if (!data) return 50;
  const ret  = currentWeeklyReturn(data.closes);
  if (ret === null) return 50;
  const hist = rollingWeeklyReturns(data.closes);
  // High DXY return percentile → Risk-Off → low score (inverted)
  return Math.round(100 - percentileRank(ret, hist));
}

function buildOptionsScore(data: YFResult | null): number {
  if (!data) return 50;
  // High SKEW → tail-risk fear → Risk-Off → low score (inverted)
  const pct = percentileRank(data.latest, data.closes.slice(0, -1));
  return Math.round(100 - pct);
}

// ── Public response type ──────────────────────────────────────────────────────

export interface MarketRegimeResponse {
  snapshot:   RegimeSnapshot;
  history:    Pick<RegimeSnapshot, "ts" | "composite" | "regime" | "vixScore" | "equityScore" | "usdScore" | "optionsScore" | "newsScore">[];
  indicators: {
    vix:           number | null;
    sp500:         number | null;
    sp500Change1w: number | null;
    dxy:           number | null;
    dxyChange1w:   number | null;
    skew:          number | null;
    fearGreed:     number | null;
    gold:          number | null;
    us10y:         number | null;
  };
  weights:    typeof WEIGHTS;
  updatedAt:  number;
  error?:     string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const ind = await getIndicators();

    // Build sub-scores (all 0–100, high = Risk-On)
    const vixScore     = buildVixScore(ind.vix);
    const equityScore  = buildEquityScore(ind.sp500);
    const usdScore     = buildUsdScore(ind.dxy);
    const optionsScore = buildOptionsScore(ind.skew);
    const newsScore    = ind.fg ?? 50;

    const composite  = computeComposite(vixScore, equityScore, usdScore, optionsScore, newsScore);
    const regime     = classifyRegime(composite);
    const confidence = computeConfidence([vixScore, equityScore, usdScore, optionsScore, newsScore]);
    const divergences = detectDivergences(vixScore, equityScore, usdScore, optionsScore, newsScore);

    const sp500Change1w = ind.sp500 ? currentWeeklyReturn(ind.sp500.closes) : null;
    const dxyChange1w   = ind.dxy   ? currentWeeklyReturn(ind.dxy.closes)   : null;

    const snapshot: RegimeSnapshot = {
      ts: Date.now(),
      composite,
      regime,
      confidence,
      vixScore, equityScore, usdScore, optionsScore, newsScore,
      vix:           ind.vix?.latest   ?? null,
      sp500Change1w,
      dxyChange1w,
      skew:          ind.skew?.latest  ?? null,
      fearGreed:     ind.fg,
      divergences,
    };

    // Append to Redis history (deduped, trimmed)
    let history: RegimeSnapshot[] = [];
    try {
      history = (await kv.get<RegimeSnapshot[]>(KEYS.history)) ?? [];
    } catch { /* ok */ }

    const last = history[history.length - 1];
    if (!last || Date.now() - last.ts >= MIN_SNAP_MS) {
      history.push(snapshot);
      kv.set(KEYS.history, history.slice(-MAX_HISTORY), { ex: HISTORY_TTL }).catch(() => {});
    }

    // Return lightweight history for chart (last 90 days, minimal fields)
    const chartHistory = history.slice(-90).map(s => ({
      ts: s.ts, composite: s.composite, regime: s.regime,
      vixScore: s.vixScore, equityScore: s.equityScore,
      usdScore: s.usdScore, optionsScore: s.optionsScore, newsScore: s.newsScore,
    }));

    return Response.json({
      snapshot,
      history: chartHistory,
      indicators: {
        vix:           ind.vix?.latest   ?? null,
        sp500:         ind.sp500?.latest ?? null,
        sp500Change1w,
        dxy:           ind.dxy?.latest   ?? null,
        dxyChange1w,
        skew:          ind.skew?.latest  ?? null,
        fearGreed:     ind.fg,
        gold:          ind.gold?.latest  ?? null,
        us10y:         ind.us10y?.latest ?? null,
      },
      weights:   WEIGHTS,
      updatedAt: Date.now(),
    } satisfies MarketRegimeResponse);

  } catch (err) {
    return Response.json(
      { snapshot: null, history: [], indicators: {}, weights: WEIGHTS, updatedAt: Date.now(), error: String(err) },
      { status: 500 }
    );
  }
}
