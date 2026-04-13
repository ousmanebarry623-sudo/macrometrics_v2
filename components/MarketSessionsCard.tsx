"use client";
import { useEffect, useState } from "react";

// Sessions définies en heure LOCALE du centre financier (IANA timezone).
// Les UTC open/close sont recalculés dynamiquement → gestion automatique du DST.
const SESSIONS_DEF = [
  { name: "Sydney",   tz: "Australia/Sydney",  localOpen: 7,  localClose: 16, color: "#a855f7" },
  { name: "Tokyo",    tz: "Asia/Tokyo",         localOpen: 9,  localClose: 18, color: "#3b82f6" },
  { name: "Londres",  tz: "Europe/London",      localOpen: 8,  localClose: 17, color: "#f97316" },
  { name: "New York", tz: "America/New_York",   localOpen: 8,  localClose: 17, color: "#22c55e" },
];

// Convertit une heure locale (hh:00) d'un timezone donné en minutes UTC (0-1439)
function localHourToUTCMinutes(localHour: number, tz: string): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const curLocalH = parseInt(parts.find(p => p.type === "hour")!.value);
  const curLocalM = parseInt(parts.find(p => p.type === "minute")!.value);
  const curLocalMins = curLocalH * 60 + curLocalM;
  const curUTCMins   = now.getUTCHours() * 60 + now.getUTCMinutes();
  // offset = Local - UTC (positive for zones east of UTC)
  let offset = curLocalMins - curUTCMins;
  if (offset >  720) offset -= 1440;
  if (offset < -720) offset += 1440;
  // UTC = Local - offset
  return ((localHour * 60 - offset) + 1440) % 1440;
}

// Abréviation dynamique du timezone (AEST / AEDT / BST / GMT / EDT / EST…)
function getTzAbbr(tz: string): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date())
      .find(p => p.type === "timeZoneName")?.value ?? tz
  );
}

// Session active ? (minutes UTC, gère le cross-minuit)
function isActiveUTC(openM: number, closeM: number): boolean {
  const now  = new Date();
  const nowM = now.getUTCHours() * 60 + now.getUTCMinutes();
  return openM < closeM
    ? nowM >= openM && nowM < closeM
    : nowM >= openM || nowM < closeM;
}

// Progression dans la session (%)
function getProgressUTC(openM: number, closeM: number): number {
  const now = new Date();
  let nowM  = now.getUTCHours() * 60 + now.getUTCMinutes();
  let close = closeM;
  if (close < openM) close += 1440;
  if (nowM  < openM) nowM  += 1440;
  return Math.max(0, Math.min(100, ((nowM - openM) / (close - openM)) * 100));
}

// UTC minutes → heure Paris ("HH:MM")
function utcMinsToParisHHMM(utcMins: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    Math.floor(utcMins / 60), utcMins % 60,
  ));
  return d.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function MarketSessionsCard() {
  const [parisTime, setParisTime] = useState("--:--:--");
  const [tick,      setTick]      = useState(0);   // force re-render chaque seconde
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => {
      setParisTime(
        new Date().toLocaleTimeString("fr-FR", {
          timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        }),
      );
      setTick(n => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Sessions Marché
        </h3>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "#f0c84a", background: "#0d0d1a", padding: "3px 10px", borderRadius: 6, border: "1px solid #1c1c38" }}>
          🇫🇷 {parisTime}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SESSIONS_DEF.map(s => {
          // Recompute UTC times every tick (handles DST correctly)
          const openM  = mounted ? localHourToUTCMinutes(s.localOpen,  s.tz) : 0;
          const closeM = mounted ? localHourToUTCMinutes(s.localClose, s.tz) : 0;
          const active = mounted && isActiveUTC(openM, closeM);
          const prog   = active ? getProgressUTC(openM, closeM) : 0;
          const abbr   = mounted ? getTzAbbr(s.tz) : "—";

          // Paris open/close display
          const parisOpen  = mounted ? utcMinsToParisHHMM(openM)  : "--:--";
          const parisClose = mounted ? utcMinsToParisHHMM(closeM) : "--:--";

          const hex = s.color.replace("#", "");
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);

          return (
            <div key={s.name} style={{
              background: active ? `rgba(${r},${g},${b},0.05)` : "#0d0d1a",
              border: `1px solid ${active ? s.color + "30" : "#1c1c38"}`,
              borderRadius: 8, padding: "11px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: active ? 8 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#f1f5f9" : "#94a3b8" }}>
                        {s.name}
                      </span>
                      {active && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: s.color,
                          background: s.color + "15", padding: "1px 6px", borderRadius: 999,
                          border: `1px solid ${s.color}30`,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          <span className="blink" style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                          OUVERT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{abbr}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace" }}>
                  {parisOpen} – {parisClose}<br />
                  <span style={{ fontSize: 9, color: "#475569" }}>Heure Paris</span>
                </div>
              </div>

              {active && (
                <div style={{ height: 3, background: "#1c1c38", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${prog}%`, background: s.color, borderRadius: 999, transition: "width 1s linear" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Supprime le warning "tick non utilisé" */}
      <span style={{ display: "none" }}>{tick}</span>
    </div>
  );
}
