"use client";
import { useEffect, useState } from "react";

interface Sentiment { pair: string; longPct: number; shortPct: number; source: string; contrarian: "Buy"|"Sell"|"Neutral"; note: string; }

const GROUPS = ["Tous", "Majors", "Crosses", "Commodities"];

function getGroup(pair: string): string {
  const majors = ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD"];
  const commodities = ["XAU/USD","XAG/USD","WTI/USD","XCU/USD","XAG/USD"];
  if (majors.includes(pair)) return "Majors";
  if (commodities.includes(pair)) return "Commodities";
  return "Crosses";
}

export default function RetailSentimentCard() {
  const [data, setData] = useState<Sentiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [signal, setSignal] = useState("All");
  const [group, setGroup] = useState("Tous");
  const [topOnly, setTopOnly] = useState(false);

  useEffect(() => {
    fetch("/api/retail-sentiment").then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const signals = { Buy: data.filter(d => d.contrarian === "Buy"), Sell: data.filter(d => d.contrarian === "Sell"), Neutral: data.filter(d => d.contrarian === "Neutral") };

  const filtered = (() => {
    let list = data.filter(d => {
      const sigOk = signal === "All" || d.contrarian === signal;
      const grpOk = group === "Tous" || getGroup(d.pair) === group;
      return sigOk && grpOk;
    });
    if (topOnly) {
      list = list.filter(d => d.contrarian !== "Neutral");
      list = [...list].sort((a, b) => Math.abs(b.longPct - 50) - Math.abs(a.longPct - 50));
    }
    return list;
  })();

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sentiment Retail</h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            MyFXBook Community Outlook · Toutes paires disponibles
          </p>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setTopOnly(t => !t)} style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
            background: topOnly ? "rgba(251,191,36,0.18)" : "transparent",
            border: `1px solid ${topOnly ? "#fbbf2460" : "#1c1c38"}`,
            color: topOnly ? "#fbbf24" : "#475569",
          }}>⭐ Top</button>
          {["All","Buy","Sell","Neutral"].map(f => (
            <button key={f} onClick={() => setSignal(f)} style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
              background: signal === f ? (f === "Buy" ? "rgba(34,197,94,0.15)" : f === "Sell" ? "rgba(239,68,68,0.15)" : "rgba(212,175,55,0.12)") : "transparent",
              border: `1px solid ${signal === f ? (f === "Buy" ? "#22c55e40" : f === "Sell" ? "#ef444440" : "#d4af3740") : "#1c1c38"}`,
              color: signal === f ? (f === "Buy" ? "#22c55e" : f === "Sell" ? "#ef4444" : "#f0c84a") : "#475569",
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Group tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {GROUPS.map(g => (
          <button key={g} onClick={() => setGroup(g)} style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
            background: group === g ? "rgba(212,175,55,0.1)" : "transparent",
            border: `1px solid ${group === g ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
            color: group === g ? "#f0c84a" : "#475569",
          }}>{g}</button>
        ))}
      </div>

      {/* Signal summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Contrarian Buy", count: signals.Buy.length, color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
          { label: "Contrarian Sell", count: signals.Sell.length, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
          { label: "Neutre", count: signals.Neutral.length, color: "#eab308", bg: "rgba(234,179,8,0.08)" },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}20`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "JetBrains Mono, monospace" }}>{count}</div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array(6).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 380, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "#475569", padding: 20, fontSize: 13 }}>Aucune paire</div>
          ) : filtered.map(d => (
            <div key={d.pair} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "9px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{d.pair}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  background: d.contrarian === "Buy" ? "rgba(34,197,94,0.12)" : d.contrarian === "Sell" ? "rgba(239,68,68,0.12)" : "rgba(234,179,8,0.08)",
                  color: d.contrarian === "Buy" ? "#22c55e" : d.contrarian === "Sell" ? "#ef4444" : "#eab308",
                  border: `1px solid ${d.contrarian === "Buy" ? "#22c55e30" : d.contrarian === "Sell" ? "#ef444430" : "#eab30820"}`,
                }}>{d.contrarian === "Neutral" ? "—" : `⚡ ${d.contrarian}`}</span>
              </div>
              <div style={{ display: "flex", height: 5, borderRadius: 999, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${d.longPct}%`, background: "#22c55e" }} />
                <div style={{ width: `${d.shortPct}%`, background: "#ef4444" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#22c55e", fontWeight: 600 }}>Long {d.longPct}%</span>
                <span style={{ color: "#475569", fontSize: 9 }}>
                  {topOnly ? `Force: ${Math.abs(d.longPct - 50)}pts` : d.note}
                </span>
                <span style={{ color: "#ef4444", fontWeight: 600 }}>Short {d.shortPct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
