// components/ElteSmartDashboard.tsx
// Dashboard ELTE SMART — privé, local uniquement.
// Calcule : position, sensibilité auto, TP/SL, score B/S, 11 timeframes EMA200.
"use client";
import { useEffect, useState, useCallback, useRef } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

interface Signal { time: number; type: "buy" | "sell"; close: number; st: number; }

interface DashResult {
  position:   "Buy" | "Sell";
  sensitivity: number;
  trend:       "Bullish" | "Bearish";
  trendStrength: number;   // %
  volume:      "Bullish" | "Bearish";
  volatility:  "Expanding 🚀" | "Trending 📈" | "Ranging";
  volatBull:   boolean;
  momentum:    "Bullish" | "Bearish";
  lastSignal:  Signal | null;
  barsSince:   number;
  candles:     Candle[];
}

// ─── MULTI-TF CONFIG ─────────────────────────────────────────────────────────
// Les 11 TFs du screenshot, construits depuis 6 sources YF avec agrégation
const TF_DASH = [
  { label: "1 min",   src: "1m",  range: "5d",    factor: 1  },
  { label: "3 min",   src: "1m",  range: "5d",    factor: 3  },
  { label: "5 min",   src: "5m",  range: "60d",   factor: 1  },
  { label: "10 min",  src: "5m",  range: "60d",   factor: 2  },
  { label: "15 min",  src: "15m", range: "60d",   factor: 1  },
  { label: "30 min",  src: "30m", range: "60d",   factor: 1  },
  { label: "1 Hour",  src: "60m", range: "200d",  factor: 1  },
  { label: "2 Hour",  src: "60m", range: "200d",  factor: 2  },
  { label: "4 Hour",  src: "60m", range: "200d",  factor: 4  },
  { label: "12 Hour", src: "60m", range: "200d",  factor: 12 },
  { label: "Daily",   src: "1d",  range: "2y",    factor: 1  },
];

// Sources uniques à fetcher (évite les doublons)
const TF_SOURCES = [
  { interval: "1m",  range: "5d"   },
  { interval: "5m",  range: "60d"  },
  { interval: "15m", range: "60d"  },
  { interval: "30m", range: "60d"  },
  { interval: "60m", range: "200d" },
  { interval: "1d",  range: "2y"   },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let e = arr[0];
  return arr.map(v => { e = v * k + e * (1 - k); return e; });
}

