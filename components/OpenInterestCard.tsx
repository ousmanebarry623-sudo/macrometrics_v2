"use client";
import { useEffect, useState } from "react";

interface OIItem { name: string; cat: string; yf: string; price: number; changePct: number; openInterest: number | null; }

function fmt(n: number | null) {
  if (n === null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtPrice(n: number, cat: string) {
  if (n === 0) return "—";
  if (cat === "Forex") return n.toFixed(4);
  if (n >= 10000) return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

const CATS = ["Tous", "Forex", "Métaux", "Énergie", "Agricole", "Indices", "Crypto"];

const CAT_COLORS: Record<string, string> = {
  Forex:    "#3b82f6",
  Métaux:   "#f0c84a",
  Énergie:  "#f97316",
  Agricole: "#22c55e",
  Indices:  "#8b5cf6",
  Crypto:   "#f59e0b",
};

export default function OpenInterestCard() {
  const [data, setData]     = useState<OIItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat]       = useState("Tous");

  useEffect(() => {
    const load = () =>
      fetch("/api/open-interest").then(r => r.json())
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const filtered = cat === "Tous" ? data : data.filter(d => d.cat === cat);

  // Summary counts per cat
  const counts = CATS.slice(1).reduce<Record<string, number>>((acc, c) => {
    acc[c] = data.filter(d => d.cat === c).length;
    return acc;
  }, {});

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Open Interest</h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Futures · Prix temps réel · Positions hebdo</p>
        </div>
        <span style={{ fontSize: 10, color: "#3b82f6", background: "rgba(59,130,246,0.1)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(59,130,246,0.2)" }}>CME · ICE · CBOT</span>
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {CATS.map(c => {
          const count = c === "Tous" ? data.length : counts[c] ?? 0;
          const color = c === "Tous" ? "#f0c84a" : CAT_COLORS[c];
          const active = cat === c;
          return (
            <button key={c} onClick={() => setCat(c)} style={{
              fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
              background: active ? `${color}18` : "transparent",
              border: `1px solid ${active ? `${color}50` : "#1c1c38"}`,
              color: active ? color : "#475569",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {c}
              {count > 0 && <span style={{ fontSize: 9, opacity: 0.7 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array(8).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Instrument", "Prix", "% Chg", "Open Interest"].map(h => (
                  <th key={h} style={{
                    padding: "6px 10px", color: "#475569", fontSize: 10, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: "1px solid #1c1c38",
                    textAlign: h === "Instrument" ? "left" : "right",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const oiFmt = fmt(item.openInterest);
                const catColor = CAT_COLORS[item.cat] ?? "#475569";
                return (
                  <tr key={item.name} style={{ borderBottom: "1px solid #1c1c3840" }}>
                    <td style={{ padding: "9px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{
                          width: 3, height: 16, borderRadius: 2, flexShrink: 0,
                          background: catColor, display: "inline-block",
                        }} />
                        <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{item.name}</span>
                        {cat === "Tous" && (
                          <span style={{ fontSize: 9, color: catColor, background: `${catColor}15`,
                            padding: "1px 5px", borderRadius: 4, border: `1px solid ${catColor}30` }}>
                            {item.cat}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: "#f1f5f9", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                      {fmtPrice(item.price, item.cat)}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                      color: item.changePct > 0 ? "#22c55e" : item.changePct < 0 ? "#ef4444" : "#475569" }}>
                      {item.changePct !== 0 ? `${item.changePct >= 0 ? "▲" : "▼"}${Math.abs(item.changePct).toFixed(2)}%` : "—"}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      {oiFmt ? (
                        <span style={{ color: "#3b82f6", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{oiFmt}</span>
                      ) : (
                        <span style={{ color: "#334155", fontSize: 10 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, padding: "10px 12px", background: "#0d0d1a", borderRadius: 8, border: "1px solid #1c1c38", fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
        💡 <strong style={{ color: "#94a3b8" }}>OI + Prix :</strong> OI hausse + prix hausse = tendance forte.
        OI hausse + prix baisse = tendance baissière renforcée. OI baisse = positions qui se ferment.
      </div>
    </div>
  );
}
