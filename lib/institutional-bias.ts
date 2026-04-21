// lib/institutional-bias.ts
// Main institutional scoring engine: 4 layers → composite score 0–100.
// Selects top 6 pairs (3 BUY + 3 SELL) with M15 entry zones.

import type { PairSignal } from "@/app/api/signal-analysis/route";
import type { RegimeType } from "@/lib/market-regime";
import type { SMCResult } from "./smc-engine";
import { findSwingHighs, findSwingLows } from "./smc-engine";
import type { BondSpreadResult } from "./bond-spreads";
import type { OHLCV } from "./ohlcv-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstitutionalPairSignal {
  pair:      string;
  category:  "Major" | "Cross" | "Commodity";
  direction: "BUY" | "SELL";
  score:     number;
  layers: {
    macro:      number;
    sentiment:  number;
    smc:        number;
    confluence: number;
  };
  smcContext: {
    structure:  "BULLISH" | "BEARISH" | "RANGING";
    lastEvent:  "BOS" | "CHOCH" | "NONE";
    hasValidOB: boolean;
    obZone:     { low: number; high: number } | null;
  };
  entry: {
    zone:     { low: number; high: number };
    stopLoss: number;
    target1:  number;
    target2:  number;
    holdMax:  "48h";
    rr1:      number;
    rr2:      number;
  };
  arguments:  string[];
  bondSpread: number;
}

// ── Pair metadata ─────────────────────────────────────────────────────────────

const RISK_PAIRS   = new Set(["AUD/USD","NZD/USD","AUD/JPY","AUD/NZD","AUD/CAD","NZD/JPY","NZD/CAD","EUR/USD","GBP/USD","EUR/GBP","GBP/AUD","GBP/CAD","GBP/NZD","EUR/AUD","EUR/CAD","EUR/NZD","CAD/JPY"]);
const REFUGE_PAIRS = new Set(["USD/JPY","USD/CHF","CHF/JPY","EUR/CHF","GBP/CHF","AUD/CHF","NZD/CHF","CAD/CHF","XAU/USD","XAG/USD"]);
const USD_PAIRS    = new Set(["EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD","USD/MXN"]);
const USD_BASE     = new Set(["USD/JPY","USD/CHF","USD/CAD","USD/MXN"]);

// ── Layer 1: Macro/Fundamental (0–40 pts) ─────────────────────────────────────

export function computeMacroLayer(
  signal:    PairSignal,
  bond:      BondSpreadResult | undefined,
  direction: "BUY" | "SELL",
): number {
  const dirMult = direction === "BUY" ? 1 : -1;

  // COT z-score differential (0–15 pts)
  const baseZ    = signal.institutional.base.zScore  ?? 0;
  const quoteZ   = signal.institutional.quote.zScore ?? 0;
  const instNetZ = baseZ - quoteZ;
  const cotPts   = (instNetZ * dirMult) > 0
    ? Math.min(15, Math.abs(instNetZ) / 3.5 * 15)
    : 0;

  // Macro surprises (0–10 pts)
  const fundNet = signal.fundamental.netScore;
  const fundPts = (fundNet * dirMult) > 0
    ? Math.min(10, Math.abs(fundNet) / 5 * 10)
    : 0;

  // Bond spread (0–10 pts)
  let bondPts = 0;
  if (bond && bond.spread_bps !== 0) {
    bondPts = (bond.spread_bps * dirMult) > 0
      ? Math.min(10, Math.abs(bond.spread_bps) / 100 * 10)
      : 0;
  }

  // Seasonality (0–5 pts)
  const seasScore = signal.seasonality.score ?? 0;
  const seasPts   = (seasScore * dirMult) > 0 ? Math.min(5, Math.abs(seasScore) * 5) : 0;

  return Math.round(cotPts + fundPts + bondPts + seasPts);
}

// ── Layer 2: Sentiment (0–20 pts) ─────────────────────────────────────────────

