// lib/ohlcv-fetch.ts
// Fetch OHLCV candles from Yahoo Finance v8 API for D1, H4, H1 timeframes.
// Yahoo Finance FX symbols: EURUSD=X, GBPUSD=X, etc.
// Commodities: GC=F (Gold), SI=F (Silver), CL=F (WTI), HG=F (Copper)
// Indices: DX-Y.NYB (DXY), ^VIX

export interface OHLCV {
  time:  number;
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface MultiTFOHLCV {
  d1: OHLCV[];
  h4: OHLCV[];
  h1: OHLCV[];
}

// Maps from pair label (as used in signal-analysis) to Yahoo Finance symbol
export const YF_SYMBOL_MAP: Record<string, string> = {
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  "USD/JPY": "JPY=X",
  "USD/CHF": "CHF=X",
  "USD/CAD": "CAD=X",
  "AUD/USD": "AUDUSD=X",
  "NZD/USD": "NZDUSD=X",
  "EUR/GBP": "EURGBP=X",
  "EUR/JPY": "EURJPY=X",
  "EUR/CAD": "EURCAD=X",
  "EUR/AUD": "EURAUD=X",
  "EUR/CHF": "EURCHF=X",
  "EUR/NZD": "EURNZD=X",
  "GBP/JPY": "GBPJPY=X",
  "GBP/AUD": "GBPAUD=X",
  "GBP/CAD": "GBPCAD=X",
  "GBP/NZD": "GBPNZD=X",
  "GBP/CHF": "GBPCHF=X",
  "AUD/JPY": "AUDJPY=X",
  "AUD/NZD": "AUDNZD=X",
  "AUD/CAD": "AUDCAD=X",
  "AUD/CHF": "AUDCHF=X",
  "NZD/JPY": "NZDJPY=X",
  "NZD/CAD": "NZDCAD=X",
  "NZD/CHF": "NZDCHF=X",
  "CAD/JPY": "CADJPY=X",
  "CAD/CHF": "CADCHF=X",
  "CHF/JPY": "CHFJPY=X",
  "USD/MXN": "MXN=X",
  "XAU/USD": "GC=F",
  "XAG/USD": "SI=F",
  "WTI":     "CL=F",
};

/**
 * Fetch OHLCV candles from Yahoo Finance v8 chart API.
 */
export async function fetchYahooOHLCV(
  symbol:   string,
  interval: string,
  range:    string,
): Promise<OHLCV[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMetrics/1.0)" },
    cache:   "no-store",
    signal:  AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`YF OHLCV fetch failed for ${symbol}: ${res.status}`);
  }

  const json   = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[]  = result.timestamp                          ?? [];
  const q         = result.indicators?.quote?.[0]                        ?? {};
  const opens:  number[] = q.open  ?? [];
  const highs:  number[] = q.high  ?? [];
  const lows:   number[] = q.low   ?? [];
  const closes: number[] = q.close ?? [];

  const candles: OHLCV[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (
      typeof o !== "number" || isNaN(o) ||
      typeof h !== "number" || isNaN(h) ||
      typeof l !== "number" || isNaN(l) ||
      typeof c !== "number" || isNaN(c)
    ) continue;
    candles.push({ time: timestamps[i] * 1000, open: o, high: h, low: l, close: c });
  }

  return candles;
}

/**
 * Aggregate H1 candles into H4 candles.
 * Groups consecutive 4 H1 candles: open=first, high=max, low=min, close=last, time=first.
 */
export function aggregateToH4(h1Candles: OHLCV[]): OHLCV[] {
  const h4: OHLCV[] = [];
  for (let i = 0; i + 3 < h1Candles.length; i += 4) {
    const group = h1Candles.slice(i, i + 4);
    h4.push({
      time:  group[0].time,
      open:  group[0].open,
      high:  Math.max(...group.map(c => c.high)),
      low:   Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
    });
  }
  return h4;
}

/**
 * Fetch D1, H4 (aggregated from H1), and H1 candles for a given Yahoo Finance symbol.
 */
export async function fetchMultiTF(yfSymbol: string): Promise<MultiTFOHLCV> {
  const [d1, h1_1mo, h1_2wk] = await Promise.all([
    fetchYahooOHLCV(yfSymbol, "1d",  "3mo").catch(() => [] as OHLCV[]),
    fetchYahooOHLCV(yfSymbol, "1h",  "1mo").catch(() => [] as OHLCV[]),
    fetchYahooOHLCV(yfSymbol, "1h",  "2wk").catch(() => [] as OHLCV[]),
  ]);

  return {
    d1,
    h4: aggregateToH4(h1_1mo),
    h1: h1_2wk,
  };
}
