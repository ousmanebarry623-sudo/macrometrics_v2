"use client";
import { useEffect, useState } from "react";
import { G8_GROUPS } from "@/lib/g8-pairs";

interface PairData {
  label: string; group: string; price: number;
  change: number; changePct: number; high: number; low: number;
}

export default function G8Overview() {
  const [data, setData] = useState<PairData[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("Majors");
  const [sort, setSort] = useState<"label"|"changePct">("label");

  useEffect(() => {
    const load = () => fetch("/api/market-data").then(r => r.json())
      .then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = data
    .filter(d => d.group === group)
    .sort((a, b) => sort === "changePct" ? b.changePct - a.changePct : a.label.localeCompare(b.label));

  const groupStrength = G8_GROUPS.map(g => {
    const pairs = data.filter(d => d.group === g);
    const avg = pairs.length ? pairs.reduce((s, p) => s + p.changePct, 0) / pairs.length : 0;
    return { group: g, avg };
  });

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>G8 — 28 Paires Forex</h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Mise à jour toutes les 15s · Heure de Paris</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
            <span className="blink" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />Live
          </span>
          <select value={sort} onChange={e => setSort(e.target.value as "label"|"changePct")}
            style={{ background: "#0d0d1a", border: "1px solid #1c1c38", color: "#94a3b8", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>
            <option value="label">A→Z</option>
            <option value="changePct">% Change</option>
          </select>
        </div>
      </div>

      {/* Group tabs */}
      <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
        {G8_GROUPS.map(g => {
          const str = groupStrength.find(gs => gs.group === g);
          return (
            <button key={g} onClick={() => setGroup(g)} style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
              background: group === g ? "rgba(212,175,55,0.12)" : "#0d0d1a",
              border: `1px solid ${group === g ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
              color: group === g ? "#f0c84a" : "#475569",
            }}>
              {g.split(" ")[0]}
              {str && str.avg !== 0 && (
                <span style={{ marginLeft: 5, color: str.avg > 0 ? "#22c55e" : "#ef4444", fontSize: 10 }}>
                  {str.avg > 0 ? "▲" : "▼"}{Math.abs(str.avg).toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 8 }}>
          {Array(7).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 8 }}>
          {filtered.map(p => (
            <div key={p.label} style={{
              background: "#0d0d1a", border: `1px solid ${p.changePct > 0.1 ? "#22c55e18" : p.changePct < -0.1 ? "#ef444418" : "#1c1c38"}`,
              borderRadius: 9, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{p.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.changePct >= 0 ? "#22c55e" : "#ef4444" }}>
                  {p.changePct >= 0 ? "▲" : "▼"}{Math.abs(p.changePct).toFixed(3)}%
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", fontFamily: "JetBrains Mono, monospace" }}>
                {p.price > 0 ? p.price.toFixed(p.price > 10 ? 3 : 5) : "—"}
              </div>
              {p.high > 0 && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                  H: {p.high.toFixed(p.high > 10 ? 3 : 5)} · L: {p.low.toFixed(p.low > 10 ? 3 : 5)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
