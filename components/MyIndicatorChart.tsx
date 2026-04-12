// components/MyIndicatorChart.tsx — ELTE SMART · Privé · Local uniquement
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, ColorType,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}
interface LWPoint  { time: Time; value: number; }
interface LWCandle { time: Time; open: number; high: number; low: number; close: number; }

// ─── TIMEFRAMES ───────────────────────────────────────────────────────────────
const TF_LIST = [
  { label: "1M",  interval: "1m",  range: "5d",   tfMin: 1    },
  { label: "5M",  interval: "5m",  range: "60d",  tfMin: 5    },
  { label: "15M", interval: "15m", range: "60d",  tfMin: 15   },
  { label: "30M", interval: "30m", range: "60d",  tfMin: 30   },
  { label: "1H",  interval: "60m", range: "200d", tfMin: 60   },
  { label: "D",   interval: "1d",  range: "2y",   tfMin: 1440 },
  { label: "W",   interval: "1wk", range: "5y",   tfMin: 10080},
  { label: "M",   interval: "1mo", range: "10y",  tfMin: 43200},
];
// Timeframes affichés dans le panneau multi-TF (du plus court au plus long)
const DASH_TFS = [
  { label: "1 min",  interval: "1m",  range: "5d"   },
  { label: "5 min",  interval: "5m",  range: "60d"  },
  { label: "15 min", interval: "15m", range: "60d"  },
  { label: "30 min", interval: "30m", range: "60d"  },
  { label: "1 Hour", interval: "60m", range: "200d" },
  { label: "Daily",  interval: "1d",  range: "2y"   },
  { label: "Weekly", interval: "1wk", range: "5y"   },
];

// ─── PARAMS ───────────────────────────────────────────────────────────────────
interface Params {
  ewmaPeriod: number; annual: number; malen: number;
  atrLen: number; autoSens: boolean; manualSens: number;
  showSignals: boolean; strategy: "Normal" | "Confirmed";
  showEma200: boolean; showVolatility: boolean;
  multTP1: number; multTP2: number; multTP3: number;
}
const DEF: Params = {
  ewmaPeriod: 10, annual: 365, malen: 55,
  atrLen: 10, autoSens: true, manualSens: 1.8,
  showSignals: true, strategy: "Normal",
  showEma200: true, showVolatility: false,
  multTP1: 1, multTP2: 2, multTP3: 3,
};

// ─── COMPUTATION ─────────────────────────────────────────────────────────────
interface ComputeResult {
  stBull:   LWPoint[];
  stBear:   LWPoint[];
  ema200:   LWPoint[];
  hvSeries: LWPoint[];
  signals:  { time: number; type: "buy" | "sell"; close: number; st: number; atrVal: number; sens: number }[];
  // Dashboard values (last bar)
  lastSens:       number;
  lastBull:       boolean;
  lastHv:         number;
  lastAvgHv:      number;
  lastVolBull:    boolean;
  lastMacdBull:   boolean;
  lastEma200Bull: boolean;
}

function ema(arr: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let e = arr[0];
  for (const v of arr) { e = v * k + e * (1 - k); out.push(e); }
  return out;
}

