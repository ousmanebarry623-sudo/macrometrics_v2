"use client";
import { useEffect, useState } from "react";
import FundamentalFeed from "@/components/FundamentalFeed";

interface Theme { keyword: string; count: number; }

export default function NewsPage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [themes, setThemes] = useState<Theme[]>([]);

  useEffect(() => {
    fetch("/api/news", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d) && d.themes) {
          setThemes(d.themes);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>Analyse Fondamentale</h1>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
          {parisDate} · Google News RSS · ForexLive · Reuters · FXStreet
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <FundamentalFeed limit={50} showThemes={true} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sources</h3>
            {[
              { name: "Google News RSS",  color: "#4285f4", tag: "Multi",  desc: "Agrégateur mondial · Forex, Indices, Macro" },
              { name: "ForexLive",        color: "#22c55e", tag: "Forex",  desc: "Commentaires live — BCE, Fed, BoJ, RBA" },
              { name: "FXStreet",         color: "#06b6d4", tag: "Forex",  desc: "Analyses techniques & fondamentales" },
              { name: "Reuters Markets",  color: "#ef4444", tag: "Markets", desc: "Actualité marchés & macro temps réel" },
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
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Themes Cles
              {themes.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 500, color: "#475569", marginLeft: 8, textTransform: "none" }}>
                  (dynamique)
                </span>
              )}
            </h3>
            {themes.length > 0 ? (
              themes.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9, justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#d4af37", fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{t.keyword}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#475569", background: "#0d0d1a", padding: "2px 8px", borderRadius: 999, border: "1px solid #1c1c38" }}>
                    {t.count} articles
                  </span>
                </div>
              ))
            ) : (
              // Fallback static themes
              [
                "Fed (FOMC) → USD · taux, dot plot",
                "BCE (ECB) → EUR/USD, EUR/GBP",
                "CPI/PCE → Gold, devises refuges (CHF, JPY)",
                "NFP/Emploi → USD, risk-on/off global",
                "BoJ → JPY, carry trades (AUD/JPY, EUR/JPY)",
                "BoC/RBA/RBNZ → CAD, AUD, NZD",
                "Geopolitique → XAU/USD, CHF safe-haven",
                "Petrole (WTI) → CAD, inflation mondiale",
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                  <span style={{ color: "#d4af37", fontSize: 12, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{t}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
