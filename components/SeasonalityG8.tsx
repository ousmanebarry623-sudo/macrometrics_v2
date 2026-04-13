"use client";
import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid } from "recharts";
import { G8_PAIRS, G8_GROUPS } from "@/lib/g8-pairs";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface MonthStat { month: string; avg: number; median: number; positive: number; best: number; worst: number; count: number; }
interface PairSeason { pair: string; group: string; stats: MonthStat[]; yearlyData: { year: number; returns: (number|null)[] }[]; source?: "gsheets" | "yahoo"; }

// Recompute stats client-side from filtered yearlyData
function computeStats(yearlyData: { year: number; returns: (number|null)[] }[]): MonthStat[] {
  return MONTHS.map((month, i) => {
    const vals = yearlyData.map(y => y.returns[i]).filter((v): v is number => v !== null);
    if (!vals.length) return { month, avg: 0, median: 0, positive: 50, best: 0, worst: 0, count: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const positive = (vals.filter(v => v > 0).length / vals.length) * 100;
    return {
      month, count: vals.length,
      avg: parseFloat(avg.toFixed(3)),
      median: parseFloat(median.toFixed(3)),
      positive: parseFloat(positive.toFixed(1)),
      best: parseFloat(Math.max(...vals).toFixed(3)),
      worst: parseFloat(Math.min(...vals).toFixed(3)),
    };
  });
}

const TOOLTIP = ({ active, payload, label }: { active?: boolean; payload?: { payload: MonthStat }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>{label}</div>
      <div style={{ color: d.avg >= 0 ? "#22c55e" : "#ef4444" }}>Moy: {d.avg >= 0 ? "+" : ""}{d.avg.toFixed(2)}%</div>
      <div style={{ color: "#94a3b8" }}>Médiane: {d.median >= 0 ? "+" : ""}{d.median.toFixed(2)}%</div>
      <div style={{ color: d.positive >= 60 ? "#22c55e" : d.positive <= 40 ? "#ef4444" : "#eab308" }}>Positif: {d.positive.toFixed(0)}%</div>
      <div style={{ color: "#22c55e", fontSize: 11 }}>Best: +{d.best.toFixed(2)}%</div>
      <div style={{ color: "#ef4444", fontSize: 11 }}>Worst: {d.worst.toFixed(2)}%</div>
      <div style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>{d.count} années</div>
    </div>
  );
};

// Plage Google Sheet : 2015 → 2025 (année précédente = dernière avec données complètes)
const SHEET_FROM = 2015;
const SHEET_TO   = 2025; // seasonEnd fixe

const PRESETS: { label: string; start: number; end: number }[] = [
  { label: "1 an",   start: 2024, end: SHEET_TO },
  { label: "3 ans",  start: 2022, end: SHEET_TO },
  { label: "5 ans",  start: 2020, end: SHEET_TO },
  { label: "10 ans", start: 2015, end: SHEET_TO },
  { label: "Tout",   start: SHEET_FROM, end: SHEET_TO },
];

export default function SeasonalityG8() {
  const [allData, setAllData] = useState<PairSeason[]>([]);
  const [selected, setSelected] = useState("EUR/USD");
  const [group, setGroup] = useState("Majors");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"bars"|"heatmap">("bars");

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Date range state — fixée sur la plage du Google Sheet (2015-2025)
  const seasonEnd = SHEET_TO;
  const [dateEnabled, setDateEnabled] = useState(false);
  const [startYear, setStartYear] = useState(SHEET_FROM);
  const [endYear, setEndYear] = useState(SHEET_TO);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seasonality");
      const data = await res.json();
      setAllData(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const inst = allData.find(d => d.pair === selected);
  const groupPairs = G8_PAIRS.filter(p => p.group === group).map(p => p.label);

  // Filter yearlyData by date range if enabled
  const effectiveEnd = endYear < startYear ? startYear : endYear;
  const filteredYearly = (inst?.yearlyData ?? []).filter(y =>
    !dateEnabled || (y.year >= startYear && y.year <= effectiveEnd)
  );
  const chartData = dateEnabled ? computeStats(filteredYearly) : (inst?.stats ?? []);
  const maxAbs = chartData.length ? Math.max(...chartData.map(d => Math.abs(d.avg)), 0.1) : 1;

  // For heatmap: per-pair filtered stats
  function getPairStats(pair: string): MonthStat[] {
    const d = allData.find(a => a.pair === pair);
    if (!d) return [];
    if (!dateEnabled) return d.stats;
    const fy = d.yearlyData.filter(y => y.year >= startYear && y.year <= effectiveEnd);
    return computeStats(fy);
  }

  const parisDate = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Saisonnalité G8 — 28 Paires</h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Historique mensuel · {`${startYear}–${effectiveEnd} (${effectiveEnd - startYear + 1} ans)`} · {parisDate}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {inst && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              background: inst.source === "gsheets" ? "rgba(34,197,94,0.1)" : "rgba(59,130,246,0.1)",
              border: `1px solid ${inst.source === "gsheets" ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.3)"}`,
              color: inst.source === "gsheets" ? "#22c55e" : "#3b82f6",
            }}>
              {inst.source === "gsheets" ? "📄 Mes données" : "📡 Yahoo Finance"}
            </span>
          )}
          {(["bars","heatmap"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              background: view === v ? "rgba(212,175,55,0.12)" : "transparent",
              border: `1px solid ${view === v ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
              color: view === v ? "#f0c84a" : "#475569" }}>
              {v === "bars" ? "📊 Barres" : "🌡 Heatmap"}
            </button>
          ))}
        </div>
      </div>

      {/* Date range filter */}
      <div style={{ marginBottom: 14, padding: "12px 14px", background: "#0d0d1a", border: `1px solid ${dateEnabled ? "rgba(212,175,55,0.3)" : "#1c1c38"}`, borderRadius: 8 }}>
        {/* Toggle row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: dateEnabled ? 10 : 0 }}>
          <button onClick={() => setDateEnabled(e => !e)} style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <div style={{ width: 34, height: 18, borderRadius: 999, background: dateEnabled ? "rgba(212,175,55,0.25)" : "#1c1c38", border: `1px solid ${dateEnabled ? "rgba(212,175,55,0.5)" : "#2a2a50"}`, position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: dateEnabled ? 16 : 2, width: 12, height: 12, borderRadius: "50%", background: dateEnabled ? "#f0c84a" : "#475569", transition: "left 0.2s" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: dateEnabled ? "#f0c84a" : "#475569" }}>Filtre par période</span>
          </button>
          {dateEnabled && (
            <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>
              {filteredYearly.length} années sélectionnées
            </span>
          )}
        </div>

        {dateEnabled && (
          <>
            {/* Presets */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {PRESETS.map(p => {
                const sy = p.start;
                const ey = p.end;
                const active = startYear === sy && endYear === ey;
                return (
                  <button key={p.label} onClick={() => { setStartYear(sy); setEndYear(ey); }}
                    style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 5, cursor: "pointer",
                      background: active ? "rgba(212,175,55,0.15)" : "transparent",
                      border: `1px solid ${active ? "rgba(212,175,55,0.4)" : "#1c1c38"}`,
                      color: active ? "#f0c84a" : "#64748b" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom range: De AAAA à AAAA */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
              <span style={{ color: "#475569" }}>De</span>
              <input
                type="number"
                min={SHEET_FROM}
                max={effectiveEnd}
                value={startYear}
                onChange={e => {
                  const v = parseInt(e.target.value) || SHEET_FROM;
                  setStartYear(Math.min(effectiveEnd, Math.max(SHEET_FROM, v)));
                }}
                style={{ width: 62, background: "#10101e", border: "1px solid #2a2a50", borderRadius: 5, color: "#f0c84a", fontSize: 11, padding: "3px 6px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}
              />
              <span style={{ color: "#475569" }}>à</span>
              <input
                type="number"
                min={startYear}
                max={seasonEnd}
                value={endYear}
                onChange={e => {
                  const v = parseInt(e.target.value) || seasonEnd;
                  setEndYear(Math.min(seasonEnd, Math.max(startYear, v)));
                }}
                style={{ width: 62, background: "#10101e", border: "1px solid #2a2a50", borderRadius: 5, color: "#f0c84a", fontSize: 11, padding: "3px 6px", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}
              />
              {endYear === seasonEnd && (
                <span style={{ fontSize: 9, color: "#22c55e", background: "rgba(34,197,94,0.08)", padding: "1px 6px", borderRadius: 4, border: "1px solid rgba(34,197,94,0.2)" }}>
                  {seasonEnd}
                </span>
              )}
              <span style={{ color: "#475569", marginLeft: 4 }}>
                → <strong style={{ color: "#94a3b8" }}>{effectiveEnd - startYear + 1}</strong> ans
              </span>
            </div>
          </>
        )}
      </div>

      {/* Group tabs */}
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        {G8_GROUPS.map(g => (
          <button key={g} onClick={() => { setGroup(g); const first = G8_PAIRS.find(p => p.group === g); if (first) setSelected(first.label); }}
            style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              background: group === g ? "rgba(212,175,55,0.12)" : "#0d0d1a",
              border: `1px solid ${group === g ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
              color: group === g ? "#f0c84a" : "#475569" }}>
            {g}
          </button>
        ))}
      </div>

      {/* Pair selector */}
      <div style={{ display: "flex", gap: 5, marginBottom: 18, flexWrap: "wrap" }}>
        {groupPairs.map(p => {
          const stats = getPairStats(p);
          const cur = stats[currentMonth];
          return (
            <button key={p} onClick={() => setSelected(p)}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                background: selected === p ? "#1c1c38" : "transparent",
                border: `1px solid ${selected === p ? "#2a2a50" : "#1c1c38"}`,
                color: selected === p ? "#f1f5f9" : "#475569" }}>
              {p}
              {cur && <span style={{ marginLeft: 4, fontSize: 9, color: cur.avg >= 0 ? "#22c55e" : "#ef4444" }}>{cur.avg >= 0 ? "▲" : "▼"}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : inst ? (
        <>
          {view === "bars" ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c38" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} tickLine={false} />
                <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} domain={[-maxAbs * 1.3, maxAbs * 1.3]} />
                <Tooltip content={<TOOLTIP />} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 2" />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={i === currentMonth ? "#f0c84a" : entry.avg >= 0 ? "#22c55e" : "#ef4444"}
                      fillOpacity={i === currentMonth ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "6px 8px", color: "#475569", textAlign: "left", borderBottom: "1px solid #1c1c38", fontSize: 10 }}>Paire</th>
                    {MONTHS.map((m, i) => <th key={m} style={{ padding: "6px 5px", textAlign: "center", borderBottom: "1px solid #1c1c38", fontSize: 10, color: i === currentMonth ? "#f0c84a" : "#475569", fontWeight: i === currentMonth ? 700 : 400, minWidth: 44 }}>{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {groupPairs.map(p => {
                    const stats = getPairStats(p);
                    if (!stats.length) return null;
                    return (
                      <tr key={p} style={{ borderBottom: "1px solid #1c1c3840", cursor: "pointer" }} onClick={() => setSelected(p)}>
                        <td style={{ padding: "7px 8px", fontWeight: 700, color: selected === p ? "#f0c84a" : "#94a3b8", whiteSpace: "nowrap" }}>{p}</td>
                        {stats.map((s, i) => {
                          const intensity = Math.min(Math.abs(s.avg) / 2, 1);
                          const bg = s.avg > 0 ? `rgba(34,197,94,${intensity * 0.65})` : `rgba(239,68,68,${intensity * 0.65})`;
                          return (
                            <td key={i} style={{ padding: "7px 3px", textAlign: "center", background: bg, fontSize: 10, fontWeight: 600, fontFamily: "JetBrains Mono, monospace",
                              color: s.avg > 0 ? "#86efac" : "#fca5a5",
                              border: i === currentMonth ? "1px solid rgba(240,200,74,0.5)" : "none" }}>
                              {s.avg > 0 ? "+" : ""}{s.avg.toFixed(1)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Current month stats */}
          {chartData[currentMonth] && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { label: `Moy ${MONTHS[currentMonth]}`, value: `${chartData[currentMonth].avg >= 0 ? "+" : ""}${chartData[currentMonth].avg.toFixed(2)}%`, color: chartData[currentMonth].avg >= 0 ? "#22c55e" : "#ef4444" },
                { label: "% Années +", value: `${chartData[currentMonth].positive.toFixed(0)}%`, color: chartData[currentMonth].positive >= 60 ? "#22c55e" : chartData[currentMonth].positive <= 40 ? "#ef4444" : "#eab308" },
                { label: "Meilleur", value: `+${chartData[currentMonth].best.toFixed(2)}%`, color: "#22c55e" },
                { label: "Pire", value: `${chartData[currentMonth].worst.toFixed(2)}%`, color: "#ef4444" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>Chargement des données saisonnières…</div>
      )}
    </div>
  );
}