function compute(candles: Candle[], p: Params): ComputeResult {
  const n = candles.length;
  const empty: ComputeResult = {
    stBull: [], stBear: [], ema200: [], hvSeries: [], signals: [],
    lastSens: p.manualSens, lastBull: true, lastHv: 0, lastAvgHv: 0,
    lastVolBull: false, lastMacdBull: false, lastEma200Bull: true,
  };
  if (n < 3) return empty;

  const sqrtAnn = Math.sqrt(p.annual) * 100;
  const lambda  = (p.ewmaPeriod - 1) / (p.ewmaPeriod + 1);

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
  for (let i = p.malen; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - p.malen + 1; j <= i; j++) { if (!isNaN(hv[j])) { s += hv[j]; c++; } }
    if (c === p.malen) avgHV[i] = s / p.malen;
  }

  // HVP = percentrank(hv, 365)
  const hvpLen = Math.min(365, n);
  const hvp: number[] = new Array(n).fill(NaN);
  for (let i = hvpLen - 1; i < n; i++) {
    if (isNaN(hv[i])) continue;
    let below = 0;
    for (let j = i - hvpLen + 1; j < i; j++) { if (!isNaN(hv[j]) && hv[j] < hv[i]) below++; }
    hvp[i] = (below / (hvpLen - 1)) * 100;
  }

  // Auto-sensitivity
  const sens: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!p.autoSens) { sens[i] = p.manualSens; continue; }
    const h = hv[i], avg = avgHV[i];
    if (isNaN(h) || isNaN(avg)) continue;
    const maa = avg * 1.4, mab = avg * 1.8, mac = avg * 2.4, mad = avg * 0.6, mae = avg * 0.2;
    if      (h < maa && h > avg) sens[i] = 3.15;
    else if (h < mab && h > maa) sens[i] = 3.5;
    else if (h < mac && h > mab) sens[i] = 3.6;
    else if (h > mac)            sens[i] = 4.0;
    else if (h < maa && h > mad) sens[i] = 3.0;
    else if (h < mad && h > mae) sens[i] = 2.85;
    else                         sens[i] = 3.0;
  }

  // ATR (Wilder RMA)
  const atr: number[] = new Array(n).fill(NaN);
  let rma: number | null = null;
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    rma = rma === null ? tr : (rma * (p.atrLen - 1) + tr) / p.atrLen;
    atr[i] = rma;
  }

  // Supertrend
  const st: number[] = new Array(n).fill(NaN);
  const stDir: number[] = new Array(n).fill(0);
  let prevLB = 0, prevUB = 0, prevST: number | null = null;
  for (let i = 1; i < n; i++) {
    const c = candles[i], pc = candles[i - 1].close;
    const s = isNaN(sens[i]) ? p.manualSens : sens[i];
    const atrV = atr[i];
    if (isNaN(atrV)) continue;
    const src = (c.open + c.high + c.low + c.close) / 4;
    const rawLB = src - s * atrV, rawUB = src + s * atrV;
    const lb = (rawLB > prevLB || pc < prevLB) ? rawLB : prevLB;
    const ub = (rawUB < prevUB || pc > prevUB) ? rawUB : prevUB;
    let dir: number;
    if (prevST !== null && prevST === prevUB) dir = c.close > ub ? 1 : -1;
    else                                       dir = c.close < lb ? -1 : 1;
    st[i] = dir === 1 ? lb : ub; stDir[i] = dir;
    prevST = st[i]; prevLB = lb; prevUB = ub;
  }

  // EMA 200
  const closes = candles.map(c => c.close);
  const ema200vals = ema(closes, 200);

  // MACD (12,26,9)
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal9  = ema(macdLine, 9);
  const hist     = macdLine.map((v, i) => v - signal9[i]);

  // Volume EMA(20)
  const vols   = candles.map(c => c.volume);
  const volEma = ema(vols, 20);

  // ── Build output ──────────────────────────────────────────────────────────
  const stBull: LWPoint[] = [], stBear: LWPoint[] = [],
        ema200out: LWPoint[] = [], hvOut: LWPoint[] = [];
  const signals: ComputeResult["signals"] = [];

  for (let i = 1; i < n; i++) {
    if (!isNaN(hv[i]))
      hvOut.push({ time: candles[i].time as Time, value: parseFloat(hv[i].toFixed(4)) });

    ema200out.push({ time: candles[i].time as Time, value: parseFloat(ema200vals[i].toFixed(6)) });

    if (isNaN(st[i])) continue;
    if (stDir[i] === 1) stBull.push({ time: candles[i].time as Time, value: parseFloat(st[i].toFixed(6)) });
    else                stBear.push({ time: candles[i].time as Time, value: parseFloat(st[i].toFixed(6)) });

    if (!p.showSignals || i < 2 || isNaN(st[i - 1])) continue;
    const crossUp   = candles[i-1].close <= st[i-1] && candles[i].close > st[i];
    const crossDown = candles[i-1].close >= st[i-1] && candles[i].close < st[i];
    const ema200ok  = p.strategy === "Confirmed";
    const bullOk    = ema200ok ? candles[i].close > ema200vals[i] : true;
    const bearOk    = ema200ok ? candles[i].close < ema200vals[i] : true;
    if (crossUp   && bullOk) signals.push({ time: candles[i].time, type: "buy",  close: candles[i].close, st: st[i], atrVal: atr[i], sens: isNaN(sens[i]) ? p.manualSens : sens[i] });
    if (crossDown && bearOk) signals.push({ time: candles[i].time, type: "sell", close: candles[i].close, st: st[i], atrVal: atr[i], sens: isNaN(sens[i]) ? p.manualSens : sens[i] });
  }

  // Last-bar dashboard values
  const last = n - 1;
  return {
    stBull, stBear, ema200: ema200out, hvSeries: hvOut, signals,
    lastSens:       isNaN(sens[last]) ? p.manualSens : parseFloat(sens[last].toFixed(2)),
    lastBull:       stDir[last] === 1,
    lastHv:         isNaN(hv[last])    ? 0 : parseFloat(hv[last].toFixed(2)),
    lastAvgHv:      isNaN(avgHV[last]) ? 0 : parseFloat(avgHV[last].toFixed(2)),
    lastVolBull:    vols[last] > volEma[last],
    lastMacdBull:   hist[last] > 0 && hist[last] > hist[last - 1],
    lastEma200Bull: closes[last] > ema200vals[last],
  };
}

