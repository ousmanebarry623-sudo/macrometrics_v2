"use client";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { TV_SYMBOLS } from "@/components/TradingViewChart";
import { SIGNAL_TFS } from "@/components/SignalChart";
import type { Signal, ElteParams } from "@/lib/elte-compute";
import type { DashMetrics } from "@/components/ElteSmartDashboard";
import type { TelegramSignalData, ServerWatchSymbol } from "@/components/TelegramPanel";
import SignalMonitorPanel from "@/components/SignalMonitorPanel";
import LivePriceTicker from "@/components/LivePriceTicker";
import { useBreakpoint } from "@/lib/use-breakpoint";

// ─── LAZY LOADS ───────────────────────────────────────────────────────────────
const SignalChart = dynamic(() => import("@/components/SignalChart"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ flex:1, height:640, borderRadius:12 }} />,
});

const ElteSmartDashboard = dynamic(() => import("@/components/ElteSmartDashboard"), {
  ssr: false,
  loading: () => (
    <div style={{ width:250, flexShrink:0, height:640, background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10 }} />
  ),
});

const TelegramPanel = dynamic(() => import("@/components/TelegramPanel"), { ssr: false });
const SignalProPanel = dynamic(() => import("@/components/SignalProPanel"), { ssr: false });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtPrice(v: number, sym: string) {
  return sym.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
}

