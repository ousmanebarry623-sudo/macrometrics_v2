"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { TV_SYMBOLS, TV_TF } from "@/components/TradingViewChart";

// ─── LAZY IMPORTS (browser-only) ──────────────────────────────────────────────
const TradingViewChart = dynamic(() => import("@/components/TradingViewChart"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ flex: 1, height: "100%", borderRadius: 8 }} />,
});

const ElteSmartDashboard = dynamic(() => import("@/components/ElteSmartDashboard"), {
  ssr: false,
  loading: () => (
    <div style={{ width: 250, flexShrink: 0, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10 }} />
  ),
});

// ─── TIMEFRAMES ───────────────────────────────────────────────────────────────
const TF_LIST = [
  { label: "1M",  tvInterval: "1",   yfInterval: "1m",  yfRange: "5d"   },
  { label: "5M",  tvInterval: "5",   yfInterval: "5m",  yfRange: "60d"  },
  { label: "15M", tvInterval: "15",  yfInterval: "15m", yfRange: "60d"  },
  { label: "30M", tvInterval: "30",  yfInterval: "30m", yfRange: "60d"  },
  { label: "1H",  tvInterval: "60",  yfInterval: "60m", yfRange: "200d" },
  { label: "4H",  tvInterval: "240", yfInterval: "60m", yfRange: "200d" },
  { label: "D",   tvInterval: "D",   yfInterval: "1d",  yfRange: "2y"   },
  { label: "W",   tvInterval: "W",   yfInterval: "1wk", yfRange: "5y"   },
  { label: "M",   tvInterval: "M",   yfInterval: "1mo", yfRange: "10y"  },
];

export default function ChartsPage() {
  const [symIdx, setSymIdx]   = useState(0);
  const [tfIdx,  setTfIdx]    = useState(4);  // 1H par défaut

  const sym = TV_SYMBOLS[symIdx];
  const tf  = TF_LIST[tfIdx];

  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Hauteur de la zone chart : fenêtre – header – barres
  const chartHeight = 620;

  return (
    <div style={{ maxWidth: 1800, margin: "0 auto", padding: "20px 18px" }}>

      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.02em" }}>
            Graphiques · ELTE SMART
          </h1>
          <p style={{ fontSize:12, color:"#475569", marginTop:4 }}>
            🇫🇷 {parisDate} · TradingView (cotation) · Indicateur privé (calcul local)
          </p>
        </div>
        <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,.08)", padding:"3px 10px", borderRadius:999, border:"1px solid rgba(34,197,94,.2)", fontWeight:700 }}>
          ● LIVE
        </span>
      </div>

      {/* ── Barre symboles ───────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:4, marginBottom:8, flexWrap:"wrap" }}>
        {TV_SYMBOLS.map((s, i) => (
          <button key={s.tv} onClick={() => setSymIdx(i)} style={{
            fontSize:11, fontWeight:600, padding:"4px 11px", borderRadius:7, cursor:"pointer",
            background: symIdx===i ? "rgba(212,175,55,.12)" : "#10101e",
            border:     `1px solid ${symIdx===i ? "rgba(212,175,55,.3)" : "#1c1c38"}`,
            color:      symIdx===i ? "#f0c84a" : "#475569",
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── Barre unité de temps ─────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:3, marginBottom:12, alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#334155", marginRight:6 }}>UdT :</span>
        {TF_LIST.map((t, i) => (
          <button key={t.label} onClick={() => setTfIdx(i)} style={{
            fontSize:12, fontWeight:700, padding:"4px 10px", borderRadius:6, cursor:"pointer", minWidth:34,
            background: tfIdx===i ? "rgba(99,102,241,.15)" : "#10101e",
            border:     `1px solid ${tfIdx===i ? "rgba(99,102,241,.4)" : "#1c1c38"}`,
            color:      tfIdx===i ? "#818cf8" : "#475569",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Zone principale : TV chart + dashboard ───────────────────────── */}
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>

        {/* Chart TradingView — flex 1 */}
        <div style={{ flex:1, minWidth:0, background:"#10101e", border:"1px solid #1c1c38", borderRadius:12, overflow:"hidden" }}>
          {/* Barre titre du chart */}
          <div style={{ padding:"10px 16px", borderBottom:"1px solid #1c1c38", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>
              {sym.label} · <span style={{ color:"#818cf8" }}>{tf.label}</span>
            </span>
            <span style={{ fontSize:10, color:"#334155" }}>
              TradingView · Unité synchronisée
            </span>
          </div>
          {/* Le key force le remount quand symbole OU timeframe change */}
          <TradingViewChart
            key={`${sym.tv}-${tf.tvInterval}`}
            tvSymbol={sym.tv}
            interval={tf.tvInterval}
            height={chartHeight}
          />
        </div>

        {/* Dashboard ELTE SMART */}
        <ElteSmartDashboard
          key={`${sym.yf}-${tf.yfInterval}-${tf.yfRange}`}
          yfSymbol={sym.yf}
          tfLabel={tf.label}
          yfInterval={tf.yfInterval}
          yfRange={tf.yfRange}
        />
      </div>

      {/* ── Note en bas de page ──────────────────────────────────────────── */}
      <div style={{ marginTop:14, padding:"10px 16px", background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, fontSize:11, color:"#334155", lineHeight:1.7, display:"flex", gap:20, flexWrap:"wrap" }}>
        <span>📈 <strong style={{ color:"#475569" }}>Graphique</strong> : TradingView (cotation temps réel, tous outils natifs)</span>
        <span>🔒 <strong style={{ color:"#475569" }}>Dashboard</strong> : ELTE SMART calculé localement depuis Yahoo Finance · Privé · Non visible sur TradingView</span>
        <span>🧮 <strong style={{ color:"#475569" }}>Score B/S</strong> : type de signal + nombre de bougies écoulées depuis le dernier signal</span>
      </div>
    </div>
  );
}