// EMA200 bull/bear d'un tableau de bougies (pour multi-TF)
function ema200Bull(candles: Candle[]): boolean | null {
  if (candles.length < 30) return null;
  const k = 2 / 201;
  let e = candles[0].close;
  for (const c of candles) e = c.close * k + e * (1 - k);
  return candles[candles.length - 1].close > e;
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function Toggle({ val, onChange }: { val: boolean; onChange: (v: boolean) => void }) {
  return (
    <span onClick={() => onChange(!val)} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
      <span style={{
        display: "inline-block", width: 32, height: 17, borderRadius: 99, position: "relative",
        background: val ? "#22c55e" : "#1c1c38", border: "1px solid #2d3748", transition: "background .2s",
      }}>
        <span style={{
          position: "absolute", top: 2, left: val ? 15 : 1, width: 11, height: 11,
          borderRadius: "50%", background: "#e2e8f0", transition: "left .2s",
        }} />
      </span>
    </span>
  );
}

function SettingsPanel({ params, onChange, onClose }: { params: Params; onChange: (p: Params) => void; onClose: () => void }) {
  const [d, set_] = useState<Params>(params);
  const set = <K extends keyof Params>(k: K, v: Params[K]) => set_(p => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { background: "#0d1117", border: "1px solid #1c1c38", borderRadius: 5, color: "#e2e8f0", fontSize: 12, padding: "4px 8px", width: "100%", outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 };
  const sec: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #1c1c38", paddingBottom: 4, marginTop: 14 };
  const val: React.CSSProperties = { color: "#f0c84a", fontWeight: 700 };

  return (
    <div style={{ position: "absolute", top: 54, right: 0, zIndex: 100, background: "#10101e", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", width: 278, boxShadow: "0 8px 32px rgba(0,0,0,.7)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>⚙ Paramètres ELTE SMART</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>

      <div style={sec}>Volatilité EWMA</div>
      <label style={lbl}>Période EWMA <span style={val}>{d.ewmaPeriod}</span></label>
      <input type="range" min={3} max={50} value={d.ewmaPeriod} onChange={e => set("ewmaPeriod", +e.target.value)} style={{ width: "100%", accentColor: "#f0c84a" }} />
      <label style={lbl}>Annualisation
        <select value={d.annual} onChange={e => set("annual", +e.target.value)} style={{ ...inp, width: "auto" }}>
          <option value={252}>252 Boursier</option>
          <option value={365}>365 Forex/Crypto</option>
        </select>
      </label>
      <label style={lbl}>SMA avgHV <span style={val}>{d.malen}</span></label>
      <input type="range" min={10} max={200} step={5} value={d.malen} onChange={e => set("malen", +e.target.value)} style={{ width: "100%", accentColor: "#f0c84a" }} />

      <div style={sec}>Supertrend</div>
      <label style={lbl}>Longueur ATR <span style={val}>{d.atrLen}</span></label>
      <input type="range" min={3} max={50} value={d.atrLen} onChange={e => set("atrLen", +e.target.value)} style={{ width: "100%", accentColor: "#f0c84a" }} />
      <label style={{ ...lbl, marginTop: 10 }}>
        <span>Auto-Sensibilité</span><Toggle val={d.autoSens} onChange={v => set("autoSens", v)} />
      </label>
      {!d.autoSens && (
        <>
          <label style={lbl}>Sensibilité manuelle <span style={val}>{d.manualSens.toFixed(1)}</span></label>
          <input type="range" min={0.5} max={10} step={0.1} value={d.manualSens} onChange={e => set("manualSens", +e.target.value)} style={{ width: "100%", accentColor: "#f0c84a" }} />
        </>
      )}

      <div style={sec}>Signaux & TP/SL</div>
      <label style={{ ...lbl, marginTop: 8 }}><span>Afficher les signaux</span><Toggle val={d.showSignals} onChange={v => set("showSignals", v)} /></label>
      <label style={lbl}>Stratégie</label>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {(["Normal", "Confirmed"] as const).map(s => (
          <button key={s} onClick={() => set("strategy", s)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "4px 0", borderRadius: 5, cursor: "pointer", background: d.strategy === s ? "rgba(240,200,74,.12)" : "transparent", border: `1px solid ${d.strategy === s ? "rgba(240,200,74,.3)" : "#1c1c38"}`, color: d.strategy === s ? "#f0c84a" : "#475569" }}>{s}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
        {(["multTP1","multTP2","multTP3"] as const).map((k, i) => (
          <label key={k} style={{ fontSize: 11, color: "#64748b" }}>
            TP{i+1} ×
            <input type="number" min={0.5} max={10} step={0.5} value={d[k]} onChange={e => set(k, +e.target.value)} style={{ ...inp, marginTop: 2, textAlign: "center" }} />
          </label>
        ))}
      </div>

      <div style={sec}>Affichage</div>
      <label style={{ ...lbl, marginTop: 8 }}><span>EMA 200</span><Toggle val={d.showEma200} onChange={v => set("showEma200", v)} /></label>
      <label style={lbl}><span>Panneau volatilité Hv</span><Toggle val={d.showVolatility} onChange={v => set("showVolatility", v)} /></label>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={() => set_(DEF)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "6px 0", borderRadius: 6, cursor: "pointer", background: "transparent", border: "1px solid #1c1c38", color: "#475569" }}>Réinitialiser</button>
        <button onClick={() => { onChange(d); onClose(); }} style={{ flex: 2, fontSize: 12, fontWeight: 700, padding: "6px 0", borderRadius: 6, cursor: "pointer", background: "rgba(240,200,74,.12)", border: "1px solid rgba(240,200,74,.3)", color: "#f0c84a" }}>✓ Appliquer</button>
      </div>
    </div>
  );
}

// ─── DASHBOARD PANEL ─────────────────────────────────────────────────────────
function Pill({ label, bull, neutral }: { label: string; bull?: boolean; neutral?: boolean }) {
  const bg = neutral ? "#1c1c38" : bull ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)";
  const border = neutral ? "#2d3748" : bull ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)";
  const color  = neutral ? "#64748b" : bull ? "#22c55e" : "#ef4444";
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, border: `1px solid ${border}`, color }}>
      {label}
    </span>
  );
}

