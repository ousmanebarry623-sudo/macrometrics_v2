import G8Overview from "@/components/G8Overview";
import QuickLinks from "@/components/QuickLinks";
import COTChartCard from "@/components/COTChartCard";
import RetailSentimentCard from "@/components/RetailSentimentCard";
import SeasonalityG8 from "@/components/SeasonalityG8";
import CentralBanksCard from "@/components/CentralBanksCard";
import ResponsiveRow1 from "@/components/ResponsiveRow1";
import MarketRegimeDetector from "@/components/MarketRegimeDetector";

export default function HomePage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="page-container">
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(34,197,94,0.08)", padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(34,197,94,0.2)" }}>Analyse Institutionnelle</span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>🇫🇷 {parisDate}</span>
        </div>
        <h1 style={{ fontSize: "clamp(20px, 3.5vw, 38px)", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
          Intelligence Macro.{" "}
          <span style={{ background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Données Réelles.</span>
        </h1>
        <p style={{ fontSize: "clamp(12px, 2vw, 14px)", color: "#64748b", marginTop: 8, maxWidth: 600 }}>
          COT CFTC · Sentiment retail · G8 28 paires · Saisonnalité 2015–2025 · Biais journalier · Actualités
        </p>
      </div>

      <QuickLinks />

      {/* Market Regime Detector — macro overview at the top */}
      <div style={{ marginBottom: 16 }}>
        <MarketRegimeDetector />
      </div>

      {/* Row 1: Biais Journalier + Sessions */}
      <ResponsiveRow1 />

      {/* Row 2: G8 Overview full width */}
      <div style={{ marginBottom: 16 }}>
        <G8Overview />
      </div>

      {/* Row 2: COT Chart full width */}
      <div style={{ marginBottom: 16 }}>
        <COTChartCard />
      </div>

      {/* Row: Central Banks G8 */}
      <div style={{ marginBottom: 16 }}>
        <CentralBanksCard />
      </div>

      {/* Row 3: Retail Sentiment full width */}
      <div style={{ marginBottom: 16 }}>
        <RetailSentimentCard />
      </div>

      {/* Row 4: Seasonality G8 full width */}
      <div style={{ marginBottom: 16 }}>
        <SeasonalityG8 />
      </div>

    </div>
  );
}
