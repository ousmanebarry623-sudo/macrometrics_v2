import MacroDashboard from "@/components/MacroDashboard";

export const dynamic = "force-dynamic";

export default function MacroPage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#d4af37", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(212,175,55,0.08)", padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(212,175,55,0.2)" }}>
            Macro Dashboard
          </span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>
            🇫🇷 {parisDate}
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(22px, 3.5vw, 36px)", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
          Analyse Macroéconomique{" "}
          <span style={{ background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            G8+
          </span>
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 8, maxWidth: 700 }}>
          Indicateurs clés par pays · Scores macro pondérés · FX Macro Score bilatéral · Banques centrales G8 · Heatmap mondiale
        </p>
      </div>

      {/* Info bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "Source", value: "TradingEconomics / Fallback statique", color: "#3b82f6" },
          { label: "Cache", value: "4 heures", color: "#22c55e" },
          { label: "Pays", value: "11 (G8 + CN, DE, FR)", color: "#d4af37" },
          { label: "Indicateurs", value: "8 par pays", color: "#a78bfa" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "6px 14px", background: "#10101e", border: `1px solid ${color}25`, borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: "#475569" }}>{label} : </span>
            <span style={{ color, fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <MacroDashboard />
    </div>
  );
}