interface DashProps {
  res:         ComputeResult;
  params:      Params;
  tfBulls:     (boolean | null)[];
  symbol:      string;
}

function Dashboard({ res, params, tfBulls, symbol }: DashProps) {
  const { lastSens, lastBull, lastHv, lastAvgHv, lastVolBull, lastMacdBull, lastEma200Bull } = res;
  const volatStatus = lastHv > lastAvgHv * 1.4 ? "Expanding 🚀" : lastHv > lastAvgHv ? "Trending 📈" : "Ranging";
  const volatBull   = lastHv > lastAvgHv;

  const lastSig = res.signals.length > 0 ? res.signals[res.signals.length - 1] : null;

  const row = (label: string, right: React.ReactNode) => (
    <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
      <td style={{ padding: "5px 10px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "5px 10px", textAlign: "right" }}>{right}</td>
    </tr>
  );

  return (
    <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, overflow: "hidden", minWidth: 230, flexShrink: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {row("Current strategy",   <span style={{ color: "#94a3b8", fontSize: 12 }}>{params.strategy}</span>)}
          {row("Current sensitivity",<span style={{ color: "#f0c84a", fontWeight: 700, fontSize: 12 }}>{lastSens}</span>)}
          {row("Current Position",   <Pill label={lastBull ? "Buy" : "Sell"} bull={lastBull} />)}
          {row("Current trend",      <Pill label={lastEma200Bull ? "Bullish" : "Bearish"} bull={lastEma200Bull} />)}
          {row("Trend strength",     <span style={{ color: "#94a3b8", fontSize: 12 }}>{lastAvgHv > 0 ? `${Math.round((lastHv / lastAvgHv) * 100)}%` : "—"}</span>)}
          {row("Volume",             <Pill label={lastVolBull ? "Bullish" : "Bearish"} bull={lastVolBull} />)}
          {row("Volatility",         <Pill label={volatStatus} bull={volatBull} />)}
          {row("Momentum",           <Pill label={lastMacdBull ? "Bullish" : "Bearish"} bull={lastMacdBull} />)}
        </tbody>
      </table>

      {/* TP / SL du dernier signal */}
      {lastSig && (
        <div style={{ borderTop: "1px solid #1a1a2e", padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
            {lastSig.type === "buy" ? "▲ Dernier BUY" : "▼ Dernier SELL"}
          </div>
          {(() => {
            const risk = Math.abs(lastSig.close - lastSig.st);
            const dir  = lastSig.type === "buy" ? 1 : -1;
            const tp1  = lastSig.close + dir * params.multTP1 * risk;
            const tp2  = lastSig.close + dir * params.multTP2 * risk;
            const tp3  = lastSig.close + dir * params.multTP3 * risk;
            const sl   = lastSig.close - dir * risk;
            const fmt  = (v: number) => symbol.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
            return (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    { label: `TP 3 ×${params.multTP3}`, val: tp3, color: "#22c55e"  },
                    { label: `TP 2 ×${params.multTP2}`, val: tp2, color: "#4ade80"  },
                    { label: `TP 1 ×${params.multTP1}`, val: tp1, color: "#86efac"  },
                    { label: "Entry",                    val: lastSig.close, color: "#f59e0b" },
                    { label: "Stop loss",                val: sl,  color: "#ef4444"  },
                  ].map(({ label, val: v, color }) => (
                    <tr key={label}>
                      <td style={{ fontSize: 11, color: "#64748b", padding: "2px 0" }}>{label}</td>
                      <td style={{ fontSize: 11, fontWeight: 700, color, textAlign: "right", padding: "2px 0" }}>{fmt(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* Multi-TF Trends */}
      <div style={{ borderTop: "1px solid #1a1a2e", padding: "6px 10px 2px" }}>
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Timeframe trends 📊
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {DASH_TFS.map((tf, i) => {
              const bull = tfBulls[i];
              return (
                <tr key={tf.label} style={{ borderBottom: "1px solid #111" }}>
                  <td style={{ padding: "4px 0", fontSize: 11, color: "#64748b" }}>{tf.label}</td>
                  <td style={{ textAlign: "right", padding: "4px 0" }}>
                    {bull === null
                      ? <span style={{ fontSize: 10, color: "#334155" }}>chargement…</span>
                      : <Pill label={bull ? "Bullish" : "Bearish"} bull={bull} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function MyIndicatorChart({ yfSymbol, label }: { yfSymbol: string; label: string }) {
  const chartRef   = useRef<HTMLDivElement>(null);
  const hvRef      = useRef<HTMLDivElement>(null);
  const chartApi   = useRef<IChartApi | null>(null);
  const hvApi      = useRef<IChartApi | null>(null);
  const csRef      = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const stBullRef  = useRef<ISeriesApi<"Line", Time> | null>(null);
  const stBearRef  = useRef<ISeriesApi<"Line", Time> | null>(null);
  const ema200Ref  = useRef<ISeriesApi<"Line", Time> | null>(null);
  const volRef     = useRef<ISeriesApi<"Histogram", Time> | null>(null);

  const [tfIdx,      setTfIdx]      = useState(5);           // default: Daily
  const [params,     setParams]     = useState<Params>(DEF);
  const [showConf,   setShowConf]   = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [tfBulls,    setTfBulls]    = useState<(boolean | null)[]>(DASH_TFS.map(() => null));
  const [result,     setResult]     = useState<ComputeResult | null>(null);

  const tf = TF_LIST[tfIdx];

  // ── Fetch main data ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(false);
    fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${tf.interval}&range=${tf.range}`)
      .then(r => r.json())
      .then((d: Candle[]) => { setCandles(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [yfSymbol, tf.interval, tf.range]);

  // ── Compute indicator when candles or params change ───────────────────────
  useEffect(() => {
    if (!candles.length) return;
    setResult(compute(candles, params));
  }, [candles, params]);

  // ── Fetch multi-TF EMA200 (parallel) ─────────────────────────────────────
  useEffect(() => {
    setTfBulls(DASH_TFS.map(() => null));
    const controllers = DASH_TFS.map((tf_) => {
      const ctrl = new AbortController();
      fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${tf_.interval}&range=${tf_.range}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then((d: Candle[]) => {
          setTfBulls(prev => {
            const next = [...prev];
            next[DASH_TFS.indexOf(tf_)] = ema200Bull(d);
            return next;
          });
        })
        .catch(() => {});
      return ctrl;
    });
    return () => controllers.forEach(c => c.abort());
  }, [yfSymbol]);

  // ── Build chart ───────────────────────────────────────────────────────────
  const buildChart = useCallback(() => {
    if (!chartRef.current || loading || error || !candles.length || !result) return;
    if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; }
    if (hvApi.current)    { hvApi.current.remove();    hvApi.current    = null; }
    csRef.current = stBullRef.current = stBearRef.current = ema200Ref.current = volRef.current = null;

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth, height: 380,
      layout:  { background: { type: ColorType.Solid, color: "#060610" }, textColor: "#94a3b8" },
      grid:    { vertLines: { color: "#1c1c38" }, horzLines: { color: "#1c1c38" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1c1c38" },
      timeScale: { borderColor: "#1c1c38", timeVisible: true, secondsVisible: false },
    });
    chartApi.current = chart;

    // Candles
    const cs = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#22c55e", borderDownColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    csRef.current = cs;
    cs.setData(candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close } as LWCandle)));

    // Supertrend bull / bear
    const stB = chart.addLineSeries({ color: "#22c55e", lineWidth: 2, title: "ST Bull", lastValueVisible: false, priceLineVisible: false });
    const stR = chart.addLineSeries({ color: "#ef4444", lineWidth: 2, title: "ST Bear", lastValueVisible: false, priceLineVisible: false });
    stBullRef.current = stB; stBearRef.current = stR;
    stB.setData(result.stBull); stR.setData(result.stBear);

    // EMA 200
    if (params.showEma200) {
      const e200 = chart.addLineSeries({ color: "#3b82f6", lineWidth: 1, title: "EMA 200", lastValueVisible: false, priceLineVisible: false });
      ema200Ref.current = e200;
      e200.setData(result.ema200);
    }

    // Signaux BUY / SELL
    if (params.showSignals && result.signals.length > 0) {
      cs.setMarkers(result.signals.map(s => ({
        time:     s.time as Time,
        position: s.type === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
        color:    s.type === "buy" ? "#22c55e" : "#ef4444",
        shape:    s.type === "buy" ? ("arrowUp" as const)  : ("arrowDown" as const),
        text:     s.type === "buy" ? "BUY"                 : "SELL",
        size:     1,
      })));
    }

    // TP / SL price lines pour le dernier signal
    const lastSig = result.signals.length > 0 ? result.signals[result.signals.length - 1] : null;
    if (lastSig) {
      const risk = Math.abs(lastSig.close - lastSig.st);
      const dir  = lastSig.type === "buy" ? 1 : -1;
      const levels = [
        { price: lastSig.close + dir * params.multTP3 * risk, color: "#22c55e",  title: `TP 3 ×${params.multTP3}` },
        { price: lastSig.close + dir * params.multTP2 * risk, color: "#4ade80",  title: `TP 2 ×${params.multTP2}` },
        { price: lastSig.close + dir * params.multTP1 * risk, color: "#86efac",  title: `TP 1 ×${params.multTP1}` },
        { price: lastSig.close,                               color: "#f59e0b",  title: "Entry"                   },
        { price: lastSig.close - dir * risk,                  color: "#ef4444",  title: "Stop loss"               },
      ];
      for (const { price, color, title } of levels) {
        cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
      }
    }

    // Volume
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    volRef.current = vol;
    vol.setData(candles.map(c => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)" })));

    chart.timeScale().fitContent();

    // Panneau Hv
    if (params.showVolatility && hvRef.current && result.hvSeries.length > 0) {
      const hvc = createChart(hvRef.current, {
        width: hvRef.current.clientWidth, height: 110,
        layout:  { background: { type: ColorType.Solid, color: "#060610" }, textColor: "#64748b" },
        grid:    { vertLines: { color: "#1c1c38" }, horzLines: { color: "#1c1c38" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1c1c38" },
        timeScale: { borderColor: "#1c1c38", timeVisible: true },
      });
      hvApi.current = hvc;
      hvc.addLineSeries({ color: "#7c3aed", lineWidth: 1, title: "Hv EWMA" }).setData(result.hvSeries);
      hvc.timeScale().fitContent();
    }

    const obs = new ResizeObserver(() => {
      if (chartRef.current && chartApi.current) chartApi.current.applyOptions({ width: chartRef.current.clientWidth });
      if (hvRef.current   && hvApi.current)    hvApi.current.applyOptions({ width: hvRef.current.clientWidth });
    });
    obs.observe(chartRef.current);
    return () => {
      obs.disconnect();
      if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; }
      if (hvApi.current)    { hvApi.current.remove();    hvApi.current    = null; }
    };
  }, [candles, loading, error, result, params]);

  useEffect(() => { const c = buildChart(); return c; }, [buildChart]);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20, position: "relative" }}>

      {showConf && (
        <SettingsPanel params={params} onChange={setParams} onClose={() => setShowConf(false)} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8 }}>
            ELTE SMART — {label}
            <span style={{ fontSize: 9, color: "#475569", textTransform: "none", letterSpacing: 0, background: "#0d1117", border: "1px solid #1c1c38", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
              EWMA {params.ewmaPeriod} · ATR {params.atrLen} · {params.autoSens ? `Auto ${params.malen}` : `Sens ${params.manualSens.toFixed(1)}`}
            </span>
          </h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            {params.strategy} · {tf.label} · {candles.length} bougies
          </p>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {/* Dernier signal */}
          {result && result.signals.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: result.signals[result.signals.length-1].type === "buy" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
              border:     `1px solid ${result.signals[result.signals.length-1].type === "buy" ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
              color:      result.signals[result.signals.length-1].type === "buy" ? "#22c55e" : "#ef4444" }}>
              {result.signals[result.signals.length-1].type === "buy" ? "▲ BUY" : "▼ SELL"}
            </span>
          )}

          {/* Bouton paramètres */}
          <button onClick={() => setShowConf(s => !s)} title="Paramètres" style={{ background: showConf ? "rgba(240,200,74,.12)" : "transparent", border: `1px solid ${showConf ? "rgba(240,200,74,.3)" : "#1c1c38"}`, color: showConf ? "#f0c84a" : "#475569", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 }}>
            ⚙
          </button>

          {/* Sélecteur d'unité de temps */}
          {TF_LIST.map((t, i) => (
            <button key={t.label} onClick={() => setTfIdx(i)} style={{
              fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, cursor: "pointer", minWidth: 28,
              background: tfIdx === i ? "rgba(240,200,74,.12)" : "transparent",
              border:     `1px solid ${tfIdx === i ? "rgba(240,200,74,.3)" : "#1c1c38"}`,
              color:      tfIdx === i ? "#f0c84a" : "#475569",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Corps : graphique + dashboard ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Graphique */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && <div className="skeleton" style={{ height: 380 }} />}
          {error   && <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 13 }}>Données indisponibles</div>}
          {!loading && !error && <div ref={chartRef} style={{ height: 380 }} />}
          {!loading && !error && params.showVolatility && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 600, paddingLeft: 4, marginBottom: 2 }}>Volatilité EWMA (Hv)</div>
              <div ref={hvRef} style={{ height: 110 }} />
            </div>
          )}
        </div>

        {/* Dashboard */}
        {result && !loading && !error && (
          <Dashboard res={result} params={params} tfBulls={tfBulls} symbol={yfSymbol} />
        )}
      </div>

      {/* ── Légende ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { color: "#22c55e", label: "ST haussier" },
          { color: "#ef4444", label: "ST baissier"  },
          ...(params.showEma200 ? [{ color: "#3b82f6", label: "EMA 200" }] : []),
          ...(params.showVolatility ? [{ color: "#7c3aed", label: "Hv EWMA" }] : []),
        ].map(({ color, label: l }) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 3, background: color, borderRadius: 2, display: "inline-block" }} />{l}
          </span>
        ))}
        {params.showSignals && <><span style={{ color: "#22c55e" }}>▲ BUY</span><span style={{ color: "#ef4444" }}>▼ SELL</span></>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#334155" }}>🔒 Privé · Local uniquement</span>
      </div>
    </div>
  );
}
