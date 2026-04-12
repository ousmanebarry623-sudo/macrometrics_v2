export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

interface Candle {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// Module-level cache: key = "symbol|interval|range"
// TTL adaptatif : plus l'intervalle est court, plus les données vieillissent vite
const CACHE = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL_MAP: Record<string, number> = {
  "1m":  60 * 1000,          // 1 min  — 1 candle par minute
  "2m":  90 * 1000,          // 1.5 min
  "5m":  2  * 60 * 1000,     // 2 min
  "15m": 3  * 60 * 1000,     // 3 min
  "30m": 5  * 60 * 1000,     // 5 min
  "60m": 10 * 60 * 1000,     // 10 min
  "90m": 10 * 60 * 1000,     // 10 min
  "1h":  10 * 60 * 1000,     // 10 min
  "1d":  30 * 60 * 1000,     // 30 min
  "5d":  60 * 60 * 1000,     // 1 heure
  "1wk": 60 * 60 * 1000,     // 1 heure
  "1mo": 4  * 60 * 60 * 1000,// 4 heures
  "3mo": 4  * 60 * 60 * 1000,// 4 heures
};
function getCacheTtl(interval: string): number {
  return CACHE_TTL_MAP[interval] ?? 10 * 60 * 1000; // défaut 10 min
}

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
  Referer: "https://finance.yahoo.com/",
};

// Yahoo Finance interval → max range allowed
const INTERVAL_RANGE_MAP: Record<string, string[]> = {
  "1m":  ["1d","2d","5d"],
  "2m":  ["5d","60d"],
  "5m":  ["5d","60d"],
  "15m": ["5d","60d"],
  "30m": ["5d","60d"],
  "60m": ["5d","60d","200d"],
  "90m": ["5d","60d"],
  "1h":  ["5d","60d","200d"],
  "1d":  ["1mo","3mo","6mo","1y","2y","5y","10y"],
  "5d":  ["1mo","3mo","6mo","1y","2y","5y","10y"],
  "1wk": ["3mo","6mo","1y","2y","5y","10y"],
  "1mo": ["6mo","1y","2y","5y","10y"],
  "3mo": ["1y","2y","5y","10y"],
};

async function fetchCandles(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens:   (number | null)[] = quote.open   ?? [];
  const highs:   (number | null)[] = quote.high   ?? [];
  const lows:    (number | null)[] = quote.low    ?? [];
  const closes:  (number | null)[] = quote.close  ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time:   timestamps[i],
      open:   parseFloat(o.toFixed(6)),
      high:   parseFloat(h.toFixed(6)),
      low:    parseFloat(l.toFixed(6)),
      close:  parseFloat(c.toFixed(6)),
      volume: volumes[i] ?? 0,
    });
  }
  return candles;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol   = (searchParams.get("symbol")   ?? "EURUSD=X").trim();
  const interval = (searchParams.get("interval") ?? "1d").trim();
  const range    = (searchParams.get("range")    ?? "1y").trim();

  // Validate interval
  const validIntervals = Object.keys(INTERVAL_RANGE_MAP);
  const safeInterval = validIntervals.includes(interval) ? interval : "1d";

  // Validate range for this interval
  const validRanges = INTERVAL_RANGE_MAP[safeInterval] ?? ["1y"];
  const safeRange   = validRanges.includes(range) ? range : validRanges[validRanges.length - 1];

  const cacheKey = `${symbol}|${safeInterval}|${safeRange}`;
  const ttl = getCacheTtl(safeInterval);
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.ts < ttl) {
    return Response.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const data = await fetchCandles(symbol, safeInterval, safeRange);
    CACHE.set(cacheKey, { data, ts: Date.now() });
    return Response.json(data, {
      headers: { "X-Cache": "MISS", "X-Count": String(data.length) },
    });
  } catch {
    const stale = CACHE.get(cacheKey);
    if (stale) return Response.json(stale.data, { headers: { "X-Cache": "STALE" } });
    return Response.json([], { status: 500 });
  }
}