export function computeSentimentLayer(
  signal:    PairSignal,
  regime:    RegimeType | null,
  pair:      string,
  direction: "BUY" | "SELL",
): number {
  const longPct = signal.sentiment.longPct;

  // Retail contrarian (0–10 pts)
  let retailPts = 0;
  if (direction === "BUY") {
    if      (longPct <= 30) retailPts = 10;
    else if (longPct <= 40) retailPts = 7;
    else if (longPct <= 45) retailPts = 3;
  } else {
    if      (longPct >= 70) retailPts = 10;
    else if (longPct >= 60) retailPts = 7;
    else if (longPct >= 55) retailPts = 3;
  }

  // Market Regime (0–10 pts)
  let regimePts = 0;
  if (regime) {
    const isRisk   = RISK_PAIRS.has(pair);
    const isRefuge = REFUGE_PAIRS.has(pair);
    if (regime === "RISK_ON") {
      if      (isRisk   && direction === "BUY")  regimePts = 10;
      else if (isRefuge && direction === "SELL") regimePts = 5;
    } else if (regime === "RISK_OFF") {
      if      (isRefuge && direction === "BUY")  regimePts = 10;
      else if (isRisk   && direction === "SELL") regimePts = 10;
    } else {
      regimePts = 4;
    }
  }

  return Math.round(retailPts + regimePts);
}

// ── Layer 3: SMC (0–30 pts) ───────────────────────────────────────────────────

export function computeSMCLayer(smc: SMCResult, direction: "BUY" | "SELL"): number {
  // D1 structure (0–15 pts)
  let structurePts = 0;
  const aligned =
    (direction === "BUY"  && smc.structure === "BULLISH") ||
    (direction === "SELL" && smc.structure === "BEARISH");
  if (aligned) {
    structurePts = (smc.lastEvent !== "NONE" && smc.lastEventAge <= 5) ? 15 : 10;
  }

  // H4 Order Block (0–10 pts)
  let obPts = 0;
  if (smc.orderBlock?.valid) {
    const ob = smc.orderBlock;
    const obAligned =
      (direction === "BUY"  && ob.direction === "BUY") ||
      (direction === "SELL" && ob.direction === "SELL");
    if (obAligned) {
      const priceToMid = Math.abs(smc.currentPrice - ob.mid) / smc.currentPrice;
      obPts = priceToMid <= 0.005 ? 10 : priceToMid <= 0.008 ? 6 : 2;
    }
  }

  // H1 EMA50 (0–5 pts)
  let emaPts = 0;
  if (smc.ema50H1 > 0) {
    if (direction === "BUY"  && smc.currentPrice > smc.ema50H1) emaPts = 5;
    if (direction === "SELL" && smc.currentPrice < smc.ema50H1) emaPts = 5;
  }

  return Math.round(structurePts + obPts + emaPts);
}

// ── Layer 4: Confluence (0–10 pts) ────────────────────────────────────────────

export function computeConfluenceLayer(
  dxyStructure: "BULLISH" | "BEARISH" | "RANGING",
  vix:          number,
  pair:         string,
  direction:    "BUY" | "SELL",
): number {
  let dxyPts = 0;
  if (USD_PAIRS.has(pair)) {
    if (USD_BASE.has(pair)) {
      if (direction === "BUY"  && dxyStructure === "BULLISH") dxyPts = 5;
      if (direction === "SELL" && dxyStructure === "BEARISH") dxyPts = 5;
    } else {
      if (direction === "BUY"  && dxyStructure === "BEARISH") dxyPts = 5;
      if (direction === "SELL" && dxyStructure === "BULLISH") dxyPts = 5;
    }
  }

  let vixPts = 0;
  const isRisk   = RISK_PAIRS.has(pair);
  const isRefuge = REFUGE_PAIRS.has(pair);
  if (vix < 18 && direction === "BUY"  && isRisk)   vixPts = 5;
  if (vix > 25 && direction === "SELL" && isRisk)    vixPts = 5;
  if (vix > 25 && direction === "BUY"  && isRefuge)  vixPts = 5;

  return Math.round(dxyPts + vixPts);
}

// ── Entry levels ──────────────────────────────────────────────────────────────

