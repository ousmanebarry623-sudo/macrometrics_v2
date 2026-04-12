// components/IndicatorSettings.tsx
// Panneau de paramètres complet ELTE SMART — style TradingView
"use client";
import { useState } from "react";
import {
  type ElteParams, DEFAULT_PARAMS,
  type VolModel, type Strategy, type TrendCloudPeriod,
} from "@/lib/elte-compute";

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const C = {
  bg:      "#0d0d1a",
  border:  "#1e293b",
  row:     "#111827",
  text:    "#94a3b8",
  muted:   "#475569",
  gold:    "#f0c84a",
  green:   "#22c55e",
  red:     "#ef4444",
  indigo:  "#818cf8",
};

const inp: React.CSSProperties = {
  background: "#060610", border: `1px solid ${C.border}`, borderRadius: 5,
  color: C.text, fontSize: 12, padding: "4px 8px", outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: C.muted, fontWeight: 500,
  display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8,
};
const sec: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.muted,
  textTransform: "uppercase", letterSpacing: "0.1em",
  borderBottom: `1px solid ${C.border}`, paddingBottom: 5, marginTop: 14, marginBottom: 2,
};
const goldVal: React.CSSProperties = { color: C.gold, fontWeight: 700, fontFamily: "monospace" };

// ─── TOGGLE ───────────────────────────────────────────────────────────────────
function Toggle({ val, onChange }: { val: boolean; onChange: (v: boolean) => void }) {
  return (
    <span onClick={() => onChange(!val)} style={{
      display: "inline-block", width: 34, height: 18, borderRadius: 99, position: "relative",
      background: val ? C.green : "#1c1c38", border: `1px solid ${val ? C.green : C.border}`,
      transition: "background .15s", cursor: "pointer", flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: val ? 16 : 2, width: 12, height: 12,
        borderRadius: "50%", background: "#e2e8f0", transition: "left .15s",
      }} />
    </span>
  );
}

// ─── CHIP SELECTOR ────────────────────────────────────────────────────────────
function Chips<T extends string>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 5, cursor: "pointer",
          background: value === o ? "rgba(240,200,74,.12)" : "transparent",
          border:     `1px solid ${value === o ? "rgba(240,200,74,.35)" : C.border}`,
          color:      value === o ? C.gold : C.muted,
        }}>{o}</button>
      ))}
    </div>
  );
}

// ─── SLIDER ROW ──────────────────────────────────────────────────────────────
function SliderRow({ label, val, min, max, step = 1, onChange, suffix = "" }:
  { label: string; val: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <>
      <label style={lbl}>
        {label} <span style={goldVal}>{val}{suffix}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: C.gold, marginTop: 2 }} />
    </>
  );
}

