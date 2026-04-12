// lib/elte-compute.ts
// Traduction complète du Pine Script ELTE SMART v5 → TypeScript
// Tous les modèles de volatilité, toutes les stratégies, tous les filtres.

export interface Candle {
  time: number; open: number; high: number;
  low: number; close: number; volume: number;
}

// ─── PARAMÈTRES COMPLETS (miroir exact des inputs Pine Script) ────────────────
export type VolModel = "EWMA"|"CTC"|"Parkinson"|"GK"|"RS"|"GKYZ"|"YZ"|"MAD"|"MAAD";
export type Strategy = "Normal"|"Confirmed"|"Trend scalper";
export type TrendCloudPeriod = "Short term"|"Long term"|"New";

export interface ElteParams {
  // ── Volatilité ──────────────────────────────────────────────────────────────
  volModel:     VolModel;   // H
  period:       number;     // 10
  annual:       number;     // 365
  a:            number;     // 1.34  (Yang-Zhang k factor)
  malen:        number;     // 55    (SMA avgHV)
  Plen:         number;     // 365   (percentile rank length)
  // ── Signaux ─────────────────────────────────────────────────────────────────
  showSignals:  boolean;    // true
  strategy:     Strategy;   // "Normal"
  autoSens:     boolean;    // true
  manualSens:   number;     // 1.8
  atrLen:       number;     // 10  (Supertrend ATR length)
  // ── Filtres ─────────────────────────────────────────────────────────────────
  consFilter:   boolean;    // consSignalsFilter — ADX > 20
  smartFilter:  boolean;    // smartSignalsOnly  — close > EMA(200)
  highVolFilter:boolean;    // highVolSignals
  trendCloudFilter: boolean;// signalsTrendCloud
  // ── Risk Management ──────────────────────────────────────────────────────────
  multTP1:      number;     // 1
  multTP2:      number;     // 2
  multTP3:      number;     // 3
  trailingSL:   boolean;    // false
  usePercSL:    boolean;    // false
  percSL:       number;     // 1.0  (% trailing)
  // ── Trend Cloud ──────────────────────────────────────────────────────────────
  showTrendCloud:     boolean;        // true
  trendCloudPeriod:   TrendCloudPeriod; // "New"
  fastTrendCloud:     boolean;        // false
  fastTrendCloudLen:  number;         // 55
  // ── Affichage ────────────────────────────────────────────────────────────────
  showEma200:   boolean;    // true
  showEma150:   boolean;    // false
  showEma250:   boolean;    // false
  showHma55:    boolean;    // false
  showVolPanel: boolean;    // false
}

export const DEFAULT_PARAMS: ElteParams = {
  volModel: "EWMA", period: 10, annual: 365, a: 1.34, malen: 55, Plen: 365,
  showSignals: true, strategy: "Normal", autoSens: true, manualSens: 1.8, atrLen: 10,
  consFilter: false, smartFilter: false, highVolFilter: false, trendCloudFilter: false,
  multTP1: 1, multTP2: 2, multTP3: 3,
  trailingSL: false, usePercSL: false, percSL: 1.0,
  showTrendCloud: true, trendCloudPeriod: "New", fastTrendCloud: false, fastTrendCloudLen: 55,
  showEma200: true, showEma150: false, showEma250: false, showHma55: false, showVolPanel: false,
};

// ─── FONCTIONS DE BASE ────────────────────────────────────────────────────────
function wilder(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  if (src.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += src[i];
  out[period - 1] = sum / period;
  for (let i = period; i < src.length; i++)
    out[i] = (out[i - 1] * (period - 1) + src[i]) / period;
  return out;
}

function emaArr(src: number[], period: number): number[] {
  const k = 2 / (period + 1); let e = src[0];
  return src.map(v => { e = isNaN(v) ? e : v * k + e * (1 - k); return e; });
}

function wma(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const w = (period * (period + 1)) / 2;
  for (let i = period - 1; i < src.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += src[i - j] * (period - j);
    out[i] = s / w;
  }
  return out;
}

function hma(src: number[], period: number): number[] {
  const half = Math.floor(period / 2);
  const sqrtP = Math.round(Math.sqrt(period));
  const wma1 = wma(src, half);
  const wma2 = wma(src, period);
  const diff = wma1.map((v, i) => 2 * v - wma2[i]);
  return wma(diff, sqrtP);
}

function sma(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = period - 1; i < src.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += src[i - j];
    out[i] = s / period;
  }
  return out;
}

