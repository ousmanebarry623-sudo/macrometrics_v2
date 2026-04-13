import SeasonalityG8 from "@/components/SeasonalityG8";

export const dynamic = "force-dynamic";

export default function SeasonalityPage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const currentMonthName = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", month: "long" });

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>Saisonnalité G8 — 28 Paires</h1>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>🇫🇷 {parisDate} · Données personnalisées · 28 paires G8</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "📄", title: "Vos propres données", desc: `Données saisonnières importées depuis votre Google Sheets. Retours mensuels sur mesure, ${currentMonthName} mis en surbrillance.` },
          { icon: "🌡", title: "Heatmap complète", desc: "Vue de toutes les paires du groupe. Vert = tendance haussière historique, Rouge = baissière." },
          { icon: "⚡", title: "Plage personnalisée", desc: "Filtrez par période libre (2015–2025) ou utilisez les presets 1/3/5/10 ans. Recalcul instantané des stats sur la plage sélectionnée." },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 5 }}>{title}</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{desc}</div>
          </div>
        ))}
      </div>

      <SeasonalityG8 />

      <div style={{ marginTop: 20, padding: "14px 18px", background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
        💡 <strong style={{ color: "#94a3b8" }}>Comment utiliser :</strong> La saisonnalité donne un <em>biais</em>, pas un signal d&apos;entrée. Utiliser en confluence avec le COT (positionnement institutionnel), le sentiment retail (signal contrarian) et les fondamentaux macroéconomiques. Plus le pourcentage de mois positifs est élevé, plus le biais historique est fiable.
      </div>
    </div>
  );
}
