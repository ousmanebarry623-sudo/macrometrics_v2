import { fetchMyfxbookMap, setMyfxbookCache } from "@/lib/myfxbook";
import {
  saveSentimentSnapshot,
  getSentimentHistory,
  computeDeltas,
  computeZone,
  computeScore,
  scoreDirection,
  detectDivergence,
  SentimentPoint,
  SentimentZone,
} from "@/lib/sentiment-history";

export const dynamic = "force-dynamic";

// ── Yahoo Finance symbol map ──────────────────────────────────────────────────

const YF_SYMBOL: Record<string, string> = {
  "EUR/USD": "EURUSD=X", "GBP/USD": "GBPUSD=X", "USD/JPY": "USDJPY=X",
  "USD/CHF": "USDCHF=X", "USD/CAD": "USDCAD=X", "AUD/USD": "AUDUSD=X",
  "NZD/USD": "NZDUSD=X", "EUR/GBP": "EURGBP=X", "EUR/JPY": "EURJPY=X",
  "EUR/CHF": "EURCHF=X", "EUR/CAD": "EURCAD=X", "EUR/AUD": "EURAUD=X",
  "EUR/NZD": "EURNZD=X", "GBP/JPY": "GBPJPY=X", "GBP/CHF": "GBPCHF=X",
  "GBP/CAD": "GBPCAD=X", "GBP/AUD": "GBPAUD=X", "GBP/NZD": "GBPNZD=X",
  "AUD/JPY": "AUDJPY=X", "AUD/CAD": "AUDCAD=X", "AUD/NZD": "AUDNZD=X",
  "NZD/JPY": "NZDJPY=X", "CAD/JPY": "CADJPY=X", "CHF/JPY": "CHFJPY=X",
  "XAU/USD": "GC=F",     "XAG/USD": "SI=F",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PricePoint {
  ts:    number;
  close: number;
}

export interface EnhancedSentiment {
  pair:    string;
  longPct: number;
  shortPct: number;
  // Deltas (null when history too sparse)
  d24h: number | null;
  d48h: number | null;
  d7d:  number | null;
  d30d: number | null;
  // Classification
  zone:      SentimentZone;
  score:     number;   // 0–100 (high = bullish contrarian)
  scoreDir:  "BULLISH" | "BEARISH" | "NEUTRAL";
  contrarian: "Buy" | "Sell" | "Neutral";
  // Price
  price:         number | null;
  priceChange24h: number | null;  // % change
  // Divergence
  divergence:         "BULLISH" | "BEARISH" | null;
  divergenceStrength: number;
  // Raw history for charts
  sentimentHistory: SentimentPoint[];
  priceHistory:     PricePoint[];
}

export interface RetailSentimentProResponse {
  data:      EnhancedSentiment[];
  updatedAt: number;
  error?:    string;
}

// ── Price fetcher (Yahoo Finance) ─────────────────────────────────────────────

interface PriceResult {
  current:       number;
  change24hPct:  number;
  history:       PricePoint[];
}

async function fetchYFPrice(pair: string): Promise<PriceResult | null> {
  const sym = YF_SYMBOL[pair];
  if (!sym) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1mo`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      cache:   "no-store",
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json    = await res.json();
    const result  = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[]     = result.indicators?.quote?.[0]?.close ?? [];
    if (closes.length < 2) return null;

    const history: PricePoint[] = timestamps
      .map((ts, i) => ({ ts: ts * 1000, close: closes[i] }))
      .filter(p => p.close != null && !isNaN(p.close));

    const last = history[history.length - 1]?.close;
    const prev = history[history.length - 2]?.close;
    const change24hPct = last && prev ? ((last - prev) / prev) * 100 : 0;

    return { current: last, change24hPct, history };
  } catch {
    return null;
  }
}

// ── Contrarian label ──────────────────────────────────────────────────────────

function contrarianLabel(longPct: number): "Buy" | "Sell" | "Neutral" {
  if (longPct >= 65) return "Sell";
  if (longPct <= 35) return "Buy";
  return "Neutral";
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Fetch live sentiment from MyFXBook (multi-tier cache: mem → Redis → API → scrape)
    const mfxMap = await fetchMyfxbookMap();
    setMyfxbookCache(mfxMap);

    if (Object.keys(mfxMap).length === 0) {
      return Response.json({ data: [], updatedAt: Date.now(), error: "No sentiment data available" } satisfies RetailSentimentProResponse);
    }

    // 2. Persist snapshot (deduped, Redis-backed)
    await saveSentimentSnapshot(mfxMap);

    // 3. Fetch history + prices in parallel
    const pairs   = Object.keys(mfxMap);
    const [histories, priceResults] = await Promise.all([
      Promise.all(pairs.map(p => getSentimentHistory(p))),
      Promise.allSettled(pairs.map(p => fetchYFPrice(p))),
    ]);

    // 4. Build enhanced rows
    const data: EnhancedSentiment[] = pairs.map((pair, i) => {
      const longPct    = mfxMap[pair];
      const shortPct   = 100 - longPct;
      const history    = histories[i];
      const pr         = priceResults[i];
      const priceData  = pr.status === "fulfilled" ? pr.value : null;

      const deltas = computeDeltas(history, longPct);
      const zone   = computeZone(longPct);
      const score  = computeScore(longPct, deltas.d24h, deltas.d7d);
      const div    = detectDivergence(priceData?.change24hPct ?? null, deltas.d24h);

      return {
        pair,
        longPct,
        shortPct,
        d24h: deltas.d24h,
        d48h: deltas.d48h,
        d7d:  deltas.d7d,
        d30d: deltas.d30d,
        zone,
        score,
        scoreDir:           scoreDirection(score),
        contrarian:         contrarianLabel(longPct),
        price:              priceData?.current ?? null,
        priceChange24h:     priceData?.change24hPct ?? null,
        divergence:         div.signal,
        divergenceStrength: div.strength,
        sentimentHistory:   history,
        priceHistory:       priceData?.history ?? [],
      };
    });

    // Sort by score extremity (most actionable contrarian signals first)
    data.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

    return Response.json({ data, updatedAt: Date.now() } satisfies RetailSentimentProResponse);
  } catch (err) {
    return Response.json(
      { data: [], updatedAt: Date.now(), error: String(err) } satisfies RetailSentimentProResponse,
      { status: 500 }
    );
  }
}
