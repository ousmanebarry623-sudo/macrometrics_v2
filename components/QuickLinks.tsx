"use client";
import Link from "next/link";

const LINKS = [
  { href: "/signal",      label: "Signal ⚡",              desc: "Retest · Telegram · Prix live",         icon: "⚡", color: "#f0c84a" },
  { href: "/analysis",    label: "Analyse Multi-Facteurs", desc: "COT · Macro · Sentiment · Saison",      icon: "🔬", color: "#3b82f6" },
  { href: "/cot",         label: "COT & Retail",           desc: "Institutionnels · Sentiment · OI",      icon: "🏦", color: "#d4af37" },
  { href: "/seasonality", label: "Saisonnalité G8",        desc: "28 paires · Heatmap · 2015–2025",       icon: "📊", color: "#22c55e" },
  { href: "/calendar",    label: "Calendrier Éco",         desc: "Événements haute importance",           icon: "📅", color: "#a855f7" },
  { href: "/news",        label: "Fondamental & News",     desc: "Google News · ForexLive · Reuters",     icon: "🔍", color: "#f97316" },
];

export default function QuickLinks() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 8, marginBottom: 24 }}>
      {LINKS.map(l => (
        <Link
          key={l.href}
          href={l.href}
          style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, textDecoration: "none", transition: "border-color 0.2s, background 0.2s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = l.color + "44"; (e.currentTarget as HTMLElement).style.background = l.color + "08"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1c1c38"; (e.currentTarget as HTMLElement).style.background = "#0d0d1a"; }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>{l.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 1 }}>{l.label}</div>
            <div style={{ fontSize: 10, color: "#475569" }}>{l.desc}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
