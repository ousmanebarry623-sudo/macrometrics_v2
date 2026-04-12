// lib/dash-compute.ts
// Calculs dashboard ELTE SMART utilisables côté serveur (pas de "use client")
// Réplique la logique de ElteSmartDashboard.tsx pour usage dans le cron.

export interface Candle {
  time: number; open: number; high: number;
  low: number; close: number; volume: number;
}

export interface DashSignal {
  time: number;
  type: "buy" | "sell";
  close: number;
  st: number;
  sens: number;
  atr: number;
}

export interface DashResult {
  position:      "Buy" | "Sell";
  sensitivity:   number;
  trend:         "Bullish" | "Bearish";
  trendStrength: number;
  volume:        "Bullish" | "Bearish";
  volatility:    "Expanding 🚀" | "Trending 📈" | "Ranging";
  volatBull:     boolean;
  momentum:      "Bullish" | "Bearish";
  lastSignal:    DashSignal | null;
  barsSince:     number;
}

// ─── EMA ─────────────────────────────────────────────────────────────────────
function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let e = arr[0];
  return arr.map(v => { e = v * k + e * (1 - k); return e; });
}

// ─── AGGREGATION (ex: 60m → 4H) ───────────────────────────────────────────
export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const sl = candles.slice(i, i + factor);
    out.push({
      time:   sl[0].time,
      open:   sl[0].open,
      high:   Math.max(...sl.map(c => c.high)),
      low:    Math.min(...sl.map(c => c.low)),
      close:  sl[sl.length - 1].close,
      volume: sl.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// ─── COMPUTE DASH ─────────────────────────────────────────────────────────────
export function computeDash(
  candles: Candle[],
  ewmaPeriod = 10,
  annual     = 365,
  malen      = 55,
  atrLen     = 10,
): DashResult | null {
  const n = candles.length;
  if (n < 10) return null;

  const sqrtAnn = Math.sqrt(annual) * 100;
  const lambda  = (ewmaPeriod - 1) / (ewmaPeriod + 1);

  // EWMA volatility
  const hv: number[] = new Array(n).fill(NaN);
  let v: number | null = null;
  for (let i = 1; i < n; i++) {
    const logr = Math.log(candles[i].close / candles[i - 1].close);
    v = v === null ? logr * logr : lambda * v + (1 - lambda) * logr * logr;
    hv[i] = sqrtAnn * Math.sqrt(v);
  }
  // avgHV = SMA(hv, malen)
  const avgHV: number[] = new Array(n).fill(NaN);
  for (let i = malen; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - malen + 1; j <= i; j++) { if (!isNaN(hv[j])) { s += hv[j]; c++; } }
    if (c === malen) avgHV[i] = s / malen;
  }
  // auto-sensitivity
  const sens: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const h = hv[i], avg = avgHV[i];
    if (isNaN(h) || isNaN(avg)) continue;
    const maa = avg*1.4, mab = avg*1.8, mac = avg*2.4, mad = avg*0.6, mae = avg*0.2;
    if      (h < maa && h > avg) sens[i] = 3.15;
    else if (h < mab && h > maa) sens[i] = 3.5;
    else if (h < mac && h > mab) sens[i] = 3.6;
    else if (h > mac)            sens[i] = 4.0;
    else if (h < maa && h > mad) sens[i] = 3.0;
    else if (h < mad && h > mae) sens[i] = 2.85;
    else                         sens[i] = 3.0;
  }
  // ATR Wilder
  const atr: number[] = new Array(n).fill(NaN);
  let rma: number | null = null;
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i-1].close;
    const tr = Math.max(c.high-c.low, Math.abs(c.high-pc), Math.abs(c.low-pc));
    rma = rma === null ? tr : (rma*(atrLen-1)+tr)/atrLen;
    atr[i] = rma;
  }
  // Supertrend
  const st: number[]   = new Array(n).fill(NaN);
  const stDir: number[] = new Array(n).fill(0);
  let prevLB=0, prevUB=0, prevST: number|null=null;
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i-1].close;
    const s = isNaN(sens[i]) ? 3.0 : sens[i];
    const atrV = atr[i];
    if (isNaN(atrV)) continue;
    const src = (c.open+c.high+c.low+c.close)/4;
    const rawLB = src - s*atrV, rawUB = src + s*atrV;
    const lb = (rawLB>prevLB||pc<prevLB) ? rawLB : prevLB;
    const ub = (rawUB<prevUB||pc>prevUB) ? rawUB : prevUB;
    let dir: number;
    if (prevST!==null && prevST===prevUB) dir = c.close>ub ? 1 : -1;
    else                                   dir = c.close<lb ? -1 : 1;
    st[i] = dir===1 ? lb : ub; stDir[i] = dir;
    prevST=st[i]; prevLB=lb; prevUB=ub;
  }
  // EMA200
  const closes   = candles.map(c => c.close);
  const ema200v  = ema(closes, Math.min(200, n));
  // MACD
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
  const macdL = ema12.map((v2, i) => v2 - ema26[i]);
  const sig9  = ema(macdL, 9);
  const hist  = macdL.map((v2, i) => v2 - sig9[i]);

  // Signals (supertrend crossover)
  const signals: DashSignal[] = [];
  for (let i = 2; i < n; i++) {
    if (isNaN(st[i]) || isNaN(st[i-1])) continue;
    const atrV = isNaN(atr[i]) ? 0 : atr[i];
    const sensV = isNaN(sens[i]) ? 3.0 : sens[i];
    if (candles[i-1].close <= st[i-1] && candles[i].close > st[i])
      signals.push({ time: candles[i].time, type: "buy",  close: candles[i].close, st: st[i], sens: sensV, atr: atrV });
    if (candles[i-1].close >= st[i-1] && candles[i].close < st[i])
      signals.push({ time: candles[i].time, type: "sell", close: candles[i].close, st: st[i], sens: sensV, atr: atrV });
  }

  const last = n - 1;
  const ref  = Math.max(last - 1, 0);  // évite la bougie partielle
  const W = 5;
  const w0 = Math.max(0, ref - W + 1);

  // Volatilité : maxHv sur fenêtre 5 barres
  let maxHv = 0, refAvg = 0;
  for (let i = w0; i <= ref; i++) {
    if (!isNaN(hv[i]))    maxHv  = Math.max(maxHv, hv[i]);
    if (!isNaN(avgHV[i])) refAvg = avgHV[i];
  }
  const lH   = maxHv;
  const lAvg = refAvg > 0 ? refAvg : (isNaN(avgHV[last]) ? 0 : avgHV[last]);

  // Volume : bull/bear sur 20 bougies complètes
  const volWindow = candles.slice(Math.max(0, ref - 19), ref + 1);
  let bullVol = 0, bearVol = 0;
  for (const c of volWindow) {
    if (c.close >= c.open) bullVol += c.volume;
    else                   bearVol += c.volume;
  }
  const volBull = bullVol >= bearVol;

  // Momentum : tendance MACD hist sur 5 barres
  const histRecent = hist.slice(w0, ref + 1);
  const mid = Math.floor(histRecent.length / 2);
  const avgNew = histRecent.slice(mid).reduce((a, b) => a + b, 0) / Math.max(1, histRecent.length - mid);
  const avgOld = histRecent.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(1, mid);
  const momBull = hist[ref] > 0 || avgNew > avgOld;

  const lastSig  = signals.length > 0 ? signals[signals.length - 1] : null;
  const sigIdx   = lastSig ? candles.findIndex(c => c.time === lastSig.time) : -1;
  const barsSince = sigIdx >= 0 ? last - sigIdx : 0;

  return {
    position:      stDir[last] === 1 ? "Buy" : "Sell",
    sensitivity:   isNaN(sens[last]) ? 3.0 : parseFloat(sens[last].toFixed(2)),
    trend:         closes[last] > ema200v[last] ? "Bullish" : "Bearish",
    trendStrength: lAvg > 0 ? parseFloat(((lH/lAvg)*100).toFixed(1)) : 0,
    volume:        volBull ? "Bullish" : "Bearish",
    volatility:    lH > lAvg*1.4 ? "Expanding 🚀" : lH > lAvg ? "Trending 📈" : "Ranging",
    volatBull:     lH > lAvg,
    momentum:      momBull ? "Bullish" : "Bearish",
    lastSignal:    lastSig,
    barsSince,
  };
}