function highest(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = period - 1; i < src.length; i++) {
    let m = -Infinity;
    for (let j = 0; j < period; j++) m = Math.max(m, src[i - j]);
    out[i] = m;
  }
  return out;
}

function lowest(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = period - 1; i < src.length; i++) {
    let m = Infinity;
    for (let j = 0; j < period; j++) m = Math.min(m, src[i - j]);
    out[i] = m;
  }
  return out;
}

function percentrank(src: number[], period: number): number[] {
  const out = new Array(src.length).fill(NaN);
  for (let i = period - 1; i < src.length; i++) {
    let below = 0;
    for (let j = 1; j < period; j++) if (src[i - j] < src[i]) below++;
    out[i] = (below / (period - 1)) * 100;
  }
  return out;
}

// ─── MODÈLES DE VOLATILITÉ ────────────────────────────────────────────────────
function f_ewma(logr: number[], period: number, sqrtAnn: number): number[] {
  const lambda = (period - 1) / (period + 1);
  const out = new Array(logr.length).fill(NaN);
  let v: number | null = null;
  for (let i = 0; i < logr.length; i++) {
    if (isNaN(logr[i])) continue;
    const sq = logr[i] * logr[i];
    v = v === null ? sq : lambda * v + (1 - lambda) * sq;
    out[i] = sqrtAnn * Math.sqrt(v);
  }
  return out;
}

function f_coc(logr: number[], period: number, sqrtAnn: number): number[] {
  const m = sma(logr, period);
  const out = new Array(logr.length).fill(NaN);
  for (let i = period - 1; i < logr.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += Math.pow(logr[i - j] - m[i], 2);
    out[i] = sqrtAnn * Math.sqrt(s / (period - 1));
  }
  return out;
}

function f_park(candles: Candle[], period: number, sqrtAnn: number): number[] {
  const log2 = Math.log(2);
  const hl2 = candles.map(c => Math.pow(Math.log(c.high / c.low), 2) / (4 * log2));
  const s = sma(hl2, period);
  return s.map(v => isNaN(v) ? NaN : sqrtAnn * Math.sqrt(v));
}

function f_gk(candles: Candle[], period: number, sqrtAnn: number): number[] {
  const log2 = Math.log(2);
  const tmp = candles.map(c =>
    0.5 * Math.pow(Math.log(c.high / c.low), 2) -
    (2 * log2 - 1) * Math.pow(Math.log(c.close / c.open), 2)
  );
  const s = sma(tmp, period);
  return s.map(v => isNaN(v) ? NaN : sqrtAnn * Math.sqrt(v));
}

function f_rs(candles: Candle[], period: number, sqrtAnn: number): number[] {
  const tmp = candles.map(c =>
    Math.log(c.high / c.close) * Math.log(c.high / c.open) +
    Math.log(c.low / c.close) * Math.log(c.low / c.open)
  );
  const s = sma(tmp, period);
  return s.map(v => isNaN(v) ? NaN : sqrtAnn * Math.sqrt(v));
}

function f_gkyz(candles: Candle[], period: number, sqrtAnn: number): number[] {
  const log2 = Math.log(2);
  const tmp = candles.map((c, i) => {
    const lc = i > 0 ? candles[i - 1].close : c.close;
    return Math.pow(Math.log(c.open / lc), 2) +
      0.5 * Math.pow(Math.log(c.high / c.low), 2) -
      (2 * log2 - 1) * Math.pow(Math.log(c.close / c.open), 2);
  });
  const s = sma(tmp, period);
  return s.map(v => isNaN(v) ? NaN : sqrtAnn * Math.sqrt(v));
}

