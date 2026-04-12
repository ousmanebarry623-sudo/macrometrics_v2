"use client";
import { useEffect, useState } from "react";

const SESSIONS = [
  { name: "Sydney",   flag: "🇦🇺", openUTC: "21:00", closeUTC: "06:00", color: "#a855f7", tz: "AEDT" },
  { name: "Tokyo",    flag: "🇯🇵", openUTC: "23:00", closeUTC: "08:00", color: "#3b82f6", tz: "JST" },
  { name: "Londres",  flag: "🇬🇧", openUTC: "07:00", closeUTC: "16:00", color: "#f97316", tz: "GMT/BST" },
  { name: "New York", flag: "🇺🇸", openUTC: "13:00", closeUTC: "22:00", color: "#22c55e", tz: "EST/EDT" },
];

function isActive(open: string, close: string) {
  const now = new Date();
  const nowM = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [oh,om] = open.split(":").map(Number);
  const [ch,cm] = close.split(":").map(Number);
  const openM = oh*60+om, closeM = ch*60+cm;
  return openM < closeM ? nowM >= openM && nowM < closeM : nowM >= openM || nowM < closeM;
}

function toParisTime(utcHHMM: string) {
  const [h,m] = utcHHMM.split(":").map(Number);
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  return d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false });
}

function getProgress(open: string, close: string) {
  const now = new Date();
  let nowM = now.getUTCHours()*60 + now.getUTCMinutes();
  const [oh,om] = open.split(":").map(Number);
  const [ch,cm] = close.split(":").map(Number);
  let openM = oh*60+om, closeM = ch*60+cm;
  if (closeM < openM) closeM += 1440;
  if (nowM < openM) nowM += 1440;
  return Math.max(0, Math.min(100, ((nowM-openM)/(closeM-openM))*100));
}

export default function MarketSessionsCard() {
  const [parisTime, setParisTime] = useState("--:--:--");
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    function update() {
      setParisTime(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    }
    setMounted(true);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sessions Marché</h3>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "#f0c84a", background: "#0d0d1a", padding: "3px 10px", borderRadius: 6, border: "1px solid #1c1c38" }}>
          🇫🇷 {parisTime}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SESSIONS.map(s => {
          const active = mounted && isActive(s.openUTC, s.closeUTC);
          const prog = active ? getProgress(s.openUTC, s.closeUTC) : 0;
          const hex = s.color.replace("#","");
          const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
          return (
            <div key={s.name} style={{ background: active ? `rgba(${r},${g},${b},0.05)` : "#0d0d1a", border: `1px solid ${active ? s.color+"30" : "#1c1c38"}`, borderRadius: 8, padding: "11px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: active ? 8 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{s.flag}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#f1f5f9" : "#94a3b8" }}>{s.name}</span>
                      {active && <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: s.color+"15", padding: "1px 6px", borderRadius: 999, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", gap: 3 }}>
                        <span className="blink" style={{ width: 4, height: 4, borderRadius: "50%", background: s.color, display: "inline-block" }} />OUVERT
                      </span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{s.tz}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace" }}>
                  {toParisTime(s.openUTC)} – {toParisTime(s.closeUTC)}<br/>
                  <span style={{ fontSize: 9, color: "#475569" }}>Heure Paris</span>
                </div>
              </div>
              {active && <div style={{ height: 3, background: "#1c1c38", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${prog}%`, background: s.color, borderRadius: 999, transition: "width 1s linear" }} />
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
