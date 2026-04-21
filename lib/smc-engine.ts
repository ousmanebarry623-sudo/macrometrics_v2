// lib/smc-engine.ts
// Smart Money Concepts engine: BOS/CHoCH detection + Order Block identification.
// All computation is pure-function, deterministic, no external I/O.

import type { OHLCV, MultiTFOHLCV } from "./ohlcv-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SMCResult {
  structure:    "BULLISH" | "BEARISH" | "RANGING";
  lastEvent:    "BOS" | "CHOCH" | "NONE";
  lastEventAge: number;         // number of D1 candles since the event
  orderBlock: {
    valid:     boolean;
    direction: "BUY" | "SELL";
    high:      number;
    low:       number;
    mid:       number;
    age:       number;          // number of H4 candles since OB formed
  } | null;
  ema50H1:      number;
  atrD1:        number;
  currentPrice: number;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

export function computeATR(candles: OHLCV[], period = 14): number {
  if (candles.length < 2) return 0;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c    = candles[i];
    const prev = candles[i - 1];
    const tr   = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
    trs.push(tr);
  }

  if (trs.length < period) {
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

export function computeEMA(candles: OHLCV[], period: number): number {
  if (candles.length < period) {
    return candles.reduce((a, c) => a + c.close, 0) / candles.length || 0;
  }

  const k      = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((a, c) => a + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

export function findSwingHighs(candles: OHLCV[], lookback = 3): number[] {
  const idx: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= candles[i].high) { isHigh = false; break; }
    }
    if (isHigh) idx.push(i);
  }
  return idx;
}

export function findSwingLows(candles: OHLCV[], lookback = 3): number[] {
  const idx: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= candles[i].low) { isLow = false; break; }
    }
    if (isLow) idx.push(i);
  }
  return idx;
}

export function detectStructure(candles: OHLCV[]): {
  structure:    "BULLISH" | "BEARISH" | "RANGING";
  lastEvent:    "BOS" | "CHOCH" | "NONE";
  lastEventAge: number;
} {
  const slice = candles.slice(-50);
  const atr   = computeATR(slice);

  const swingHighIdx = findSwingHighs(slice, 3);
  const swingLowIdx  = findSwingLows(slice,  3);

  type Pivot = { idx: number; type: "HIGH" | "LOW"; price: number };
  const pivots: Pivot[] = [
    ...swingHighIdx.map(i => ({ idx: i, type: "HIGH" as const, price: slice[i].high })),
    ...swingLowIdx.map( i => ({ idx: i, type: "LOW"  as const, price: slice[i].low  })),
  ].sort((a, b) => a.idx - b.idx);

  const significant = pivots.filter((p, i) => {
    if (i === 0) return true;
    const prev = pivots[i - 1];
    return Math.abs(p.price - prev.price) > atr * 0.5;
  });

  const last4 = significant.slice(-4);
  const lastN  = slice.length - 1;

  let structure:    "BULLISH" | "BEARISH" | "RANGING" = "RANGING";
  let lastEvent:    "BOS" | "CHOCH" | "NONE"          = "NONE";
  let lastEventAge  = 0;

  if (last4.length >= 4) {
    const [p1, p2, p3, p4] = last4;

    const isBullish =
      p1.type === "LOW"  && p2.type === "HIGH" &&
      p3.type === "LOW"  && p4.type === "HIGH" &&
      p3.price > p1.price && p4.price > p2.price;

    const isBearish =
      p1.type === "HIGH" && p2.type === "LOW"  &&
      p3.type === "HIGH" && p4.type === "LOW"  &&
      p3.price < p1.price && p4.price < p2.price;

    if (isBullish) structure = "BULLISH";
    else if (isBearish) structure = "BEARISH";

    const lastHigh = significant.filter(p => p.type === "HIGH").at(-1);
    const lastLow  = significant.filter(p => p.type === "LOW").at(-1);
    const lastClose = slice[lastN].close;

    if (structure === "BULLISH" && lastHigh) {
      if (lastClose > lastHigh.price) {
        lastEvent    = "BOS";
        lastEventAge = lastN - lastHigh.idx;
      } else if (lastLow && lastClose < lastLow.price) {
        lastEvent    = "CHOCH";
        lastEventAge = lastN - lastLow.idx;
      }
    } else if (structure === "BEARISH" && lastLow) {
      if (lastClose < lastLow.price) {
        lastEvent    = "BOS";
        lastEventAge = lastN - lastLow.idx;
      } else if (lastHigh && lastClose > lastHigh.price) {
        lastEvent    = "CHOCH";
        lastEventAge = lastN - lastHigh.idx;
      }
    }
  }

  return { structure, lastEvent, lastEventAge };
}

export function detectOrderBlock(
  candles: OHLCV[],
  direction: "BUY" | "SELL",
  atr: number,
): { valid: boolean; high: number; low: number; mid: number; age: number } | null {
  const threshold = atr * 1.5;
  const slice     = candles.slice(-80);

  for (let i = slice.length - 3; i >= 0; i--) {
    const ob    = slice[i];
    const next  = slice[i + 1];

    if (direction === "BUY") {
      if (ob.close >= ob.open) continue;
      const impulse = next.close - ob.close;
      if (impulse < threshold) continue;

      const obHigh = ob.high;
      const obLow  = ob.low;
      let retested = false;
      for (let j = i + 1; j < slice.length; j++) {
        if (slice[j].close <= obHigh && slice[j].close >= obLow) {
          retested = true;
          break;
        }
      }
      if (retested) continue;

      const mid = (obHigh + obLow) / 2;
      const age = slice.length - 1 - i;
      return { valid: true, high: obHigh, low: obLow, mid, age };

    } else {
      if (ob.close <= ob.open) continue;
      const impulse = ob.close - next.close;
      if (impulse < threshold) continue;

      const obHigh = ob.high;
      const obLow  = ob.low;
      let retested = false;
      for (let j = i + 1; j < slice.length; j++) {
        if (slice[j].close <= obHigh && slice[j].close >= obLow) {
          retested = true;
          break;
        }
      }
      if (retested) continue;

      const mid = (obHigh + obLow) / 2;
      const age = slice.length - 1 - i;
      return { valid: true, high: obHigh, low: obLow, mid, age };
    }
  }

  return null;
}

export function computeSMC(tf: MultiTFOHLCV): SMCResult {
  const { d1, h4, h1 } = tf;

  const currentPrice = h1.at(-1)?.close ?? d1.at(-1)?.close ?? 0;
  const atrD1        = computeATR(d1);
  const atrH4        = computeATR(h4);
  const ema50H1      = computeEMA(h1, 50);

  const { structure, lastEvent, lastEventAge } = detectStructure(d1);

  const obDirection: "BUY" | "SELL" = structure === "BULLISH" ? "BUY" : "SELL";
  const obRaw = detectOrderBlock(h4, obDirection, atrH4);

  const orderBlock: SMCResult["orderBlock"] = obRaw
    ? { direction: obDirection, ...obRaw }
    : null;

  return {
    structure,
    lastEvent,
    lastEventAge,
    orderBlock,
    ema50H1,
    atrD1,
    currentPrice,
  };
}
