import FundamentalFeed from "@/components/FundamentalFeed";

export const dynamic = "force-dynamic";

export default function NewsPage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>Analyse Fondamentale</h1>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>🇫🇷 {parisDate} · FXStreet · ForexLive · InvestingLive</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <FundamentalFeed limit={50} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sources</h3>
            {[
              { name: "FXStreet", color: "#06b6d4", tag: "Forex", desc: "Analyse forex & calendrier économique" },
              { name: "ForexLive", color: "#22c55e", tag: "Forex", desc: "Commentaires live, BCE, Fed, BOJ" },
              { name: "InvestingLive", color: "#10b981", tag: "Markets", desc: "Actualité marchés en temps réel" },
            ].map(({ name, color, tag, desc }) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #1c1c3840" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 }} />
                  <div>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{name}</span>
                    <div style={{ fontSize: 10, color: "#475569" }}>{desc}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10, color, background: color+"15", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>{tag}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Thèmes Clés</h3>
            {[
              "Fed & BCE → impact USD/EUR/GBP",
              "CPI/Inflation → Gold, devises refuges",
              "NFP → USD, risk-on/off global",
              "Géopolitique → XAU/USD, CHF, JPY",
              "BoJ → JPY, carry trades",
              "Pétrole → CAD, inflation mondiale",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                <span style={{ color: "#d4af37", fontSize: 12, flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