function f_yz(candles: Candle[], period: number, sqrtAnn: number, a: number): number[] {
  const n = candles.length;
  const o = candles.map((c, i) => Math.log(c.open) - Math.log(i > 0 ? candles[i-1].close : c.close));
  const u = candles.map(c => Math.log(c.high) - Math.log(c.open));
  const d = candles.map(c => Math.log(c.low)  - Math.log(c.open));
  const cc= candles.map(c => Math.log(c.close) - Math.log(c.open));
  const avgO = sma(o, period), avgC = sma(cc, period);
  const out = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    let so = 0, sc = 0, vrs = 0;
    for (let j = 0; j < period; j++) {
      so  += Math.pow(o[i-j]  - avgO[i], 2);
      sc  += Math.pow(cc[i-j] - avgC[i], 2);
      vrs += u[i-j]*(u[i-j]-cc[i-j]) + d[i-j]*(d[i-j]-cc[i-j]);
    }
    const Vo = so / (period-1), Vc = sc / (period-1);
    vrs /= period;
    const k2 = (a - 1) / (a + (period + 1) / (period - 1));
    out[i] = sqrtAnn * Math.sqrt(Vo + k2*Vc + (1-k2)*vrs);
  }
  return out;
}

function f_mad(logr: number[], period: number, sqrtAnn: number): number[] {
  const sqrtHalfPi = Math.sqrt(Math.asin(1));
  const m = sma(logr, period);
  const out = new Array(logr.length).fill(NaN);
  for (let i = period - 1; i < logr.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += Math.abs(logr[i-j] - m[i]);
    out[i] = sqrtAnn * (s / period) * sqrtHalfPi;
  }
  return out;
}

function f_maad(logr: number[], period: number, sqrtAnn: number): number[] {
  const out = new Array(logr.length).fill(NaN);
  for (let i = period - 1; i < logr.length; i++) {
    const slice = logr.slice(i - period + 1, i + 1).filter(v => !isNaN(v)).sort((a, b) => a - b);
    const median = slice[Math.floor(slice.length / 2)];
    let e = 0;
    for (const v of slice) e += Math.abs(v - median);
    out[i] = sqrtAnn * Math.sqrt(2) * (e / period);
  }
  return out;
}

// ─── ADX ─────────────────────────────────────────────────────────────────────
function calcAdx(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const trArr: number[] = new Array(n).fill(0);
  const dmPArr: number[] = new Array(n).fill(0);
  const dmMArr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i-1];
    trArr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const up = c.high - p.high, dn = p.low - c.low;
    dmPArr[i] = up > dn && up > 0 ? up : 0;
    dmMArr[i] = dn > up && dn > 0 ? dn : 0;
  }
  const atrW = wilder(trArr, period);
  const diP = wilder(dmPArr, period).map((v, i) => atrW[i] ? 100 * v / atrW[i] : 0);
  const diM = wilder(dmMArr, period).map((v, i) => atrW[i] ? 100 * v / atrW[i] : 0);
  const dx = diP.map((v, i) => {
    const sum = v + diM[i];
    return sum ? 100 * Math.abs(v - diM[i]) / sum : 0;
  });
  return wilder(dx, period);
}

// ─── SUPERTREND ───────────────────────────────────────────────────────────────
function calcSupertrend(candles: Candle[], sensitivity: number[], atrLen: number): { st: number[]; dir: number[] } {
  const n = candles.length;
  const st = new Array(n).fill(NaN);
  const dir = new Array(n).fill(0);
  // ATR Wilder
  const trArr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i-1].close;
    trArr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atr = wilder(trArr, atrLen);

  let pLB = 0, pUB = 0, pST: number | null = null;
  for (let i = 1; i < n; i++) {
    if (isNaN(atr[i])) continue;
    const c = candles[i], pc = candles[i-1].close;
    const s = isNaN(sensitivity[i]) ? 3.0 : sensitivity[i];
    const src = (c.open + c.high + c.low + c.close) / 4;
    const rawLB = src - s * atr[i], rawUB = src + s * atr[i];
    const lb = (rawLB > pLB || pc < pLB) ? rawLB : pLB;
    const ub = (rawUB < pUB || pc > pUB) ? rawUB : pUB;
    let d: number;
    if (pST !== null && pST === pUB) d = c.close > ub ? 1 : -1;
    else                              d = c.close < lb ? -1 : 1;
    st[i] = d === 1 ? lb : ub; dir[i] = d;
    pST = st[i]; pLB = lb; pUB = ub;
  }
  return { st, dir };
}