const LS_AUTO_SEND = "elte_tg_autosend";

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function SignalPage() {
  const [symIdx,    setSymIdx]    = useState(0);
  const [tfIdx,     setTfIdx]     = useState(4);
  const [activeCat, setActiveCat] = useState("Majeurs");
  const [autoSend,  setAutoSend]  = useState(false);
  const [proMetrics, setProMetrics] = useState<DashMetrics | null>(null);

  // Charger l'état autoSend depuis localStorage côté client
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_AUTO_SEND);
      if (saved === "1") setAutoSend(true);
    } catch { /* ignore */ }
  }, []);

  // Persister autoSend dans localStorage
  const toggleAutoSend = useCallback(() => {
    setAutoSend(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_AUTO_SEND, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Catégories uniques dans l'ordre d'apparition
  const categories = useMemo(() => {
    const seen = new Set<string>();
    return TV_SYMBOLS.map(s => s.cat).filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });
  }, []);

  // Paires de la catégorie active avec leur index global dans TV_SYMBOLS
  const visibleSymbols = useMemo(() =>
    TV_SYMBOLS.map((s, i) => ({ ...s, i })).filter(s => s.cat === activeCat),
  [activeCat]);

  // Dernier signal affiché dans le badge header
  const [lastScore, setLastScore] = useState<string | null>(null);
  const [lastType,  setLastType]  = useState<"buy" | "sell" | null>(null);

  // Notification d'envoi automatique
  const [autoSentMsg, setAutoSentMsg] = useState<string | null>(null);

  // Données pour Telegram (assemblées depuis SignalChart + Dashboard)
  const [tgSignal, setTgSignal] = useState<TelegramSignalData | null>(null);
  const metricsRef = useRef<DashMetrics | null>(null);
  const sigDataRef = useRef<{ sig: Signal; params: ElteParams } | null>(null);

  const { isMobile } = useBreakpoint();
  const sym = TV_SYMBOLS[symIdx];
  const tf  = SIGNAL_TFS[tfIdx];

  // Symbole surveillé côté serveur (cron Vercel)
  const watchedSymbol: ServerWatchSymbol = useMemo(() => ({
    yf:       sym.yf,
    label:    sym.label,
    interval: tf.yfInterval,
    range:    tf.yfRange,
    tfLabel:  tf.label,
  }), [sym.yf, sym.label, tf.yfInterval, tf.yfRange, tf.label]);

  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric",
    month: "long", year: "numeric",
  });

  // Recompute le payload Telegram dès qu'on a les deux sources
  const rebuildTgSignal = useCallback((
    sig: Signal,
    params: ElteParams,
    metrics: DashMetrics,
    symbol: string,
    tfLabel: string,
  ) => {
    const risk  = Math.abs(sig.close - sig.st);
    const dir   = sig.type === "buy" ? 1 : -1;
    const entry = sig.close;
    const sensLabel = Number.isInteger(sig.sens)
      ? String(sig.sens)
      : sig.sens.toFixed(1).replace(/\.0$/, "");
    setTgSignal({
      sigTime:    sig.time,
      symbol,
      tf:         tfLabel,
      type:       sig.type,
      score:      `${sig.type === "buy" ? "B" : "S"}${sensLabel}`,
      sensitivity: sig.sens,
      strategy:   params.strategy,
      entry:      fmtPrice(entry,                        symbol),
      tp1:        fmtPrice(entry + dir * params.multTP1 * risk, symbol),
      tp2:        fmtPrice(entry + dir * params.multTP2 * risk, symbol),
      tp3:        fmtPrice(entry + dir * params.multTP3 * risk, symbol),
      sl:         fmtPrice(entry - dir * risk,           symbol),
      trend:      metrics.trend,
      volume:     metrics.volume,
      momentum:   metrics.momentum,
      volatility: metrics.volatility,
      barsSince:  metrics.barsSince,
    });
  }, []);

  // ── Callback depuis SignalChart ────────────────────────────────────────────
  const handleResult = useCallback((
    sig: Signal | null,
    _barsSince: number,
    params: ElteParams,
  ) => {
    if (!sig) { setLastScore(null); setLastType(null); setTgSignal(null); return; }
    const sensLabel = Number.isInteger(sig.sens)
      ? sig.sens.toString()
      : sig.sens.toFixed(1).replace(/\.0$/, "");
    setLastScore(`${sig.type === "buy" ? "B" : "S"}${sensLabel}`);
    setLastType(sig.type);
    sigDataRef.current = { sig, params };
    if (metricsRef.current) {
      rebuildTgSignal(sig, params, metricsRef.current, sym.label, tf.label);
    }
  }, [sym.label, tf.label, rebuildTgSignal]);

  // ── Callback depuis ElteSmartDashboard ────────────────────────────────────
  const handleMetrics = useCallback((m: DashMetrics) => {
    metricsRef.current = m;
    setProMetrics(m);
    if (sigDataRef.current) {
      rebuildTgSignal(sigDataRef.current.sig, sigDataRef.current.params, m, sym.label, tf.label);
    }
  }, [sym.label, tf.label, rebuildTgSignal]);

  // ── Callback quand TelegramPanel a auto-envoyé ────────────────────────────
  const handleAutoSent = useCallback((score: string) => {
    setAutoSentMsg(`📨 Signal ${score} envoyé sur Telegram`);
    setTimeout(() => setAutoSentMsg(null), 4000);
  }, []);

  return (
    <div style={{ maxWidth:1900, margin:"0 auto", padding:"18px 16px", display:"flex", flexDirection:"column", gap:12 }}>

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <h1 style={{ fontSize:22, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.02em" }}>
              Signal · ELTE SMART
            </h1>
            {lastScore && (
              <span style={{
                fontSize:18, fontWeight:900, fontFamily:"monospace",
                color:      lastType === "buy" ? "#22c55e" : "#ef4444",
                background: lastType === "buy" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
                border:    `1px solid ${lastType === "buy" ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"}`,
                borderRadius:8, padding:"3px 14px", letterSpacing:1,
              }}>{lastScore}</span>
            )}

            {/* Bouton toggle auto-send */}
            <button
              onClick={toggleAutoSend}
              title={autoSend ? "Désactiver l'envoi automatique Telegram" : "Activer l'envoi automatique Telegram"}
              style={{
                fontSize:13, fontWeight:700, padding:"3px 12px", borderRadius:8, cursor:"pointer",
                background: autoSend ? "rgba(34,197,94,.12)" : "rgba(71,85,105,.10)",
                border:    `1px solid ${autoSend ? "rgba(34,197,94,.35)" : "#1c1c38"}`,
                color:      autoSend ? "#22c55e" : "#475569",
                display:"flex", alignItems:"center", gap:5,
              }}
            >
              {autoSend ? "🔔" : "🔕"}
              <span style={{ fontSize:11 }}>{autoSend ? "Auto ON" : "Auto OFF"}</span>
            </button>

            {/* Notification d'envoi auto */}
            {autoSentMsg && (
              <span style={{
                fontSize:11, fontWeight:700,
                color:"#818cf8", background:"rgba(99,102,241,.12)",
                border:"1px solid rgba(99,102,241,.3)", borderRadius:8,
                padding:"3px 12px", animation:"fadeIn .3s ease",
              }}>{autoSentMsg}</span>
            )}

            {/* Telegram panel inline dans le header */}
            <TelegramPanel
              signal={tgSignal}
              autoSend={autoSend}
              onAutoSent={handleAutoSent}
              watchedSymbol={watchedSymbol}
            />

          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4, flexWrap:"wrap" }}>
            <p style={{ fontSize:11, color:"#475569", margin:0 }}>
              🇫🇷 {parisDate} · Signaux affichés directement sur le graphique · Dashboard multi-TF
            </p>
            {/* Prix live TradingView */}
            <LivePriceTicker
              tvSymbol={sym.tv}
              label={sym.label}
              entryPrice={tgSignal ? parseFloat(tgSignal.entry) : null}
              signalType={tgSignal?.type ?? null}
            />
          </div>
        </div>
        <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,.08)", padding:"3px 10px", borderRadius:999, border:"1px solid rgba(34,197,94,.2)", fontWeight:700 }}>
          ● LIVE
        </span>
      </div>

      {/* ── Onglets catégories ──────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", borderBottom:"1px solid #1c1c38", paddingBottom:8 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)} style={{
            fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:7, cursor:"pointer",
            background: activeCat === cat ? "rgba(99,102,241,.18)" : "transparent",
            border:    `1px solid ${activeCat === cat ? "rgba(99,102,241,.45)" : "#1c1c38"}`,
            color:      activeCat === cat ? "#818cf8" : "#475569",
          }}>{cat}</button>
        ))}
      </div>

      {/* ── Paires de la catégorie active ───────────────────────────────── */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {visibleSymbols.map(({ label, tv, i }) => (
          <button key={tv} onClick={() => { setSymIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); setProMetrics(null); }} style={{
            fontSize:11, fontWeight:600, padding:"4px 11px", borderRadius:7, cursor:"pointer",
            background: symIdx === i ? "rgba(212,175,55,.12)" : "#10101e",
            border:    `1px solid ${symIdx === i ? "rgba(212,175,55,.3)" : "#1c1c38"}`,
            color:      symIdx === i ? "#f0c84a" : "#475569",
          }}>{label}</button>
        ))}
      </div>

      {/* ── Barre unité de temps ─────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:3, alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#334155", marginRight:6 }}>Unité de temps :</span>
        {SIGNAL_TFS.map((t, i) => (
          <button key={t.label} onClick={() => { setTfIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); setProMetrics(null); }} style={{
            fontSize:12, fontWeight:700, padding:"4px 11px", borderRadius:6, cursor:"pointer", minWidth:36,
            background: tfIdx === i ? "rgba(99,102,241,.15)" : "#10101e",
            border:    `1px solid ${tfIdx === i ? "rgba(99,102,241,.4)" : "#1c1c38"}`,
            color:      tfIdx === i ? "#818cf8" : "#475569",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Zone principale : Chart + Dashboard ─────────────────────────── */}
      <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", gap:10, alignItems:"flex-start" }} suppressHydrationWarning>
        <SignalChart
          key={`${sym.yf}-${tf.yfInterval}-${tf.yfRange}`}
          yfSymbol={sym.yf}
          label={sym.label}
          tfIdx={tfIdx}
          onResult={handleResult}
        />
        <ElteSmartDashboard
          key={`dash-${sym.yf}-${tf.yfInterval}`}
          yfSymbol={sym.yf}
          tfLabel={tf.label}
          yfInterval={tf.yfInterval}
          yfRange={tf.yfRange}
          onMetrics={handleMetrics}
        />
      </div>

      {/* ── Surveillance Signal Telegram ──────────────────────────────── */}
      <SignalMonitorPanel
        currentSignal={tgSignal}
        currentTv={sym.tv}
        currentYf={sym.yf}
        currentLabel={sym.label}
        currentTfLabel={tf.label}
      />

      {/* ── Signal PRO ──────────────────────────────────────────────────── */}
      <SignalProPanel
        key={`pro-${sym.yf}-${tf.label}`}
        pairLabel={sym.label}
        tfLabel={tf.label}
        metrics={proMetrics}
      />

      {/* ── Note ────────────────────────────────────────────────────────── */}
      <div style={{ padding:"10px 16px", background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, fontSize:11, color:"#334155", display:"flex", gap:24, flexWrap:"wrap" }}>
        <span>📊 <strong style={{ color:"#475569" }}>Score B/S</strong> : lettre Buy/Sell + valeur de sensibilité auto au moment du signal (ex: B4 = Buy, sensibilité 4.0)</span>
        <span>📍 <strong style={{ color:"#475569" }}>Zones</strong> : Entry · TP1 · TP2 · TP3 · Stop Loss tracés sur le graphique</span>
        <span>📨 <strong style={{ color:"#475569" }}>Telegram</strong> : configurer bot token + canal ID · activer 🔔 Auto pour l'envoi immédiat · activer 📡 Surveillance pour les rappels 15 min</span>
      </div>
    </div>
  );
}