function aggregateCandles(candles: Candle[], factor: number): Candle[] {
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

function ema200Bull(candles: Candle[]): boolean | null {
  if (candles.length < 30) return null;
  const e = ema(candles.map(c => c.close), Math.min(200, candles.length));
  return candles[candles.length - 1].close > e[e.length - 1];
}

// ─── ELTE SMART CORE ─────────────────────────────────────────────────────────
function computeDash(candles: Candle[], ewmaPeriod = 10, annual = 365, malen = 55, atrLen = 10): DashResult | null {
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
  const st: number[] = new Array(n).fill(NaN);
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
    st[i] = dir===1?lb:ub; stDir[i]=dir;
    prevST=st[i]; prevLB=lb; prevUB=ub;
  }
  // EMA 200
  const closes  = candles.map(c => c.close);
  const ema200v  = ema(closes, Math.min(200, n));
  // MACD hist
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
  const macdL = ema12.map((v2, i) => v2 - ema26[i]);
  const sig9  = ema(macdL, 9);
  const hist  = macdL.map((v2, i) => v2 - sig9[i]);
  // Volume EMA20
  const vols   = candles.map(c => c.volume);
  const volEma = ema(vols, 20);

  // Signals
  const signals: Signal[] = [];
  for (let i = 2; i < n; i++) {
    if (isNaN(st[i])||isNaN(st[i-1])) continue;
    if (candles[i-1].close<=st[i-1] && candles[i].close>st[i])
      signals.push({ time: candles[i].time, type: "buy",  close: candles[i].close, st: st[i] });
    if (candles[i-1].close>=st[i-1] && candles[i].close<st[i])
      signals.push({ time: candles[i].time, type: "sell", close: candles[i].close, st: st[i] });
  }

  const last = n - 1;
  // La dernière bougie peut être incomplète (en cours) → utiliser l'avant-dernière
  // pour volume/momentum afin d'éviter les faux Bearish sur bougies partielles
  const ref = Math.max(last - 1, 0);

  const lastSig = signals.length > 0 ? signals[signals.length-1] : null;
  const sigIdx  = lastSig ? candles.findIndex(c => c.time === lastSig.time) : -1;
  const barsSince = sigIdx >= 0 ? last - sigIdx : 0;

  // ── Fenêtre de 5 barres complètes (ref-4 à ref) pour tous les indicateurs ──
  // Évite les faux signaux sur la bougie partielle (last) quel que soit le TF
  const W = 5;
  const w0 = Math.max(0, ref - W + 1); // borne basse de la fenêtre

  // Volatilité : max Hv sur la fenêtre (capture les spikes récents)
  let maxHv = 0;
  let refAvg = 0;
  for (let i = w0; i <= ref; i++) {
    if (!isNaN(hv[i]))    maxHv  = Math.max(maxHv,  hv[i]);
    if (!isNaN(avgHV[i])) refAvg = avgHV[i]; // prend le dernier avgHV valide
  }
  const lH   = maxHv;
  const lAvg = refAvg > 0 ? refAvg : (isNaN(avgHV[last]) ? 0 : avgHV[last]);

  // Volume : bull vol vs bear vol sur les 20 dernières bougies complètes
  const volWindow = candles.slice(Math.max(0, ref - 19), ref + 1);
  let bullVol = 0, bearVol = 0;
  for (const c of volWindow) {
    if (c.close >= c.open) bullVol += c.volume;
    else                   bearVol += c.volume;
  }
  const volBull = bullVol >= bearVol;

  // Momentum : direction du MACD hist sur 5 barres (tendance, pas snapshot unique)
  // Bullish si la moyenne des 3 dernières barres > moyenne des 3 barres précédentes
  const histRecent = hist.slice(w0, ref + 1);           // ≤5 valeurs
  const mid = Math.floor(histRecent.length / 2);
  const avgNew = histRecent.slice(mid).reduce((a, b) => a + b, 0) / Math.max(1, histRecent.length - mid);
  const avgOld = histRecent.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(1, mid);
  const momBull = hist[ref] > 0 || avgNew > avgOld; // positif OU tendance haussière

  return {
    position:      stDir[last]===1 ? "Buy" : "Sell",
    sensitivity:   isNaN(sens[last]) ? 3.0 : parseFloat(sens[last].toFixed(2)),
    trend:         closes[last] > ema200v[last] ? "Bullish" : "Bearish",
    trendStrength: lAvg > 0 ? parseFloat(((lH/lAvg)*100).toFixed(1)) : 0,
    volume:        volBull ? "Bullish" : "Bearish",
    volatility:    lH > lAvg*1.4 ? "Expanding 🚀" : lH > lAvg ? "Trending 📈" : "Ranging",
    volatBull:     lH > lAvg,
    momentum:      momBull ? "Bullish" : "Bearish",
    lastSignal:    lastSig,
    barsSince,
    candles,
  };
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function Pill({ label, bull, neutral }: { label: string; bull?: boolean; neutral?: boolean }) {
  const bg  = neutral ? "#1a1a2e" : bull ? "rgba(34,197,94,.18)" : "rgba(239,68,68,.18)";
  const bd  = neutral ? "#2d3748" : bull ? "rgba(34,197,94,.4)"  : "rgba(239,68,68,.4)";
  const col = neutral ? "#64748b" : bull ? "#22c55e"             : "#ef4444";
  return (
    <span style={{ display:"inline-block", padding:"2px 10px", borderRadius:4, fontSize:11, fontWeight:700, background:bg, border:`1px solid ${bd}`, color:col }}>
      {label}
    </span>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <tr style={{ borderBottom:"1px solid #111827" }}>
      <td style={{ padding:"6px 12px", fontSize:12, color:"#94a3b8", whiteSpace:"nowrap" }}>{label}</td>
      <td style={{ padding:"6px 12px", textAlign:"right" }}>{right}</td>
    </tr>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export interface DashMetrics {
  trend:         "Bullish" | "Bearish";
  volume:        "Bullish" | "Bearish";
  momentum:      "Bullish" | "Bearish";
  volatility:    "Expanding 🚀" | "Trending 📈" | "Ranging";
  barsSince:     number;
  // Signal PRO enrichment
  position:      "Buy" | "Sell";
  sensitivity:   number;
  trendStrength: number;
  tfBulls:       (boolean | null)[];
}
interface Props {
  yfSymbol:   string;
  tfLabel:    string;
  yfInterval: string;
  yfRange:    string;
  onMetrics?: (m: DashMetrics) => void;
}

export default function ElteSmartDashboard({ yfSymbol, tfLabel, yfInterval, yfRange, onMetrics }: Props) {
  const [dash,    setDash]    = useState<DashResult | null>(null);
  const [tfBulls, setTfBulls] = useState<(boolean | null)[]>(TF_DASH.map(() => null));
  const [loading, setLoading] = useState(true);
  const dashRef = useRef<DashResult | null>(null);

  // ── Fetch main data + compute dashboard ──────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setDash(null);
    fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${yfInterval}&range=${yfRange}`)
      .then(r => r.json())
      .then((d: Candle[]) => {
        const result = computeDash(d);
        setDash(result);
        dashRef.current = result; // keep ref in sync
        setLoading(false);
        if (result && onMetrics) {
          onMetrics({
            trend:         result.trend,
            volume:        result.volume,
            momentum:      result.momentum,
            volatility:    result.volatility,
            barsSince:     result.barsSince,
            position:      result.position,
            sensitivity:   result.sensitivity,
            trendStrength: result.trendStrength,
            tfBulls:       TF_DASH.map(() => null), // will be updated by fetchMultiTF
          });
        }
      })
      .catch(() => setLoading(false));
  }, [yfSymbol, yfInterval, yfRange, onMetrics]);

  // ── Fetch multi-TF EMA200 (6 sources → 11 TFs via agrégation) ────────────
  const fetchMultiTF = useCallback(() => {
    setTfBulls(TF_DASH.map(() => null));

    // Fetch les 6 sources uniques
    const controllers: AbortController[] = [];
    const cache: Record<string, Candle[]> = {};

    const updateTfBulls = (srcKey: string, data: Candle[]) => {
      cache[srcKey] = data;
      // Recalculer tous les TFs qui dépendent de cette source
      setTfBulls(prev => {
        const next = [...prev];
        TF_DASH.forEach((tf, i) => {
          const key = `${tf.src}|${tf.range}`;
          if (key === srcKey && cache[key]) {
            const aggregated = aggregateCandles(cache[key], tf.factor);
            next[i] = ema200Bull(aggregated);
          }
        });
        // Propagate updated tfBulls to Signal PRO
        if (onMetrics && dashRef.current) {
          const d = dashRef.current;
          onMetrics({
            trend:         d.trend,
            volume:        d.volume,
            momentum:      d.momentum,
            volatility:    d.volatility,
            barsSince:     d.barsSince,
            position:      d.position,
            sensitivity:   d.sensitivity,
            trendStrength: d.trendStrength,
            tfBulls:       next,
          });
        }
        return next;
      });
    };

    TF_SOURCES.forEach(src => {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const key = `${src.interval}|${src.range}`;
      fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${src.interval}&range=${src.range}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then((d: Candle[]) => updateTfBulls(key, d))
        .catch(() => {});
    });

    return () => controllers.forEach(c => c.abort());
  }, [yfSymbol]);

  useEffect(() => { const cleanup = fetchMultiTF(); return cleanup; }, [fetchMultiTF]);

  // ── Score B4 / S4 ─────────────────────────────────────────────────────────
  const scoreLabel = dash
    ? (() => {
        if (!dash.lastSignal) return null;
        const letter = dash.lastSignal.type === "buy" ? "B" : "S";
        const s = dash.sensitivity;
        const sens = Number.isInteger(s) ? String(s) : s.toFixed(1).replace(/\.0$/, "");
        return `${letter}${sens}`;
      })()
    : null;
  const scoreBull = dash?.lastSignal?.type === "buy";

  // ── TP/SL ─────────────────────────────────────────────────────────────────
  const tpsl = (() => {
    if (!dash?.lastSignal) return null;
    const { close, st, type } = dash.lastSignal;
    const risk = Math.abs(close - st);
    const dir  = type === "buy" ? 1 : -1;
    const isJpy = yfSymbol.includes("JPY");
    const fmt = (v: number) => isJpy ? v.toFixed(3) : v.toFixed(5);
    return {
      tp3:  fmt(close + dir * 3 * risk),
      tp2:  fmt(close + dir * 2 * risk),
      tp1:  fmt(close + dir * 1 * risk),
      entry: fmt(close),
      sl:   fmt(close - dir * risk),
      type,
    };
  })();

  if (loading) {
    return (
      <div style={{ background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10, width:240, padding:20, display:"flex", alignItems:"center", justifyContent:"center", minHeight:400 }}>
        <span style={{ color:"#334155", fontSize:12 }}>Calcul ELTE SMART…</span>
      </div>
    );
  }

  return (
    <div style={{ background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10, width:250, flexShrink:0, overflow:"hidden" }}>

      {/* ── Score B4 / S4 ─────────────────────────────────────────────────── */}
      {scoreLabel && (
        <div style={{ padding:"10px 14px", borderBottom:"1px solid #111827", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{
            fontSize:22, fontWeight:900, fontFamily:"monospace",
            color: scoreBull ? "#22c55e" : "#ef4444",
            background: scoreBull ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
            border: `1px solid ${scoreBull ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
            borderRadius:8, padding:"4px 14px", letterSpacing:1,
          }}>
            {scoreLabel}
          </span>
          <div>
            <div style={{ fontSize:11, color:"#64748b", lineHeight:1.3 }}>
              {scoreBull ? "Signal haussier" : "Signal baissier"}
            </div>
            <div style={{ fontSize:10, color:"#334155" }}>
              {dash?.barsSince === 0 ? "cette bougie" : `il y a ${dash?.barsSince} bougie${dash!.barsSince > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      )}

      {/* ── Métriques principales ─────────────────────────────────────────── */}
      {dash && (
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            <Row label="Current strategy"    right={<span style={{ color:"#94a3b8", fontSize:12 }}>Normal</span>} />
            <Row label="Current sensitivity" right={<span style={{ color:"#f0c84a", fontWeight:700, fontSize:12 }}>{dash.sensitivity}</span>} />
            <Row label="Current Position"    right={<Pill label={dash.position} bull={dash.position==="Buy"} />} />
            <Row label="Current trend"       right={<Pill label={dash.trend}    bull={dash.trend==="Bullish"} />} />
            <Row label="Trend strength"      right={<span style={{ color:"#94a3b8", fontSize:12 }}>{dash.trendStrength > 0 ? `${dash.trendStrength} %` : "—"}</span>} />
            <Row label="Volume"              right={<Pill label={dash.volume}   bull={dash.volume==="Bullish"} />} />
            <Row label="Volatility"          right={<Pill label={dash.volatility} bull={dash.volatBull} />} />
            <Row label="Momentum"            right={<Pill label={dash.momentum} bull={dash.momentum==="Bullish"} />} />
          </tbody>
        </table>
      )}

      {/* ── TP / SL ───────────────────────────────────────────────────────── */}
      {tpsl && (
        <div style={{ borderTop:"1px solid #111827", padding:"8px 14px 6px" }}>
          <div style={{ fontSize:10, color:"#475569", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
            {tpsl.type === "buy" ? "▲" : "▼"} Niveaux · {tfLabel}
          </div>
          {[
            { label:`TP 3`, val:tpsl.tp3,   color:"#22c55e"  },
            { label:`TP 2`, val:tpsl.tp2,   color:"#4ade80"  },
            { label:`TP 1`, val:tpsl.tp1,   color:"#86efac"  },
            { label:"Entry", val:tpsl.entry, color:"#f59e0b"  },
            { label:"Stop",  val:tpsl.sl,    color:"#ef4444"  },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"2px 0" }}>
              <span style={{ fontSize:11, color:"#64748b" }}>{label}</span>
              <span style={{ fontSize:12, fontWeight:700, color, fontFamily:"monospace" }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Timeframe trends ─────────────────────────────────────────────── */}
      <div style={{ borderTop:"1px solid #111827", padding:"8px 14px 8px" }}>
        <div style={{ fontSize:10, color:"#475569", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>
          Timeframe trends 📊
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            {TF_DASH.map((tf, i) => {
              const bull = tfBulls[i];
              return (
                <tr key={tf.label} style={{ borderBottom:"1px solid #0d0d1a" }}>
                  <td style={{ padding:"3px 0", fontSize:11, color:"#64748b" }}>{tf.label}</td>
                  <td style={{ textAlign:"right", padding:"3px 0" }}>
                    {bull === null
                      ? <span style={{ fontSize:10, color:"#1e293b" }}>···</span>
                      : <Pill label={bull ? "Bullish" : "Bearish"} bull={bull} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding:"6px 14px", borderTop:"1px solid #111827", fontSize:9, color:"#1e293b", textAlign:"right" }}>
        🔒 ELTE SMART · Privé · Local uniquement
      </div>
    </div>
  );
}