// ─── TRAILING STOP ────────────────────────────────────────────────────────────
function calcTrailingSL(
  candles: Candle[], bull: boolean[], bear: boolean[],
  factor: number, len: number, usePerc: boolean, perc: number
): number[] {
  const n = candles.length;
  const trArr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i-1].close;
    trArr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  const atr = wilder(trArr, len);
  const out = new Array(n).fill(NaN);
  let pLB = 0, pUB = Infinity, pStop: number | null = null;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const offset = usePerc ? c.high * (perc / 100) : factor * (atr[i] || 0);
    const lb = Math.max(c.low - offset, pLB);
    const ub = Math.min(c.high + offset, pUB);
    const lb2 = (lb > pLB || bull[i]) ? lb : pLB;
    const ub2 = (ub < pUB || bear[i]) ? ub : pUB;
    let d: number;
    if (pStop !== null && pStop === pUB) d = bull[i] ? 1 : -1;
    else                                  d = bear[i] ? -1 : 1;
    out[i] = d === 1 ? lb2 : ub2;
    pLB = lb2; pUB = ub2; pStop = out[i];
  }
  return out;
}

// ─── HEIKIN ASHI (pour Trend Scalper) ────────────────────────────────────────
function haOpen(candles: Candle[]): number[] {
  const out: number[] = [];
  let prev = (candles[0].open + candles[0].close) / 2;
  for (const c of candles) {
    const avgOC = (c.open + c.close) / 2;
    prev = (prev + (c.open + c.high + c.low + c.close) / 4) / 2;
    out.push(prev);
    prev = out[out.length - 1];
  }
  // Re-calc properly
  const res: number[] = new Array(candles.length).fill(0);
  res[0] = (candles[0].open + candles[0].close) / 2;
  for (let i = 1; i < candles.length; i++)
    res[i] = (res[i-1] + (candles[i-1].open + candles[i-1].high + candles[i-1].low + candles[i-1].close) / 4) / 2;
  return res;
}

// ─── DCHANNEL (maintrend) ────────────────────────────────────────────────────
function dchannel(candles: Candle[], len = 30): number[] {
  const n = candles.length;
  const hh = highest(candles.map(c => c.high), len);
  const ll = lowest (candles.map(c => c.low),  len);
  const trend = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if      (candles[i].close > hh[i-1]) trend[i] =  1;
    else if (candles[i].close < ll[i-1]) trend[i] = -1;
    else                                  trend[i] = trend[i-1];
  }
  return trend;
}

// ─── RÉSULTAT COMPLET ─────────────────────────────────────────────────────────
export interface Signal {
  time:  number;
  type:  "buy" | "sell";
  close: number;
  st:    number;
  sens:  number;
  atr:   number;
}

export interface ElteResult {
  // Series for chart
  stBull:       Array<{ time: number; value: number }>;
  stBear:       Array<{ time: number; value: number }>;
  trendCloud:   Array<{ time: number; value: number; bull: boolean }>;
  trailStop:    Array<{ time: number; value: number }>;
  ema200:       Array<{ time: number; value: number }>;
  ema150:       Array<{ time: number; value: number }>;
  ema250:       Array<{ time: number; value: number }>;
  hma55:        Array<{ time: number; value: number }>;
  hvSeries:     Array<{ time: number; value: number }>;
  avgHvSeries:  Array<{ time: number; value: number }>;
  // Trend scalper EMAs (on HA open)
  tsEma5:       Array<{ time: number; value: number }>;
  tsEma9:       Array<{ time: number; value: number }>;
  tsEma21:      Array<{ time: number; value: number }>;
  // Signals
  signals:      Signal[];
  // Dashboard
  lastSens:     number;
  lastBull:     boolean;
  lastHv:       number;
  lastAvgHv:    number;
  lastHvp:      number;
  lastVolBull:  boolean;
  lastMacdBull: boolean;
  lastEma200Bull: boolean;
  lastAdx:      number;
  // Candle colors (for "Candle colors" option)
  barColors:    string[];
}

