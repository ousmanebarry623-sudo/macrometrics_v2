"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBreakpoint } from "@/lib/use-breakpoint";

const NAV = [
  { label: "Dashboard",       href: "/" },
  { label: "Signal ⚡",       href: "/signal" },
  { label: "Analyse",         href: "/analysis" },
  { label: "Calendrier",      href: "/calendar" },
  { label: "COT & Retail",    href: "/cot" },
  { label: "Saisonnalité G8", href: "/seasonality" },
  { label: "News",            href: "/news" },
  { label: "Méthodo",         href: "/methodology" },
  { label: "Admin ⚙️",        href: "/admin/macro" },
];

function getParis() {
  const now = new Date();
  const time = now.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parisStr = now.toLocaleString("en-US", { timeZone: "Europe/Paris" });
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const diff = Math.round((new Date(parisStr).getTime() - new Date(utcStr).getTime()) / 3600000);
  return { time, offset: diff >= 0 ? `UTC+${diff}` : `UTC${diff}` };
}

function ParisClock() {
  const [info, setInfo] = useState({ time: "--:--:--", offset: "UTC+1" });
  useEffect(() => {
    setInfo(getParis());
    const id = setInterval(() => setInfo(getParis()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "#0d0d1a", border: "1px solid #1c1c38", fontSize: 11 }}>
      <span>🇫🇷</span>
      <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f0c84a", fontWeight: 600 }}>{info.time}</span>
      <span style={{ color: "#475569" }}>{info.offset}</span>
    </div>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { isMobile } = useBreakpoint();

  return (
    <header style={{ background: "rgba(6,6,16,0.97)", backdropFilter: "blur(16px)", borderBottom: "1px solid #1c1c38", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg, #d4af37, #f0c84a)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: "#000" }}>M</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1.1 }}>MacroMetrics</div>
            <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>G8 · COT · Saisonnalité · News</div>
          </div>
        </Link>

        {!isMobile && (
          <nav style={{ display: "flex", gap: 2 }} suppressHydrationWarning>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500, textDecoration: "none", color: path === n.href ? "#f0c84a" : "#94a3b8", background: path === n.href ? "rgba(212,175,55,0.1)" : "transparent", border: `1px solid ${path === n.href ? "rgba(212,175,55,0.25)" : "transparent"}` }}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ParisClock />
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 11, fontWeight: 600, color: "#22c55e" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} className="blink" />
            LIVE
          </div>
          {isMobile && (
            <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }} suppressHydrationWarning>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth={2} strokeLinecap="round" d={open ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
            </button>
          )}
        </div>
      </div>

      {isMobile && open && (
        <div style={{ borderTop: "1px solid #1c1c38", background: "#060610", padding: "10px 20px" }} suppressHydrationWarning>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} style={{ display: "block", padding: "9px 10px", borderRadius: 7, fontSize: 13, fontWeight: 500, textDecoration: "none", color: path === n.href ? "#f0c84a" : "#94a3b8", marginBottom: 3 }}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