export function computeEntryLevels(
  smc:       SMCResult,
  direction: "BUY" | "SELL",
  d1Candles: OHLCV[],
): InstitutionalPairSignal["entry"] {
  const { currentPrice, atrD1, orderBlock } = smc;
  const atr = atrD1 || currentPrice * 0.005;

  let zoneLow: number;
  let zoneHigh: number;

  if (orderBlock?.valid) {
    zoneLow  = orderBlock.low;
    zoneHigh = orderBlock.high;
  } else {
    zoneLow  = currentPrice - atr * 0.3;
    zoneHigh = currentPrice + atr * 0.3;
  }

  let target1: number;
  let target2: number;
  let stopLoss: number;

  if (direction === "BUY") {
    stopLoss = zoneLow * (1 - 0.0015);
    if (d1Candles.length > 0) {
      const highs = findSwingHighs(d1Candles, 3).map(i => d1Candles[i].high).filter(h => h > currentPrice).sort((a, b) => a - b);
      target1 = highs[0] ?? currentPrice + atr * 2;
    } else {
      target1 = currentPrice + atr * 2;
    }
    target2 = target1 + atrD1;
  } else {
    stopLoss = zoneHigh * (1 + 0.0015);
    if (d1Candles.length > 0) {
      const lows = findSwingLows(d1Candles, 3).map(i => d1Candles[i].low).filter(l => l < currentPrice).sort((a, b) => b - a);
      target1 = lows[0] ?? currentPrice - atr * 2;
    } else {
      target1 = currentPrice - atr * 2;
    }
    target2 = target1 - atrD1;
  }

  const entryMid = (zoneLow + zoneHigh) / 2;
  const risk     = Math.abs(entryMid - stopLoss);
  const rr1      = risk > 0 ? Math.round((Math.abs(target1 - entryMid) / risk) * 10) / 10 : 0;
  const rr2      = risk > 0 ? Math.round((Math.abs(target2 - entryMid) / risk) * 10) / 10 : 0;

  return {
    zone:     { low: zoneLow, high: zoneHigh },
    stopLoss: Math.round(stopLoss * 100000) / 100000,
    target1:  Math.round(target1  * 100000) / 100000,
    target2:  Math.round(target2  * 100000) / 100000,
    holdMax:  "48h",
    rr1,
    rr2,
  };
}

// ── Argument generation ───────────────────────────────────────────────────────

export function generateArguments(
  signal:    PairSignal,
  smc:       SMCResult,
  bond:      BondSpreadResult | undefined,
  regime:    RegimeType | null,
  direction: "BUY" | "SELL",
  score:     number,
): string[] {
  const args: string[] = [];

  // Arg 1: COT + Structure
  const cotZ   = signal.institutional.base.zScore?.toFixed(1) ?? "N/A";
  const cotStr = direction === "BUY"
    ? `institutionnels nets longs (z-score ${cotZ})`
    : `institutionnels nets courts (z-score ${cotZ})`;
  args.push(
    `Structure D1 ${smc.structure === "RANGING" ? "indécise" : smc.structure === "BULLISH" ? "haussière" : "baissière"}` +
    (smc.lastEvent !== "NONE" ? ` avec ${smc.lastEvent} récent (${smc.lastEventAge}j)` : "") +
    ` — COT CFTC ${cotStr} sur ${signal.base}.`,
  );

  // Arg 2: Bond spread + Macro
  const spreadStr = bond
    ? `spread obligataire ${bond.spread_bps > 0 ? "+" : ""}${bond.spread_bps}bp (${bond.direction.toLowerCase()})`
    : "données obligataires indisponibles";
  const fundNet = signal.fundamental.netScore;
  args.push(
    `Macro : surprises économiques ${fundNet >= 0 ? "positives" : "négatives"} (net ${fundNet >= 0 ? "+" : ""}${fundNet.toFixed(1)}) — ${spreadStr}.`,
  );

  // Arg 3: Sentiment + Regime + Score
  const lp      = signal.sentiment.longPct;
  const obStr   = smc.orderBlock?.valid
    ? `Order Block H4 à ${smc.orderBlock.mid.toFixed(5)}`
    : "pas d'Order Block H4 valide";
  args.push(
    `Retail ${lp}% long — régime ${regime ?? "N/A"} — ${obStr} — score institutionnel ${score}/100.`,
  );

  return args;
}

// ── Top 6 selection ───────────────────────────────────────────────────────────

export function selectTop8(scores: InstitutionalPairSignal[]): InstitutionalPairSignal[] {
  const MIN_SCORE  = 55;
  const MIN_LAYERS = 3;

  const qualified = scores.filter(s => {
    if (s.score < MIN_SCORE) return false;
    const nonZero = Object.values(s.layers).filter(v => v > 0).length;
    return nonZero >= MIN_LAYERS;
  });

  const buys  = qualified.filter(s => s.direction === "BUY").sort((a, b) => b.score - a.score);
  const sells = qualified.filter(s => s.direction === "SELL").sort((a, b) => b.score - a.score);

  const result = [...buys.slice(0, 4), ...sells.slice(0, 4)];

  if (result.length < 8) {
    const extra = qualified
      .filter(s => !result.includes(s))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8 - result.length);
    result.push(...extra);
  }

  return result.sort((a, b) => b.score - a.score);
}
