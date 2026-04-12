"use client";
import Link from "next/link";
const LINKS = [
  { href: "/cot",         label: "COT & Retail",         desc: "2 ans · Retail · Open Interest",      icon: "🏦", color: "#d4af37" },
  { href: "/charts",      label: "Graphiques",           desc: "TradingView · Mon Indicateur · OI",    icon: "📈", color: "#a855f7" },
  { href: "/seasonality", label: "Saisonnalité G8",      desc: "28 paires · Heatmap · 10 ans",         icon: "📊", color: "#22c55e" },
  { href: "/calendar",    label: "Calendrier Éco",       desc: "Événements haute importance",           icon: "📅", color: "#3b82f6" },
  { href: "/news",        label: "Analyse Fondamentale", desc: "FXStreet · ForexLive · InvestingLive", icon: "🔍", color: "#f97316" },
];
export default function QuickLinks() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 10, marginBottom: 28 }}>
      {LINKS.map(l => (
        <Link key={l.href} href={l.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, textDecoration: "none", transition: "border-color 0.2s" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = l.color+"44"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#1c1c38"}>
          <span style={{ fontSize: 22 }}>{l.icon}</span>
          <div><div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{l.label}</div><div style={{ fontSize: 10, color: "#475569" }}>{l.desc}</div></div>
        </Link>
      ))}
    </div>
  );
}
