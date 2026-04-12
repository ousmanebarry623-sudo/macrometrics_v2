"use client";
import { useEffect, useState } from "react";

interface FGData { score: number; rating: string; prevClose: number; prevWeek: number; prevMonth: number; history: { date: string; value: number }[]; }

function getColor(s: number) {
  if (s <= 20) return "#ef4444"; if (s <= 40) return "#f97316";
  if (s <= 60) return "#eab308"; if (s <= 80) return "#84cc16";
  return "#22c55e";
}
function getLabel(s: number) {
  if (s <= 20) return "Peur Extrême"; if (s <= 40) return "Peur";
  if (s <= 60) return "Neutre"; if (s <= 80) return "Avidité";
  return "Avidité Extrême";
}

export default function FearGreedCard() {
  const [data, setData] = useState<FGData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/fear-greed").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fear & Greed</h3>
        <span style={{ fontSize: 10, color: "#475569", background: "#0d0d1a", padding: "2px 8px", borderRadius: 999, border: "1px solid #1c1c38" }}>Crypto · 30j</span>
      </div>
      {loading ? <div className="skeleton" style={{ height: 160 }} /> : data ? (
        <>
          {/* Gauge */}
          <div style={{ position: "relative", width: 150, height: 80, margin: "0 auto 8px" }}>
            <svg width="150" height="80" viewBox="0 0 150 80">
              <path d="M 10 75 A 65 65 0 0 1 140 75" fill="none" stroke="#1c1c38" strokeWidth={10} strokeLinecap="round" />
              <path d="M 10 75 A 65 65 0 0 1 140 75" fill="none" stroke="url(#fg)" strokeWidth={10} strokeLinecap="round"
                strokeDasharray={`${(data.score/100)*205} 205`} />
              <defs>
                <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" /><stop offset="50%" stopColor="#eab308" /><stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <g transform={`translate(75,75) rotate(${(data.score/100)*180-90})`}>
                <line x1="0" y1="0" x2="0" y2="-50" stroke={getColor(data.score)} strokeWidth={2.5} strokeLinecap="round" />
                <circle cx="0" cy="0" r="5" fill={getColor(data.score)} />
              </g>
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: getColor(data.score), fontFamily: "JetBrains Mono, monospace" }}>{data.score}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: getColor(data.score) }}>{getLabel(data.score)}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 14 }}>
            {[["Hier", data.prevClose], ["Semaine", data.prevWeek], ["Mois", data.prevMonth]].map(([l, v]) => (
              <div key={String(l)} style={{ background: "#0d0d1a", borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#475569" }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: getColor(Number(v)), fontFamily: "JetBrains Mono, monospace" }}>{v}</div>
              </div>
            ))}
          </div>
        </>
      ) : <div style={{ textAlign: "center", color: "#475569", padding: 32 }}>Indisponible</div>}
    </div>
  );
}
