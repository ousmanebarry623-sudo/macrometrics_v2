import COTChartCard from "@/components/COTChartCard";
import RetailSentimentCard from "@/components/RetailSentimentCard";

export const dynamic = "force-dynamic";

export default function COTPage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>COT — Positionnement Institutionnel</h1>
          <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>🇫🇷 {parisDate} · Source : CFTC · Hebdomadaire (délai 3 jours ouvrés)</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ padding: "6px 14px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, fontSize: 11 }}>
            <span style={{ color: "#3b82f6", fontWeight: 700 }}>📅 CFTC</span>
            <span style={{ color: "#475569", marginLeft: 6 }}>Rapport Mardi → Publication Vendredi 15h30 ET</span>
          </div>
        </div>
      </div>

      {/* Education cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { title: "Non-Commercial (Spéculateurs)", color: "#3b82f6", icon: "🏦", desc: "Hedge funds et gros spéculateurs. Leur position nette donne la direction de la tendance institutionnelle. Extrêmes → signal de retournement potentiel." },
          { title: "Commercial (Hedgeurs)", color: "#22c55e", icon: "⚙️", desc: "Producteurs et consommateurs qui se couvrent. Contrariens au prix — nets short aux tops, nets long aux bottoms. Utile pour identifier des zones de retournement." },
          { title: "Indicateur Extrême (Percentile)", color: "#f97316", icon: "⚠️", desc: "Quand le percentile 52 semaines dépasse 80% ou descend sous 20%, le marché est à un extrême historique. Signal de retournement ou continuation forte à surveiller." },
        ].map(({ title, color, icon, desc }) => (
          <div key={title} style={{ background: "#10101e", border: `1px solid ${color}25`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>{desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <COTChartCard />
      </div>

      <div style={{ marginBottom: 16 }}>
        <RetailSentimentCard />
      </div>

      <div style={{ marginTop: 20, padding: "14px 18px", background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
        📊 <strong style={{ color: "#94a3b8" }}>Méthode COT :</strong> Attendre que le net non-commercial soit à un extrême (percentile &lt;20% ou &gt;80% sur 2 ans) PUIS confirmer avec une divergence prix/positions ou un retournement de tendance hebdomadaire. Les données sont publiées chaque <strong style={{ color: "#f0c84a" }}>vendredi vers 15h30 ET</strong> et couvrent la semaine jusqu&apos;au mardi précédent. La page se rafraîchit automatiquement à la publication.
      </div>
    </div>
  );
}
