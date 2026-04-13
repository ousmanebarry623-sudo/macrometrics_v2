"use client";
import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #1c1c38", background: "#0d0d1a", padding: "32px 20px", marginTop: 40 }}>
      <div style={{ maxWidth: 1600, margin: "0 auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 48, justifyContent: "space-between", marginBottom: 28 }}>

          {/* Brand */}
          <div style={{ maxWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, background: "linear-gradient(135deg, #d4af37, #f0c84a)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#000" }}>M</div>
              <span style={{ fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>MacroMetrics</span>
            </div>
            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>Dashboard macro institutionnel — COT, Sentiment, Saisonnalité, Fondamental.</p>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>LIVE</span>
              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "#10101e", border: "1px solid #1c1c38", color: "#475569" }}>28 paires G8</span>
            </div>
          </div>

          {/* Outils */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Outils</p>
            {[
              ["Dashboard",       "/"],
              ["Signal ⚡",       "/signal"],
              ["Analyse",         "/analysis"],
              ["COT & Retail",    "/cot"],
              ["Saisonnalité G8", "/seasonality"],
              ["Calendrier",      "/calendar"],
              ["News",            "/news"],
            ].map(([l, h]) => (
              <Link key={h} href={h} style={{ display: "block", fontSize: 12, color: "#64748b", textDecoration: "none", marginBottom: 6, transition: "color 0.15s" }}
                onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
                onMouseOut={e  => (e.currentTarget.style.color = "#64748b")}
              >{l}</Link>
            ))}
          </div>

          {/* Informations */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Informations</p>
            {[
              ["À propos",      "/about"],
              ["Méthodologie",  "/methodology"],
            ].map(([l, h]) => (
              <Link key={h} href={h} style={{ display: "block", fontSize: 12, color: "#64748b", textDecoration: "none", marginBottom: 6 }}
                onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
                onMouseOut={e  => (e.currentTarget.style.color = "#64748b")}
              >{l}</Link>
            ))}
          </div>

          {/* Sources */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Sources</p>
            {[
              ["CFTC COT Reports",        "https://www.cftc.gov/MarketReports/CommitmentsofTraders"],
              ["MyFXBook Sentiment",      "https://www.myfxbook.com/community/outlook"],
              ["TradingView",             "https://www.tradingview.com"],
            ].map(([l, h]) => (
              <a key={h} href={h} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", fontSize: 12, color: "#64748b", textDecoration: "none", marginBottom: 6 }}
                onMouseOver={e => (e.currentTarget.style.color = "#94a3b8")}
                onMouseOut={e  => (e.currentTarget.style.color = "#64748b")}
              >{l} ↗</a>
            ))}
          </div>

        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 18, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 11, color: "#334155" }}>© {new Date().getFullYear()} MacroMetrics — À titre informatif uniquement. Pas de conseil financier.</p>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/methodology" style={{ fontSize: 11, color: "#334155", textDecoration: "none" }}>Méthodologie</Link>
            <Link href="/about"       style={{ fontSize: 11, color: "#334155", textDecoration: "none" }}>À propos</Link>
            <span style={{ fontSize: 11, color: "#334155" }}>Heure Paris (CET/CEST)</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
