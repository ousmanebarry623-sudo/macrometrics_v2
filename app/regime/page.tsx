import MarketRegimeDetector from "@/components/MarketRegimeDetector";

export const metadata = {
  title: "Market Regime Detector — MacroMetrics",
  description: "Identification automatique du régime de marché global (Risk-On / Risk-Off / Mixed / Transition) via VIX, S&P500, DXY, SKEW et sentiment.",
};

export default function RegimePage() {
  return (
    <div className="page-container">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#a855f7", textTransform: "uppercase",
            letterSpacing: "0.08em", background: "rgba(168,85,247,0.08)",
            padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(168,85,247,0.2)",
          }}>Analyse Macro</span>
        </div>
        <h1 style={{ fontSize: "clamp(20px, 3.5vw, 36px)", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
          Market Regime{" "}
          <span style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Detector
          </span>
        </h1>
        <p style={{ fontSize: "clamp(12px, 2vw, 14px)", color: "#64748b", marginTop: 8, maxWidth: 620 }}>
          Identification automatique du régime de marché global · Score composite 0–100 · VIX · S&P500 · DXY · CBOE SKEW · Fear&amp;Greed
        </p>
      </div>

      {/* Methodology card */}
      <div style={{
        background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12,
        padding: "14px 18px", marginBottom: 20,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14,
      }}>
        {[
          { regime: "🟢 Risk-On", score: "60–100", desc: "VIX bas · SP500↑ · DXY faible · Sentiment positif", color: "#22c55e" },
          { regime: "🔵 Mixed",   score: "45–60",  desc: "Signaux contradictoires, pas de consensus clair",   color: "#3b82f6" },
          { regime: "🟠 Transition", score: "25–45", desc: "Changement de régime en cours, ruptures à surveiller", color: "#f97316" },
          { regime: "🔴 Risk-Off", score: "0–25",  desc: "VIX élevé · SP500↓ · DXY fort · Aversion au risque", color: "#ef4444" },
        ].map(({ regime, score, desc, color }) => (
          <div key={regime}>
            <div style={{ fontSize: 11, fontWeight: 800, color, marginBottom: 3 }}>{regime}</div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono, monospace", marginBottom: 4 }}>Score {score}</div>
            <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.4 }}>{desc}</div>
          </div>
        ))}
      </div>

      <MarketRegimeDetector />

      {/* Formula documentation */}
      <div style={{ marginTop: 20, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Formules & Méthodologie
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[
            { title: "VIX Score (30%)",     formula: "score = 100 − percentile₁ₐ(VIX)",              note: "Inversé : VIX élevé = Risk-Off" },
            { title: "Equity Score (25%)",  formula: "ret₁ₛ = (P₀ − P₋₅) / P₋₅ × 100\nscore = percentile₁ₐ(ret₁ₛ)", note: "Momentum 5 jours vs 1 an" },
            { title: "USD Score (20%)",     formula: "score = 100 − percentile₁ₐ(DXY₁ₛ)",            note: "Inversé : DXY fort = Risk-Off" },
            { title: "Options Score (15%)", formula: "score = 100 − percentile₁ₐ(SKEW)",             note: "SKEW élevé = protection puts = Risk-Off" },
            { title: "Sentiment Score (10%)", formula: "score = Fear & Greed Index (0–100)",          note: "Direct : Greed = Risk-On" },
            { title: "Composite",           formula: "0.30×VIX + 0.25×Eq + 0.20×USD\n+ 0.15×Opt + 0.10×News", note: "Score 0–100 final" },
          ].map(({ title, formula, note }) => (
            <div key={title} style={{ borderLeft: "2px solid #1c1c38", paddingLeft: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f0c84a", marginBottom: 4 }}>{title}</div>
              <pre style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", margin: 0, whiteSpace: "pre-wrap" }}>{formula}</pre>
              <div style={{ fontSize: 9, color: "#334155", marginTop: 4, fontStyle: "italic" }}>{note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
