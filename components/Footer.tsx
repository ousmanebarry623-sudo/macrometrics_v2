import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #1c1c38", background: "#0d0d1a", padding: "28px 20px", marginTop: 40 }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 26, height: 26, background: "linear-gradient(135deg, #d4af37, #f0c84a)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#000" }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>MacroMetrics</span>
          </div>
          <p style={{ fontSize: 12, color: "#475569", maxWidth: 200, lineHeight: 1.6 }}>Analyse macro institutionnelle. Données en temps réel.</p>
        </div>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Outils</p>
            {[["Dashboard", "/"], ["Signal ⚡", "/signal"], ["Analyse", "/analysis"], ["COT & Retail", "/cot"], ["Saisonnalité G8", "/seasonality"], ["Calendrier", "/calendar"], ["News", "/news"]].map(([l, h]) => (
              <Link key={h} href={h} style={{ display: "block", fontSize: 12, color: "#94a3b8", textDecoration: "none", marginBottom: 6 }}>{l}</Link>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>À propos</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Positionnement institutionnel</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Sentiment de marché</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Saisonnalité historique</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Calendrier économique</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Analyse fondamentale</p>
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 18, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
        <p style={{ fontSize: 11, color: "#475569" }}>© {new Date().getFullYear()} MacroMetrics — À titre informatif uniquement.</p>
        <p style={{ fontSize: 11, color: "#475569" }}>Heure de Paris (CET/CEST) · Pas de conseil financier.</p>
      </div>
    </footer>
  );
}
