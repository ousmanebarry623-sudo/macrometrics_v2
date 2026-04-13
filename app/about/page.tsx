import Link from "next/link";

export const metadata = { title: "À propos — MacroMetrics" };

export default function AboutPage() {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 20px 80px" }}>

      {/* Hero */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #d4af37, #f0c84a)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, color: "#000" }}>M</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>MacroMetrics</h1>
        </div>
        <p style={{ fontSize: 16, color: "#94a3b8", lineHeight: 1.7, maxWidth: 680 }}>
          Tableau de bord macro institutionnel pour traders forex et matières premières. Consolidation de sources de données publiques — COT CFTC, sentiment retail, saisonnalité historique, calendrier économique — en un seul outil d'analyse cohérent.
        </p>
      </div>

      {/* Mission */}
      <Section title="Mission">
        <p style={p}>
          MacroMetrics est conçu pour offrir une vue multi-facteurs du marché, sans algorithme opaque ni signal "black box". Chaque indicateur est basé sur des données publiques vérifiables, avec une méthodologie transparente.
        </p>
        <p style={{ ...p, marginTop: 10 }}>
          L'objectif n'est pas de remplacer l'analyse discrétionnaire, mais de la renforcer avec un cadre quantitatif rigoureux.
        </p>
      </Section>

      {/* Sources */}
      <Section title="Sources de données">
        <div style={{ display: "grid", gap: 10 }}>
          {SOURCES.map(s => (
            <div key={s.name} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{s.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#f0c84a", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", padding: "1px 7px", borderRadius: 999 }}>{s.freq}</span>
                </div>
                <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Disclaimer */}
      <Section title="Avertissement">
        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.65 }}>
            Les informations présentées sur MacroMetrics sont fournies <strong style={{ color: "#f1f5f9" }}>à titre informatif uniquement</strong>. Elles ne constituent pas un conseil financier, une recommandation d'investissement ou une incitation à la transaction. Le trading comporte des risques significatifs de perte en capital. Les performances passées ne présagent pas des résultats futurs.
          </p>
          <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65, marginTop: 8 }}>
            Les données affichées proviennent de sources publiques (CFTC, MyFXBook, Google Sheets personnalisés) et peuvent présenter des délais ou des inexactitudes. MacroMetrics n'est pas affilié à ces sources.
          </p>
        </div>
      </Section>

      {/* Links */}
      <div style={{ display: "flex", gap: 12, marginTop: 40, flexWrap: "wrap" }}>
        <Link href="/methodology" style={{ fontSize: 13, fontWeight: 600, color: "#f0c84a", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>
          Voir la Méthodologie →
        </Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", background: "#0d0d1a", border: "1px solid #1c1c38", padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>
          Retour au Dashboard
        </Link>
      </div>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1c1c38" }}>{title}</h2>
      {children}
    </div>
  );
}

const p: React.CSSProperties = { fontSize: 13, color: "#94a3b8", lineHeight: 1.7 };

const SOURCES = [
  { icon: "🏛️", name: "CFTC — Commitments of Traders (COT)",    freq: "Hebdomadaire",  desc: "Rapport officiel de la Commodity Futures Trading Commission. Publié chaque vendredi à 15h30 EST, référence les positions nettes des non-commerciaux (institutionnels) sur les futures réglementés (CME, ICE). Délai de 3 jours ouvrés." },
  { icon: "👥", name: "MyFXBook Community Outlook",               freq: "Temps réel",    desc: "Agrégateur de sentiment retail forex. Compile les positions long/short des traders particuliers sur les plateformes connectées à MyFXBook. Utilisé en contrarian : majorité long → signal bearish institutionnel potentiel." },
  { icon: "📊", name: "TradingView Scanner API",                  freq: "Temps réel",    desc: "Prix en temps réel pour toutes les paires forex, indices et matières premières. Utilisé pour le ticker en direct, la page Signal et le suivi de prix live. Mode updateMode=realtime." },
  { icon: "📅", name: "TradingView Economic Calendar",            freq: "Continu",       desc: "Calendrier des événements macro : NFP, CPI, PIB, décisions de taux. Fournit les valeurs Actual, Forecast et Previous permettant de calculer les surprises économiques (score fondamental)." },
  { icon: "📈", name: "Google Sheets — Saisonnalité historique",  freq: "Mensuelle",     desc: "Données propriétaires de saisonnalité pour 28+ paires forex, commodities et indices. Couvre 2015–2025. Chaque onglet contient les rendements mensuels historiques utilisés pour calculer les biais saisonniers." },
  { icon: "📰", name: "Google News RSS / ForexLive / Reuters",    freq: "Continu",       desc: "Flux d'actualités financières agrégées. Sources multiples avec déduplication par titre. Filtrage par paire forex grâce aux symboles présents dans les titres." },
  { icon: "🔴", name: "Telegram Bot API",                        freq: "Temps réel",    desc: "Envoi automatique de signaux vers un channel Telegram privé. Surveillance serveur-side des setups de retest via Redis/Vercel KV." },
];