// ─── FONCTION PRINCIPALE ──────────────────────────────────────────────────────
export function computeElte(candles: Candle[], p: ElteParams): ElteResult {
  const n = candles.length;
  const empty: ElteResult = {
    stBull:[], stBear:[], trendCloud:[], trailStop:[],
    ema200:[], ema150:[], ema250:[], hma55:[], hvSeries:[], avgHvSeries:[],
    tsEma5:[], tsEma9:[], tsEma21:[],
    signals:[], lastSens:p.manualSens, lastBull:true, lastHv:0, lastAvgHv:0,
    lastHvp:0, lastVolBull:false, lastMacdBull:false, lastEma200Bull:true,
    lastAdx:0, barColors:[],
  };
  if (n < 5) return empty;

  const sqrtAnn = Math.sqrt(p.annual) * 100;
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const vols    = candles.map(c => c.volume);
  const logr    = closes.map((c, i) => i === 0 ? 0 : Math.log(c / closes[i-1]));

  // ── Volatilité ──────────────────────────────────────────────────────────────
  let hv: number[];
  switch (p.volModel) {
    case "CTC":       hv = f_coc(logr, p.period, sqrtAnn);                      break;
    case "Parkinson": hv = f_park(candles, p.period, sqrtAnn);                  break;
    case "GK":        hv = f_gk(candles, p.period, sqrtAnn);                    break;
    case "RS":        hv = f_rs(candles, p.period, sqrtAnn);                    break;
    case "GKYZ":      hv = f_gkyz(candles, p.period, sqrtAnn);                  break;
    case "YZ":        hv = f_yz(candles, p.period, sqrtAnn, p.a);               break;
    case "MAD":       hv = f_mad(logr, p.period, sqrtAnn);                      break;
    case "MAAD":      hv = f_maad(logr, p.period, sqrtAnn);                     break;
    default:          hv = f_ewma(logr, p.period, sqrtAnn);                     break;
  }

  // avgHV = SMA(hv, malen)
  const avgHV = sma(hv, p.malen);
  // HVP = percentrank(hv, Plen)
  const hvp   = percentrank(hv, Math.min(p.Plen, n));

  // ── Auto-sensibilité ────────────────────────────────────────────────────────
  const sens: number[] = new Array(n).fill(p.manualSens);
  if (p.autoSens) {
    for (let i = 0; i < n; i++) {
      const h = hv[i], avg = avgHV[i];
      if (isNaN(h) || isNaN(avg)) continue;
      const maa=avg*1.4, mab=avg*1.8, mac=avg*2.4, mad=avg*0.6, mae=avg*0.2;
      if      (h < maa && h > avg) sens[i] = 3.15;
      else if (h < mab && h > maa) sens[i] = 3.5;
      else if (h < mac && h > mab) sens[i] = 3.6;
      else if (h > mac)            sens[i] = 4.0;
      else if (h < maa && h > mad) sens[i] = 3.0;
      else if (h < mad && h > mae) sens[i] = 2.85;
      else                         sens[i] = 3.0;
    }
  }

  // ── Supertrend ──────────────────────────────────────────────────────────────
  const { st, dir } = calcSupertrend(candles, sens, p.atrLen);

  // ── Trend Cloud ─────────────────────────────────────────────────────────────
  const tcFactor = p.trendCloudPeriod === "Long term" ? 7 : 4;
  const tcSens   = new Array(n).fill(tcFactor);
  const { st: tcSt, dir: tcDir } = calcSupertrend(candles, tcSens, 10);

  // ── EMAs ────────────────────────────────────────────────────────────────────
  const ema200v = emaArr(closes, Math.min(200, n));
  const ema150v = emaArr(closes, Math.min(150, n));
  const ema250v = emaArr(closes, Math.min(250, n));
  const hma55v  = hma(closes, Math.min(55, n));

  // ── MACD (12, 26, 9) — hist = signal MACD ──────────────────────────────────
  const macdLine = emaArr(closes, 12).map((v, i) => v - emaArr(closes, 26)[i]);
  const sig9     = emaArr(macdLine, 9);
  const macdHist = macdLine.map((v, i) => v - sig9[i]);

  // ── ADX ─────────────────────────────────────────────────────────────────────
  const adx = calcAdx(candles, 14);

  // ── Volume EMA ──────────────────────────────────────────────────────────────
  const volEma25 = emaArr(vols, 25);
  const volEma26 = emaArr(vols, 26);

  // ── dchannel (maintrend) ─────────────────────────────────────────────────────
  const maintrend = dchannel(candles, 30);

  // ── Trend Scalper EMAs (HA open) ─────────────────────────────────────────────
  const haO  = haOpen(candles);
  const ts5  = emaArr(haO, 5);
  const ts9  = emaArr(haO, 9);
  const ts21 = emaArr(haO, 21);

  // ── Trailing SL placeholder (init, filled after signals) ────────────────────
  const bullSig = new Array(n).fill(false);
  const bearSig = new Array(n).fill(false);

  // ── Signal filters ──────────────────────────────────────────────────────────
  // "New" trendCloudFilter uses ema150 > ema250
  const trendFilterOk = (i: number, isBull: boolean) => {
    if (!p.trendCloudFilter) return true;
    if (p.trendCloudPeriod === "New")
      return isBull ? ema150v[i] > ema250v[i] : ema150v[i] < ema250v[i];
    return isBull ? closes[i] > tcSt[i] : closes[i] < tcSt[i];
  };

  // ── Confirmed strategy helpers ───────────────────────────────────────────────
  // confBull conditions (beyond crossover)
  const confBull = (i: number, crossUp: boolean, crossUpPrev: boolean) =>
    (crossUp || (crossUpPrev && maintrend[i-1] < 0)) &&
    macdHist[i] > 0 && macdHist[i] > macdHist[i-1] &&
    ema150v[i] > ema250v[i] && hma55v[i] > (hma55v[i-2] ?? hma55v[i]) &&
    maintrend[i] > 0;

  const confBear = (i: number, crossDown: boolean, crossDownPrev: boolean) =>
    (crossDown || (crossDownPrev && maintrend[i-1] > 0)) &&
    macdHist[i] < 0 && macdHist[i] < macdHist[i-1] &&
    ema150v[i] < ema250v[i] && hma55v[i] < (hma55v[i-2] ?? hma55v[i]) &&
    maintrend[i] < 0;

  // ── Build signals ────────────────────────────────────────────────────────────
  const signals: Signal[] = [];
  // ATR for TP/SL
  const trArr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const pc = closes[i-1];
    trArr[i] = Math.max(highs[i]-lows[i], Math.abs(highs[i]-pc), Math.abs(lows[i]-pc));
  }
  const atrW = wilder(trArr, p.atrLen);

  for (let i = 2; i < n; i++) {
    if (isNaN(st[i]) || isNaN(st[i-1])) continue;

    const crossUp     = closes[i-1] <= st[i-1] && closes[i] > st[i];
    const crossDown   = closes[i-1] >= st[i-1] && closes[i] < st[i];
    const crossUpPrev = i >= 2 && (closes[i-2] <= (st[i-2]||Infinity) && closes[i-1] > st[i-1]);
    const crossDnPrev = i >= 2 && (closes[i-2] >= (st[i-2]||0)        && closes[i-1] < st[i-1]);

    let isBull = false, isBear = false;

    if (p.strategy === "Normal") {
      isBull = crossUp;
      isBear = crossDown;
    } else if (p.strategy === "Confirmed") {
      isBull = confBull(i, crossUp, crossUpPrev) && !(confBull(i-1, crossUpPrev, false));
      isBear = confBear(i, crossDown, crossDnPrev) && !(confBear(i-1, crossDnPrev, false));
    }
    // Trend scalper: no BUY/SELL signals, only visual EMAs

    // Apply filters
    if (p.consFilter   && adx[i] <= 20)                      { isBull = false; isBear = false; }
    if (p.smartFilter  && isBull && closes[i] <= ema200v[i]) { isBull = false; }
    if (p.smartFilter  && isBear && closes[i] >= ema200v[i]) { isBear = false; }
    if (p.highVolFilter) {
      const volOk = (volEma25[i] - volEma26[i]) / (volEma26[i] || 1) > 0;
      if (!volOk) { isBull = false; isBear = false; }
    }
    if (!trendFilterOk(i, true)  && isBull) isBull = false;
    if (!trendFilterOk(i, false) && isBear) isBear = false;

    if (isBull) {
      signals.push({ time: candles[i].time, type: "buy",  close: closes[i], st: st[i], sens: sens[i], atr: atrW[i] });
      bullSig[i] = true;
    }
    if (isBear) {
      signals.push({ time: candles[i].time, type: "sell", close: closes[i], st: st[i], sens: sens[i], atr: atrW[i] });
      bearSig[i] = true;
    }
  }

  // Trailing SL (if enabled)
  const trailStop = p.trailingSL
    ? calcTrailingSL(candles, bullSig, bearSig, 2.2, 14, p.usePercSL, p.percSL)
    : new Array(n).fill(NaN);

  // ── Candle colors (basées sur Supertrend) ────────────────────────────────────
  const barColors = candles.map((_, i) => dir[i] === 1 ? "#22c55e" : "#ef4444");

  // ── Build chart series ───────────────────────────────────────────────────────
  const stBull:  ElteResult["stBull"]  = [];
  const stBear:  ElteResult["stBear"]  = [];
  const tCloud:  ElteResult["trendCloud"] = [];
  const tStop:   ElteResult["trailStop"] = [];
  const e200:    ElteResult["ema200"]  = [];
  const e150:    ElteResult["ema150"]  = [];
  const e250:    ElteResult["ema250"]  = [];
  const h55:     ElteResult["hma55"]   = [];
  const hvOut:   ElteResult["hvSeries"] = [];
  const avgHvOut:ElteResult["avgHvSeries"] = [];
  const te5:     ElteResult["tsEma5"]  = [];
  const te9:     ElteResult["tsEma9"]  = [];
  const te21:    ElteResult["tsEma21"] = [];

  for (let i = 1; i < n; i++) {
    const t = candles[i].time;
    if (!isNaN(st[i])) {
      if (dir[i] === 1) stBull.push({ time: t, value: st[i] });
      else              stBear.push({ time: t, value: st[i] });
    }
    if (!isNaN(tcSt[i])) tCloud.push({ time: t, value: tcSt[i], bull: tcDir[i] === 1 });
    if (!isNaN(trailStop[i])) tStop.push({ time: t, value: trailStop[i] });
    e200.push({ time: t, value: ema200v[i] });
    e150.push({ time: t, value: ema150v[i] });
    e250.push({ time: t, value: ema250v[i] });
    if (!isNaN(hma55v[i])) h55.push({ time: t, value: hma55v[i] });
    if (!isNaN(hv[i]))    hvOut.push({ time: t, value: hv[i] });
    if (!isNaN(avgHV[i])) avgHvOut.push({ time: t, value: avgHV[i] });
    if (!isNaN(ts5[i]))   te5.push ({ time: t, value: ts5[i]  });
    if (!isNaN(ts9[i]))   te9.push ({ time: t, value: ts9[i]  });
    if (!isNaN(ts21[i]))  te21.push({ time: t, value: ts21[i] });
  }

  const last = n - 1;
  return {
    stBull, stBear, trendCloud: tCloud, trailStop: tStop,
    ema200: e200, ema150: e150, ema250: e250, hma55: h55,
    hvSeries: hvOut, avgHvSeries: avgHvOut,
    tsEma5: te5, tsEma9: te9, tsEma21: te21,
    signals,
    lastSens:       sens[last],
    lastBull:       dir[last] === 1,
    lastHv:         isNaN(hv[last])    ? 0 : hv[last],
    lastAvgHv:      isNaN(avgHV[last]) ? 0 : avgHV[last],
    lastHvp:        isNaN(hvp[last])   ? 0 : hvp[last],
    lastVolBull:    vols[last] > volEma25[last],
    lastMacdBull:   macdHist[last] > 0 && macdHist[last] > macdHist[last-1],
    lastEma200Bull: closes[last] > ema200v[last],
    lastAdx:        isNaN(adx[last]) ? 0 : adx[last],
    barColors,
  };
}
