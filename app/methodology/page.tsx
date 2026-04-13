import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Méthodologie — MacroMetrics" };

export default function MethodologyPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 80px" }}>

      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", marginBottom: 8 }}>Sources & Méthodologie</h1>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
          Détail des calculs, sources et limites de chaque indicateur affiché sur MacroMetrics.
        </p>
      </div>

      {/* Indicators */}
      <Section title="Indicateurs de l'Analyse Multi-Facteurs">
        {INDICATORS.map(ind => (
          <div key={ind.name} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{ind.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{ind.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#3b82f6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", padding: "1px 7px", borderRadius: 999 }}>{ind.source}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", background: "#10101e", border: "1px solid #1c1c38", padding: "1px 7px", borderRadius: 999, marginLeft: "auto" }}>{ind.freq}</span>
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 8 }}>{ind.desc}</p>
            <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <span style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase" }}>Calcul</span>
                <p style={{ fontSize: 11, color: "#64748b", marginTop: 3, lineHeight: 1.5, fontFamily: "JetBrains Mono, monospace" }}>{ind.formula}</p>
              </div>
              <div>
                <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, textTransform: "uppercase" }}>Limites</span>
                <p style={{ fontSize: 11, color: "#64748b", marginTop: 3, lineHeight: 1.5 }}>{ind.limits}</p>
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* Signal quality */}
      <Section title="Score Qualité du Signal">
        <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "16px 18px" }}>
          <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.65, marginBottom: 12 }}>
            Le score Qualité (0–100) mesure l'alignement des 4 facteurs et la cohérence directionnelle du signal.
          </p>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#f0c84a", background: "#060610", border: "1px solid #1c1c38", borderRadius: 7, padding: "10px 14px", marginBottom: 10 }}>
            <div>Score = Σ (poids_facteur × cohérence_directionelle) × 100</div>
            <div style={{ color: "#475569", marginTop: 4, fontSize: 11 }}>
              {"// Institutionnel: 35% | Fondamental: 25% | Sentiment: 20% | Saisonnalité: 20%"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { range: "80–100", label: "HIGH", color: "#22c55e",   desc: "4 facteurs alignés" },
              { range: "50–79",  label: "MEDIUM", color: "#f0c84a",  desc: "3 facteurs alignés" },
              { range: "0–49",   label: "LOW", color: "#ef4444",    desc: "≤2 facteurs alignés" },
            ].map(l => (
              <div key={l.label} style={{ background: "#10101e", borderRadius: 7, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: l.color }}>{l.range}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: l.color, marginTop: 2 }}>{l.label}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Known limits */}
      <Section title="Limites connues des données">
        <div style={{ display: "grid", gap: 8 }}>
          {LIMITS.map(l => (
            <div key={l.title} style={{ background: "#0d0d1a", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 9, padding: "12px 14px", display: "flex", gap: 12 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{l.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", marginBottom: 3 }}>{l.title}</div>
                <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55 }}>{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Changelog */}
      <Section title="Changelog">
        <div style={{ display: "grid", gap: 6 }}>
          {CHANGELOG.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "10px 14px", background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#475569", whiteSpace: "nowrap", paddingTop: 1 }}>{entry.date}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  background: entry.type === "feat" ? "rgba(34,197,94,0.1)" : entry.type === "fix" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
                  border: `1px solid ${entry.type === "feat" ? "rgba(34,197,94,0.3)" : entry.type === "fix" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
                  color: entry.type === "feat" ? "#22c55e" : entry.type === "fix" ? "#ef4444" : "#3b82f6",
                  textTransform: "uppercase",
                }}>{entry.type}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{entry.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
        <Link href="/about" style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", background: "#0d0d1a", border: "1px solid #1c1c38", padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>← À propos</Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", background: "#0d0d1a", border: "1px solid #1c1c38", padding: "8px 18px", borderRadius: 8, textDecoration: "none" }}>Dashboard</Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1c1c38" }}>{title}</h2>
      {children}
    </div>
  );
}

const INDICATORS = [
  {
    icon: "🏛️",
    name: "COT Institutionnel",
    source: "CFTC",
    freq: "Hebdomadaire · Vendredi 15h30 EST",
    desc: "Mesure le positionnement net des non-commerciaux (fonds spéculatifs, asset managers) sur les contrats futures. Un z-score élevé indique un positionnement extrême qui peut précéder un retournement.",
    formula: "z-score = (net_position - mean_52w) / std_52w\nStrength % = |net| / max_52w × 100",
    limits: "Délai de 3 jours ouvrés (données mardi, publiées vendredi). Ne couvre pas le marché spot OTC, qui représente ~90% du volume forex.",
  },
  {
    icon: "📈",
    name: "Fondamental (Surprises Macro)",
    source: "TradingView Calendar",
    freq: "Continu · 30 événements",
    desc: "Score basé sur les surprises économiques des 30 derniers jours. Un Actual supérieur au Forecast génère une surprise positive (+1), inférieur une surprise négative (-1). Le score net reflète la dynamique macro récente de la devise.",
    formula: "surprise = (actual - forecast) / |forecast|\nnet_score = Σ surprises_devise_base - Σ surprises_devise_quote",
    limits: "Certains événements n'ont pas de Forecast (déclarations, minutes). Le score ignore l'impact relatif des événements (NFP ≠ PMI services).",
  },
  {
    icon: "👥",
    name: "Sentiment Retail",
    source: "MyFXBook",
    freq: "Temps réel · ~15 min",
    desc: "Rapport long/short des traders particuliers sur les plateformes connectées à MyFXBook. Utilisé en mode contrarian : si 70% des retail sont long, les institutionnels sont souvent short (compression de positions).",
    formula: "bias = SHORT si longPct > 60%\nbias = LONG si longPct < 40%\nbias = NEUTRAL sinon",
    limits: "Échantillon biaisé vers les retail perdants (biais du survivant). Ne reflète pas les positions institutionnelles réelles. Pas de données pour tous les symboles.",
  },
  {
    icon: "📅",
    name: "Saisonnalité",
    source: "Google Sheets (2015–2025)",
    freq: "Mensuelle · Recalcul sur plage",
    desc: "Moyenne des rendements mensuels historiques sur la plage sélectionnée. Un biais haussier signifie que ce mois est statistiquement positif sur la période. La plage est ajustable (1 an → 10 ans).",
    formula: "avg = Σ returns_mois / n_années\nbias = BULLISH si avg > 0\nbias = BEARISH si avg < 0",
    limits: "Corrélation n'est pas causalité. 11 ans de données limités pour la significativité statistique. Les régimes de marché changent (QE, COVID, guerres).",
  },
];

const LIMITS = [
  { icon: "⏱️", title: "Délai COT — 3 jours ouvrés", desc: "Les données COT reflètent les positions au mardi soir, publiées le vendredi. En période de forte volatilité, les positions peuvent avoir significativement changé." },
  { icon: "🌐", title: "Sentiment Retail — Échantillon partiel", desc: "MyFXBook ne couvre qu'une fraction des traders. Les courtiers non connectés (ICMarkets, FXCM, etc.) ne sont pas inclus dans l'agrégat." },
  { icon: "📊", title: "Saisonnalité — 11 ans de données", desc: "La plage 2015–2025 est statistiquement courte. Certains biais peuvent être des artefacts de cycles spécifiques (COVID 2020, crise rate 2022) et non des patterns durables." },
  { icon: "🔄", title: "Révisions de données", desc: "Le CFTC révise occasionnellement ses données historiques. Les surprises macro dépendent de la qualité du consensus Bloomberg/Reuters sous-jacent." },
  { icon: "⚡", title: "Latence des prix", desc: "Les prix TradingView ont une latence de quelques secondes. En période de publication macro (NFP, CPI), les prix peuvent être décalés par rapport au marché réel." },
];

const CHANGELOG = [
  { date: "2025-04", type: "fix",  desc: "Seuil de biais saisonnalité : règle de majorité directe (avg > 0 → Bullish), élimine les faux Neutral" },
  { date: "2025-04", type: "feat", desc: "Filtre de période saisonnalité style SeasonalityG8 sur la page Analyse" },
  { date: "2025-04", type: "fix",  desc: "Sessions marché : calcul DST-aware via IANA timezone (AEST/AEDT/BST/EDT auto)" },
  { date: "2025-04", type: "feat", desc: "Plage saisonnalité contrainte à 2015–2025 (plage Google Sheet) sur toutes les pages" },
  { date: "2025-03", type: "feat", desc: "Prix temps réel via TradingView Scanner API sur la page Signal" },
  { date: "2025-03", type: "feat", desc: "Surveillance serveur-side des signaux de retest via Redis + cron Vercel" },
  { date: "2025-03", type: "fix",  desc: "Faux signaux Telegram : ajout du filtre barsSince > 3 bougies" },
  { date: "2025-03", type: "feat", desc: "Saisonnalité 100% Google Sheets — suppression du fallback Yahoo Finance" },
  { date: "2025-02", type: "feat", desc: "Page Analyse Multi-Facteurs : COT + Macro + Sentiment + Saisonnalité en grille 28 paires" },
  { date: "2025-01", type: "feat", desc: "Lancement MacroMetrics v6 — dashboard institutionnel forex & commodities" },
];