// ─── SECTION COLLAPSIBLE ─────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }:
  { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div style={{ ...sec, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
        onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 400 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );
}

// ─── MAIN SETTINGS PANEL ─────────────────────────────────────────────────────
interface Props {
  params:   ElteParams;
  onChange: (p: ElteParams) => void;
  onClose:  () => void;
}

export default function IndicatorSettings({ params, onChange, onClose }: Props) {
  const [d, setD] = useState<ElteParams>(params);
  const set = <K extends keyof ElteParams>(k: K, v: ElteParams[K]) =>
    setD(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
        width: 520, maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,.8)",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>⚙ ELTE SMART — Paramètres</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Tous les inputs de l'indicateur</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "0 20px 16px", flex: 1 }}>

          {/* ── 1. MODÈLE DE VOLATILITÉ ──────────────────────────────────── */}
          <Section title="Modèle de volatilité">
            <label style={lbl}>Modèle</label>
            <select value={d.volModel} onChange={e => set("volModel", e.target.value as VolModel)}
              style={{ ...inp, width: "100%", marginTop: 4 }}>
              {(["EWMA","CTC","Parkinson","GK","RS","GKYZ","YZ","MAD","MAAD"] as VolModel[]).map(m => (
                <option key={m} value={m}>{m === "EWMA" ? "EWMA (défaut)" : m === "CTC" ? "Close to Close" : m === "Parkinson" ? "Parkinson" : m === "GK" ? "Garman Klass" : m === "RS" ? "Rogers Satchell" : m === "GKYZ" ? "Garman-Klass Yang-Zhang" : m === "YZ" ? "Yang Zhang" : m === "MAD" ? "Mean Absolute Deviation" : "Median Absolute Deviation"}</option>
              ))}
            </select>
            <SliderRow label="Période"       val={d.period} min={3}  max={50}  onChange={v => set("period",v)} />
            <label style={lbl}>Annualisation
              <select value={d.annual} onChange={e => set("annual", +e.target.value)} style={{ ...inp, width: "auto" }}>
                <option value={365}>365 — Forex / Crypto</option>
                <option value={252}>252 — Actions / Futures</option>
              </select>
            </label>
            {d.volModel === "YZ" && (
              <SliderRow label="Facteur a (Yang-Zhang)" val={d.a} min={1} max={3} step={0.01} onChange={v => set("a", v)} />
            )}
            <SliderRow label="SMA avgHV (malen)" val={d.malen} min={10} max={200} step={5} onChange={v => set("malen",v)} />
            <SliderRow label="Percentile Length"  val={d.Plen}  min={50} max={500} step={5}  onChange={v => set("Plen",v)} />
          </Section>

          {/* ── 2. SIGNAUX & STRATÉGIE ───────────────────────────────────── */}
          <Section title="Signaux & Stratégie">
            <label style={lbl}><span>Afficher les signaux</span><Toggle val={d.showSignals} onChange={v => set("showSignals", v)} /></label>
            <label style={lbl}>Stratégie</label>
            <Chips<Strategy> value={d.strategy} options={["Normal","Confirmed","Trend scalper"]} onChange={v => set("strategy",v)} />
            <label style={{ ...lbl, marginTop: 10 }}>
              <span>Auto-Sensibilité</span><Toggle val={d.autoSens} onChange={v => set("autoSens", v)} />
            </label>
            {!d.autoSens && (
              <SliderRow label="Sensibilité manuelle" val={d.manualSens} min={0.5} max={20} step={0.1} onChange={v => set("manualSens",v)} />
            )}
            <SliderRow label="Longueur ATR (Supertrend)" val={d.atrLen} min={3} max={50} onChange={v => set("atrLen",v)} />
          </Section>

          {/* ── 3. FILTRES DE SIGNAUX ─────────────────────────────────────── */}
          <Section title="Filtres de signaux">
            <label style={lbl}>
              <span>Filtre consolidation (ADX &gt; 20)</span>
              <Toggle val={d.consFilter} onChange={v => set("consFilter",v)} />
            </label>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>Élimine les signaux en marché sans tendance</div>

            <label style={{ ...lbl, marginTop: 8 }}>
              <span>Smart signals only (EMA 200)</span>
              <Toggle val={d.smartFilter} onChange={v => set("smartFilter",v)} />
            </label>
            <div style={{ fontSize: 10, color: "#334155" }}>Buy uniquement si close &gt; EMA(200), Sell si close &lt; EMA(200)</div>

            <label style={{ ...lbl, marginTop: 8 }}>
              <span>Signaux haut volume uniquement</span>
              <Toggle val={d.highVolFilter} onChange={v => set("highVolFilter",v)} />
            </label>
            <div style={{ fontSize: 10, color: "#334155" }}>EMA(vol,25) croît par rapport à EMA(vol,26)</div>

            <label style={{ ...lbl, marginTop: 8 }}>
              <span>Filtre Trend Cloud</span>
              <Toggle val={d.trendCloudFilter} onChange={v => set("trendCloudFilter",v)} />
            </label>
            <div style={{ fontSize: 10, color: "#334155" }}>Buy si EMA150 &gt; EMA250 (mode "New")</div>
          </Section>

          {/* ── 4. RISK MANAGEMENT / TP SL ───────────────────────────────── */}
          <Section title="Risk Management — TP / SL">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
              {([["multTP1","TP 1 ×"],["multTP2","TP 2 ×"],["multTP3","TP 3 ×"]] as [keyof ElteParams, string][]).map(([k, lbl2]) => (
                <label key={k} style={{ fontSize: 11, color: C.muted }}>
                  {lbl2}
                  <input type="number" min={0.5} max={20} step={0.5} value={d[k] as number}
                    onChange={e => set(k, +e.target.value)}
                    style={{ ...inp, width: "100%", marginTop: 3, textAlign: "center" }} />
                </label>
              ))}
            </div>
            <label style={{ ...lbl, marginTop: 10 }}>
              <span>Trailing Stop-Loss</span>
              <Toggle val={d.trailingSL} onChange={v => set("trailingSL",v)} />
            </label>
            {d.trailingSL && (
              <>
                <label style={lbl}>
                  <span>Mode % (sinon ATR)</span>
                  <Toggle val={d.usePercSL} onChange={v => set("usePercSL",v)} />
                </label>
                {d.usePercSL && (
                  <SliderRow label="% Trailing SL" val={d.percSL} min={0.1} max={10} step={0.1} onChange={v => set("percSL",v)} suffix="%" />
                )}
              </>
            )}
          </Section>

          {/* ── 5. TREND CLOUD ───────────────────────────────────────────── */}
          <Section title="Trend Cloud">
            <label style={lbl}><span>Afficher le Trend Cloud</span><Toggle val={d.showTrendCloud} onChange={v => set("showTrendCloud",v)} /></label>
            {d.showTrendCloud && (
              <>
                <label style={lbl}>Période du Trend Cloud</label>
                <Chips<TrendCloudPeriod> value={d.trendCloudPeriod} options={["Short term","Long term","New"]}
                  onChange={v => set("trendCloudPeriod",v)} />
                <label style={{ ...lbl, marginTop: 10 }}>
                  <span>Fast Trend Cloud</span>
                  <Toggle val={d.fastTrendCloud} onChange={v => set("fastTrendCloud",v)} />
                </label>
                {d.fastTrendCloud && (
                  <SliderRow label="Longueur Fast TC" val={d.fastTrendCloudLen} min={5} max={200} step={5}
                    onChange={v => set("fastTrendCloudLen",v)} />
                )}
              </>
            )}
          </Section>

          {/* ── 6. AFFICHAGE ─────────────────────────────────────────────── */}
          <Section title="Affichage">
            {([
              ["showEma200",  "EMA 200 (bleu)"],
              ["showEma150",  "EMA 150 (violet)"],
              ["showEma250",  "EMA 250 (orange)"],
              ["showHma55",   "HMA 55 (vert clair)"],
              ["showVolPanel","Panneau volatilité Hv"],
            ] as [keyof ElteParams, string][]).map(([k, label2]) => (
              <label key={k} style={lbl}>
                <span>{label2}</span>
                <Toggle val={d[k] as boolean} onChange={v => set(k, v)} />
              </label>
            ))}
          </Section>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={() => setD(DEFAULT_PARAMS)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "7px 0", borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${C.border}`, color: C.muted }}>
            Réinitialiser
          </button>
          <button onClick={() => { onChange(d); onClose(); }} style={{ flex: 3, fontSize: 13, fontWeight: 700, padding: "7px 0", borderRadius: 6, cursor: "pointer", background: "rgba(240,200,74,.12)", border: "1px solid rgba(240,200,74,.3)", color: C.gold }}>
            ✓ Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
