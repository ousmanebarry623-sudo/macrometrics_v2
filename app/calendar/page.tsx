"use client";
import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CalEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
  parisTime: string;
  parisDate: string;
  timestamp: number;
  indicator: string;
  unit: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  CAD: "🇨🇦", AUD: "🇦🇺", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", CNH: "🇨🇳",
};

const IMPACT_CFG: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  High:          { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  dot: "#ef4444", label: "Haute" },
  Medium:        { color: "#f97316", bg: "rgba(249,115,22,0.12)", dot: "#f97316", label: "Moyenne" },
  Low:           { color: "#eab308", bg: "rgba(234,179,8,0.12)",  dot: "#eab308", label: "Faible" },
  "Non-Economic":{ color: "#475569", bg: "transparent",            dot: "#334155", label: "—" },
};

const CURRENCIES = ["Tous", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "NZD", "CNY"];
const IMPACTS   = ["Tous", "High", "Medium", "Low"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

function labelDate(dateStr: string): string {
  const today = todayParis();
  const d = new Date(dateStr + "T12:00:00Z");
  const long = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (dateStr === today) return `Aujourd'hui · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

function ImpactDot({ impact }: { impact: string }) {
  const cfg = IMPACT_CFG[impact] ?? IMPACT_CFG["Non-Economic"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block", flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function ValueCell({ value, color }: { value: string; color?: string }) {
  return (
    <span style={{
      fontFamily: "JetBrains Mono, monospace", fontSize: 11,
      color: value ? (color ?? "#e2e8f0") : "#334155",
      minWidth: 54, textAlign: "right", display: "inline-block",
    }}>
      {value || "—"}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [events,    setEvents]    = useState<CalEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [currency,  setCurrency]  = useState("Tous");
  const [impact,    setImpact]    = useState("Tous");
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const url = force ? "/api/forex-calendar?force=1" : "/api/forex-calendar";
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("Erreur API");
      const data: CalEvent[] = await r.json();
      if (!Array.isArray(data)) throw new Error("Données invalides");
      setEvents(data);
      setLastFetch(new Date());
      // Default: today's tab
      const today = todayParis();
      if (data.some(e => e.parisDate === today)) setActiveDay(today);
      else if (data.length > 0) setActiveDay(data[0].parisDate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 90 * 1000); // auto-refresh toutes les 90s
    return () => clearInterval(id);
  }, [load]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = events.filter(e => {
    if (currency !== "Tous" && e.currency !== currency) return false;
    if (impact   !== "Tous" && e.impact   !== impact)   return false;
    return true;
  });

  // ── Group by day ──────────────────────────────────────────────────────────
  const grouped = filtered.reduce<Record<string, CalEvent[]>>((acc, e) => {
    (acc[e.parisDate] ??= []).push(e);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort();

  const today = todayParis();
  const parisNow = new Date().toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>
              Calendrier Économique
            </h1>
            <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
              Source : TradingView Economic Calendar · Heure de Paris (CET/CEST) · Actualisation auto toutes les 90 s
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {lastFetch && (
              <span style={{ fontSize: 10, color: "#334155" }}>
                Dernière MAJ : {lastFetch.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button onClick={() => load(true)} disabled={loading} style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
              background: "rgba(240,200,74,0.08)", border: "1px solid rgba(240,200,74,0.25)",
              color: "#f0c84a", display: "flex", alignItems: "center", gap: 6,
              opacity: loading ? 0.5 : 1,
            }}>
              <span style={{ animation: loading ? "spin 1s linear infinite" : "none", display: "inline-block" }}>↻</span>
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {/* Currency filter */}
        <div style={{ display: "flex", gap: 3, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "3px 4px", flexWrap: "wrap" }}>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrency(c)} style={{
              fontSize: 11, fontWeight: currency === c ? 700 : 500, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
              background: currency === c ? "rgba(240,200,74,0.15)" : "transparent",
              border: `1px solid ${currency === c ? "rgba(240,200,74,0.4)" : "transparent"}`,
              color: currency === c ? "#f0c84a" : "#475569",
            }}>
              {c !== "Tous" ? `${FLAGS[c] ?? ""} ${c}` : "🌐 Tous"}
            </button>
          ))}
        </div>

        {/* Impact filter */}
        <div style={{ display: "flex", gap: 3, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "3px 4px" }}>
          {IMPACTS.map(imp => {
            const cfg = imp !== "Tous" ? IMPACT_CFG[imp] : null;
            const active = impact === imp;
            return (
              <button key={imp} onClick={() => setImpact(imp)} style={{
                fontSize: 11, fontWeight: active ? 700 : 500, padding: "3px 10px", borderRadius: 5, cursor: "pointer",
                background: active && cfg ? cfg.bg : active ? "rgba(240,200,74,0.1)" : "transparent",
                border: `1px solid ${active && cfg ? cfg.color + "50" : active ? "rgba(240,200,74,0.3)" : "transparent"}`,
                color: active && cfg ? cfg.color : active ? "#f0c84a" : "#475569",
              }}>
                {imp === "Tous" ? "Tout" : (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg!.dot, display: "inline-block" }} />
                    {cfg!.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Count */}
        <span style={{ fontSize: 11, color: "#334155", marginLeft: "auto" }}>
          {filtered.length} événement{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Day tabs ── */}
      {days.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {days.map(d => {
            const isToday = d === today;
            const active  = activeDay === d;
            const count   = grouped[d].length;
            const hasHigh = grouped[d].some(e => e.impact === "High");
            return (
              <button key={d} onClick={() => setActiveDay(d)} style={{
                flexShrink: 0, fontSize: 11, fontWeight: active ? 700 : 500,
                padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                background: active ? (isToday ? "rgba(240,200,74,0.15)" : "rgba(59,130,246,0.12)") : "#0d0d1a",
                border: `1px solid ${active ? (isToday ? "rgba(240,200,74,0.5)" : "rgba(59,130,246,0.4)") : "#1c1c38"}`,
                color: active ? (isToday ? "#f0c84a" : "#60a5fa") : "#475569",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                <span>
                  {isToday ? "Aujourd'hui" : new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9 }}>
                  {hasHigh && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />}
                  <span style={{ color: active ? "inherit" : "#334155" }}>{count} evt</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Error / Loading ── */}
      {error && (
        <div style={{ padding: 24, textAlign: "center", color: "#ef4444", fontSize: 13, background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12 }}>
          ⚠ {error}
        </div>
      )}

      {loading && !events.length && (
        <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 13 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block", marginRight: 8 }}>⟳</span>
          Chargement du calendrier ForexFactory…
        </div>
      )}

      {/* ── Events table ── */}
      {!error && activeDay && grouped[activeDay] && (
        <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, overflow: "hidden" }}>
          {/* Day header */}
          <div style={{
            padding: "12px 18px", borderBottom: "1px solid #1c1c38",
            background: activeDay === today ? "rgba(240,200,74,0.04)" : "transparent",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: activeDay === today ? "#f0c84a" : "#94a3b8" }}>
              {labelDate(activeDay)}
            </span>
            {activeDay === today && (
              <span style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>
                🕐 Paris {parisNow}
              </span>
            )}
          </div>

          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "70px 48px 70px 1fr 70px 70px 70px",
            padding: "6px 18px", borderBottom: "1px solid #161630",
            fontSize: 9, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            <span>Heure</span>
            <span>Pays</span>
            <span>Impact</span>
            <span>Événement</span>
            <span style={{ textAlign: "right" }}>Prévu</span>
            <span style={{ textAlign: "right" }}>Actuel</span>
            <span style={{ textAlign: "right" }}>Préc.</span>
          </div>

          {/* Rows */}
          {grouped[activeDay].map((ev, i) => {
            const cfg = IMPACT_CFG[ev.impact] ?? IMPACT_CFG["Non-Economic"];
            const isPast = activeDay === today && ev.parisTime <= parisNow;
            const hasActual = Boolean(ev.actual);
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "70px 48px 70px 1fr 70px 70px 70px",
                padding: "9px 18px", borderBottom: i < grouped[activeDay].length - 1 ? "1px solid #0f0f24" : "none",
                alignItems: "center", gap: 0,
                background: hasActual ? "rgba(255,255,255,0.01)" : isPast ? "transparent" : ev.impact === "High" ? "rgba(239,68,68,0.03)" : "transparent",
                opacity: isPast && !hasActual ? 0.55 : 1,
                transition: "background 0.1s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#161630"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = hasActual ? "rgba(255,255,255,0.01)" : isPast && !hasActual ? "transparent" : ev.impact === "High" ? "rgba(239,68,68,0.03)" : "transparent"}
              >
                {/* Time */}
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 600, color: isPast ? "#334155" : "#94a3b8" }}>
                  {ev.parisTime}
                </span>

                {/* Currency / Flag */}
                <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 3 }} title={ev.currency}>
                  <span>{FLAGS[ev.currency] ?? "🌐"}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#475569" }}>{ev.currency}</span>
                </span>

                {/* Impact */}
                <ImpactDot impact={ev.impact} />

                {/* Title */}
                <span style={{ fontSize: 12, color: ev.impact === "High" ? "#e2e8f0" : "#94a3b8", fontWeight: ev.impact === "High" ? 600 : 400, paddingRight: 12 }}>
                  {ev.title}
                </span>

                {/* Forecast */}
                <ValueCell value={ev.forecast} />

                {/* Actual */}
                <ValueCell
                  value={ev.actual}
                  color={
                    ev.actual && ev.forecast
                      ? (parseFloat(ev.actual) >= parseFloat(ev.forecast) ? "#22c55e" : "#ef4444")
                      : "#e2e8f0"
                  }
                />

                {/* Previous */}
                <ValueCell value={ev.previous} color="#64748b" />
              </div>
            );
          })}
        </div>
      )}

      {/* No events */}
      {!loading && !error && activeDay && !grouped[activeDay] && (
        <div style={{ padding: 40, textAlign: "center", color: "#334155", fontSize: 13, background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12 }}>
          Aucun événement pour ce filtre.
        </div>
      )}

      {/* ── Footer note ── */}
      <div style={{ marginTop: 14, padding: "10px 16px", background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, fontSize: 11, color: "#334155", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>
          💡 <strong style={{ color: "#64748b" }}>Règle d&apos;or :</strong> Éviter les entrées 30 min avant/après les publications <span style={{ color: "#ef4444" }}>rouges</span>. NFP et décisions de taux : 100–200 pips en quelques minutes.
        </span>
        <span style={{ color: "#1e293b" }}>Source : economic-calendar.tradingview.com</span>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
