"use client";
import { useEffect, useState, useCallback } from "react";
import type { CentralBank } from "@/lib/trading-economics";

const BIAS_CFG = {
  hawkish: { color: "#22c55e", label: "Hawkish 🦅", bg: "rgba(34,197,94,0.06)" },
  neutral:  { color: "#f0c84a", label: "Neutre ⚖️",  bg: "rgba(240,200,74,0.06)" },
  dovish:   { color: "#ef4444", label: "Dovish 🕊️",  bg: "rgba(239,68,68,0.06)" },
};

function daysUntil(dateStr: string): string {
  const d = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (d < 0)  return "Passée";
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return "Demain";
  return `dans ${d}j`;
}

export default function CentralBanksCard() {
  const [banks, setBanks] = useState<CentralBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpd, setLastUpd] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/macro-data?type=central-banks", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const data: CentralBank[] = await r.json();
      setBanks(data);
      setLastUpd(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60 * 60 * 1000); // refresh 1h
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Banques Centrales G8
          </h3>
          <p style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>Taux · Réunion · Probabilités</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpd && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>MAJ {lastUpd}</span>}
          <button onClick={fetchData} title="Actualiser" style={{ background: "none", border: "1px solid #1c1c38", borderRadius: 6, color: "#475569", cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 10 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: 8 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 10 }}>
          {banks.map(b => {
            const bc = BIAS_CFG[b.bias];
            const forecast = b.forecast ?? b.currentRate;
            const rateDir = forecast > b.currentRate ? "▲" : forecast < b.currentRate ? "▼" : "—";
            const rateDirColor = forecast > b.currentRate ? "#22c55e" : forecast < b.currentRate ? "#ef4444" : "#94a3b8";
            const meetingStr = new Date(b.nextMeeting).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            const countdown = daysUntil(b.nextMeeting);
            const dominant = b.probability.hike >= b.probability.cut
              ? (b.probability.hike >= b.probability.hold ? "hike" : "hold")
              : (b.probability.cut >= b.probability.hold ? "cut" : "hold");

            return (
              <div key={b.name} style={{
                background: "#0d0d1a",
                border: `1px solid ${bc.color}20`,
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{b.flag}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>{b.name}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{b.currency}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: bc.color, background: bc.bg, padding: "3px 8px", borderRadius: 999, border: `1px solid ${bc.color}30` }}>
                    {bc.label}
                  </span>
                </div>

                {/* Taux actuel */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Taux actuel</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#f0c84a", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
                      {b.currentRate.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>Prévision</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: rateDirColor, fontFamily: "JetBrains Mono, monospace" }}>
                      {rateDir} {b.forecast.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Probabilité */}
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Probabilité prochaine décision
                  </div>
                  <div style={{ height: 5, borderRadius: 999, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${b.probability.hike}%`, background: "#22c55e", flexShrink: 0 }} />
                    <div style={{ width: `${b.probability.hold}%`, background: "#f0c84a", flexShrink: 0 }} />
                    <div style={{ flex: 1, background: "#ef4444" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
                    <span style={{ color: "#22c55e", fontWeight: dominant === "hike" ? 800 : 400 }}>↑ {b.probability.hike}%</span>
                    <span style={{ color: "#f0c84a", fontWeight: dominant === "hold" ? 800 : 400 }}>— {b.probability.hold}%</span>
                    <span style={{ color: "#ef4444", fontWeight: dominant === "cut"  ? 800 : 400 }}>↓ {b.probability.cut}%</span>
                  </div>
                </div>

                {/* Prochaine réunion */}
                <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>Prochaine réunion</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{meetingStr}</span>
                    <span style={{ fontSize: 9, color: bc.color, background: bc.bg, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>{countdown}</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
