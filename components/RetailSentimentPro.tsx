"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Area,
} from "recharts";
import type { EnhancedSentiment } from "@/app/api/retail-sentiment-pro/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null, decimals = 1): string {
  if (n === null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtDelta(n: number | null): { text: string; color: string } {
  if (n === null) return { text: "—", color: "#475569" };
  const sign = n > 0 ? "+" : "";
  const color = n > 3 ? "#ef4444" : n < -3 ? "#22c55e" : "#94a3b8";
  return { text: `${sign}${fmt(n)}`, color };
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const ZONE_CONFIG = {
  EXTREME_LONG:  { label: "Extrême Long",   bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)",   text: "#ef4444", icon: "🔴" },
  LEANING_LONG:  { label: "Tendance Long",  bg: "rgba(249,115,22,0.10)",  border: "rgba(249,115,22,0.25)", text: "#f97316", icon: "🟠" },
  NEUTRAL:       { label: "Neutre",         bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", text: "#94a3b8", icon: "⚪" },
  LEANING_SHORT: { label: "Tendance Short", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.25)", text: "#3b82f6", icon: "🔵" },
  EXTREME_SHORT: { label: "Extrême Short",  bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)",   text: "#22c55e", icon: "🟢" },
};

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 60) return "#86efac";
  if (score >= 45) return "#94a3b8";
  if (score >= 35) return "#fca5a5";
  return "#ef4444";
}

function scoreBg(score: number): string {
  if (score >= 70) return "rgba(34,197,94,0.15)";
  if (score >= 60) return "rgba(34,197,94,0.08)";
  if (score >= 45) return "rgba(148,163,184,0.06)";
  if (score >= 35) return "rgba(239,68,68,0.08)";
  return "rgba(239,68,68,0.15)";
}

type SortKey = "pair" | "score" | "longPct" | "d24h" | "d7d" | "zone";
type SortDir = "asc" | "desc";
type TabId   = "heatmap" | "chart" | "timeline";
type Group   = "Tous" | "Majors" | "Crosses" | "Commodities";

function getGroup(pair: string): Group {
  if (["EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD"].includes(pair)) return "Majors";
  if (["XAU/USD","XAG/USD"].includes(pair)) return "Commodities";
  return "Crosses";
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Bar with long/short percentages
function SentimentBar({ longPct, height = 6 }: { longPct: number; height?: number }) {
  return (
    <div style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${longPct}%`, background: "#ef4444", transition: "width 0.3s" }} />
      <div style={{ width: `${100 - longPct}%`, background: "#22c55e", transition: "width 0.3s" }} />
    </div>
  );
}

// Score ring (mini circle)
function ScoreRing({ score }: { score: number }) {
  const r    = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <svg width={36} height={36} viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx={18} cy={18} r={r} fill="none" stroke="#1c1c38" strokeWidth={4} />
      <circle
        cx={18} cy={18} r={r} fill="none"
        stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dasharray 0.4s" }}
      />
      <text x={18} y={22} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}
        fontFamily="JetBrains Mono, monospace">
        {score}
      </text>
    </svg>
  );
}

// ── Heatmap view ─────────────────────────────────────────────────────────────

function HeatmapView({
  data, onSelectPair,
}: { data: EnhancedSentiment[]; onSelectPair: (pair: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [group,   setGroup]   = useState<Group>("Tous");
  const [filter,  setFilter]  = useState<"All" | "Buy" | "Sell" | "Neutral">("All");

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    let list = data.filter(d => {
      const gOk = group  === "Tous" || getGroup(d.pair) === group;
      const fOk = filter === "All"  || d.contrarian === filter;
      return gOk && fOk;
    });
    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === "pair")    diff = a.pair.localeCompare(b.pair);
      if (sortKey === "score")   diff = a.score - b.score;
      if (sortKey === "longPct") diff = a.longPct - b.longPct;
      if (sortKey === "d24h")    diff = (a.d24h ?? 0) - (b.d24h ?? 0);
      if (sortKey === "d7d")     diff = (a.d7d  ?? 0) - (b.d7d  ?? 0);
      if (sortKey === "zone") {
        const order = { EXTREME_SHORT: 0, LEANING_SHORT: 1, NEUTRAL: 2, LEANING_LONG: 3, EXTREME_LONG: 4 };
        diff = order[a.zone] - order[b.zone];
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return list;
  }, [data, sortKey, sortDir, group, filter]);

  function SortTh({ id, label }: { id: SortKey; label: string }) {
    const active = sortKey === id;
    return (
      <th onClick={() => toggleSort(id)} style={{
        padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700,
        color: active ? "#f0c84a" : "#475569", textTransform: "uppercase",
        letterSpacing: "0.06em", cursor: "pointer", userSelect: "none",
        borderBottom: "1px solid #1c1c38", whiteSpace: "nowrap",
      }}>
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  const buyCount     = data.filter(d => d.contrarian === "Buy").length;
  const sellCount    = data.filter(d => d.contrarian === "Sell").length;
  const divCount     = data.filter(d => d.divergence !== null).length;
  const extremeCount = data.filter(d => d.zone === "EXTREME_LONG" || d.zone === "EXTREME_SHORT").length;

  return (
    <div>
      {/* Summary pills */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Contrarian Buy",   value: buyCount,     color: "#22c55e", bg: "rgba(34,197,94,0.08)"   },
          { label: "Contrarian Sell",  value: sellCount,    color: "#ef4444", bg: "rgba(239,68,68,0.08)"   },
          { label: "Divergences",      value: divCount,     color: "#a855f7", bg: "rgba(168,85,247,0.08)"  },
          { label: "Zones Extrêmes",   value: extremeCount, color: "#f0c84a", bg: "rgba(240,200,74,0.08)"  },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}20`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(["Tous", "Majors", "Crosses", "Commodities"] as Group[]).map(g => (
          <button key={g} onClick={() => setGroup(g)} style={{
            fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            background: group === g ? "rgba(212,175,55,0.12)" : "transparent",
            border:     `1px solid ${group === g ? "rgba(212,175,55,0.35)" : "#1c1c38"}`,
            color:      group === g ? "#f0c84a" : "#475569",
          }}>{g}</button>
        ))}
        <div style={{ width: 1, background: "#1c1c38", margin: "0 4px" }} />
        {(["All", "Buy", "Sell", "Neutral"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            background: filter === f ? (f === "Buy" ? "rgba(34,197,94,0.15)" : f === "Sell" ? "rgba(239,68,68,0.15)" : "rgba(212,175,55,0.10)") : "transparent",
            border:     `1px solid ${filter === f ? (f === "Buy" ? "#22c55e40" : f === "Sell" ? "#ef444440" : "#d4af3740") : "#1c1c38"}`,
            color:      filter === f ? (f === "Buy" ? "#22c55e" : f === "Sell" ? "#ef4444" : "#f0c84a") : "#475569",
          }}>{f}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #1c1c38" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#0d0d1a" }}>
            <tr>
              <SortTh id="pair"    label="Paire" />
              <SortTh id="longPct" label="Long %" />
              <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1c1c38" }}>Short %</th>
              <SortTh id="d24h"    label="Δ24h" />
              <SortTh id="d7d"     label="Δ7j" />
              <SortTh id="zone"    label="Zone" />
              <SortTh id="score"   label="Score" />
              <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1c1c38" }}>Divergence</th>
              <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1c1c38" }}>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, idx) => {
              const z    = ZONE_CONFIG[d.zone];
              const d24  = fmtDelta(d.d24h);
              const d7   = fmtDelta(d.d7d);
              return (
                <tr
                  key={d.pair}
                  onClick={() => onSelectPair(d.pair)}
                  style={{
                    background: idx % 2 === 0 ? "transparent" : "#0a0a18",
                    borderBottom: "1px solid #13132a",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#181830")}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "#0a0a18")}
                >
                  {/* Pair */}
                  <td style={{ padding: "9px 10px", fontWeight: 700, fontSize: 12, color: "#e2e8f0", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {d.divergence && (
                        <span title={`Divergence ${d.divergence}`} style={{ fontSize: 10 }}>
                          {d.divergence === "BULLISH" ? "↗" : "↘"}
                        </span>
                      )}
                      {d.pair}
                    </div>
                  </td>
                  {/* Long % with bar */}
                  <td style={{ padding: "9px 10px", minWidth: 90 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", fontFamily: "JetBrains Mono, monospace" }}>
                        {d.longPct}%
                      </span>
                      <SentimentBar longPct={d.longPct} height={4} />
                    </div>
                  </td>
                  {/* Short % */}
                  <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#22c55e", fontFamily: "JetBrains Mono, monospace" }}>
                    {d.shortPct}%
                  </td>
                  {/* Δ24h */}
                  <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: d24.color, fontFamily: "JetBrains Mono, monospace" }}>
                    {d24.text}
                  </td>
                  {/* Δ7j */}
                  <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: d7.color, fontFamily: "JetBrains Mono, monospace" }}>
                    {d7.text}
                  </td>
                  {/* Zone */}
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: z.bg, border: `1px solid ${z.border}`, color: z.text,
                      whiteSpace: "nowrap",
                    }}>
                      {z.icon} {z.label}
                    </span>
                  </td>
                  {/* Score ring */}
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ScoreRing score={d.score} />
                      <span style={{ fontSize: 9, color: scoreColor(d.score), fontWeight: 700 }}>
                        {d.scoreDir === "BULLISH" ? "BUY" : d.scoreDir === "BEARISH" ? "SELL" : "NEUT"}
                      </span>
                    </div>
                  </td>
                  {/* Divergence */}
                  <td style={{ padding: "9px 10px" }}>
                    {d.divergence ? (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: d.divergence === "BULLISH" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        border:     `1px solid ${d.divergence === "BULLISH" ? "#22c55e30" : "#ef444430"}`,
                        color:      d.divergence === "BULLISH" ? "#22c55e" : "#ef4444",
                      }}>
                        {d.divergence === "BULLISH" ? "↗ Haussier" : "↘ Baissier"}
                      </span>
                    ) : (
                      <span style={{ color: "#333", fontSize: 11 }}>—</span>
                    )}
                  </td>
                  {/* Contrarian */}
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      background: d.contrarian === "Buy" ? "rgba(34,197,94,0.12)" : d.contrarian === "Sell" ? "rgba(239,68,68,0.12)" : "transparent",
                      border:     `1px solid ${d.contrarian === "Buy" ? "#22c55e30" : d.contrarian === "Sell" ? "#ef444430" : "#1c1c38"}`,
                      color:      d.contrarian === "Buy" ? "#22c55e" : d.contrarian === "Sell" ? "#ef4444" : "#475569",
                    }}>
                      {d.contrarian === "Neutral" ? "—" : `⚡ ${d.contrarian}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Chart view ────────────────────────────────────────────────────────────────

function ChartView({ data }: { data: EnhancedSentiment[] }) {
  const [selectedPair, setSelectedPair] = useState(data[0]?.pair ?? "EUR/USD");
  const row = data.find(d => d.pair === selectedPair) ?? data[0];

  // Merge sentiment history + price history by date
  const chartData = useMemo(() => {
    if (!row) return [];

    // Build a date → { sentiment, price } map
    const byDate: Record<string, { date: string; sentiment?: number; price?: number }> = {};

    for (const p of row.sentimentHistory) {
      const key  = fmtDate(p.ts);
      if (!byDate[key]) byDate[key] = { date: key };
      byDate[key].sentiment = p.longPct;
    }
    for (const p of row.priceHistory) {
      const key  = fmtDate(p.ts);
      if (!byDate[key]) byDate[key] = { date: key };
      byDate[key].price = p.close;
    }

    return Object.values(byDate)
      .filter(d => d.sentiment !== undefined || d.price !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [row]);

  const hasHistory = chartData.length > 1;

  // Identify divergence points for markers
  const divergencePoints = useMemo(() => {
    if (!hasHistory || !row.divergence) return [];
    return chartData.slice(-3).map(d => ({ ...d, div: row.divergence }));
  }, [chartData, hasHistory, row]);

  return (
    <div>
      {/* Pair selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {data.slice(0, 12).map(d => (
          <button key={d.pair} onClick={() => setSelectedPair(d.pair)} style={{
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: selectedPair === d.pair ? scoreBg(d.score) : "transparent",
            border:     `1px solid ${selectedPair === d.pair ? scoreColor(d.score) + "50" : "#1c1c38"}`,
            color:      selectedPair === d.pair ? scoreColor(d.score) : "#475569",
          }}>{d.pair}</button>
        ))}
      </div>

      {row && (
        <>
          {/* Pair header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>{row.pair}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: ZONE_CONFIG[row.zone].bg, border: `1px solid ${ZONE_CONFIG[row.zone].border}`,
                color: ZONE_CONFIG[row.zone].text,
              }}>
                {ZONE_CONFIG[row.zone].icon} {ZONE_CONFIG[row.zone].label}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                background: scoreBg(row.score), color: scoreColor(row.score),
                border: `1px solid ${scoreColor(row.score)}30`,
              }}>
                Score {row.score}/100
              </span>
              {row.divergence && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                  background: row.divergence === "BULLISH" ? "rgba(168,85,247,0.12)" : "rgba(168,85,247,0.12)",
                  border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7",
                }}>
                  ⚡ Divergence {row.divergence}
                </span>
              )}
            </div>
          </div>

          {/* Current stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 18 }}>
            {[
              { label: "Long %",  value: `${row.longPct}%`,         color: "#ef4444" },
              { label: "Short %", value: `${row.shortPct}%`,        color: "#22c55e" },
              { label: "Δ24h",    value: fmtDelta(row.d24h).text,   color: fmtDelta(row.d24h).color },
              { label: "Δ7j",     value: fmtDelta(row.d7d).text,    color: fmtDelta(row.d7d).color  },
              { label: "Prix",    value: row.price ? row.price.toFixed(row.price > 10 ? 2 : 4) : "—", color: "#94a3b8" },
              { label: "Δ Prix",  value: row.priceChange24h ? `${row.priceChange24h > 0 ? "+" : ""}${fmt(row.priceChange24h)}%` : "—",
                color: row.priceChange24h && row.priceChange24h > 0 ? "#22c55e" : "#ef4444" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Dual-axis chart */}
          {!hasHistory ? (
            <div style={{
              background: "#0d0d1a", border: "1px dashed #1c1c38", borderRadius: 10,
              padding: "40px 20px", textAlign: "center",
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Historique en cours de construction</div>
              <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
                Les données s'accumulent à chaque visite. Revenez dans quelques heures.
              </div>
            </div>
          ) : (
            <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "16px 8px" }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, paddingLeft: 8 }}>
                Sentiment Long % <span style={{ color: "#ef4444" }}>■</span> vs Prix <span style={{ color: "#3b82f6" }}>■</span>
                {divergencePoints.length > 0 && (
                  <span style={{ marginLeft: 12, color: "#a855f7" }}>⚡ divergence détectée</span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 50, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c38" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#475569" }}
                    tickLine={false} axisLine={{ stroke: "#1c1c38" }}
                    interval="preserveStartEnd"
                  />
                  {/* Left axis: Sentiment */}
                  <YAxis
                    yAxisId="sent"
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: "#ef4444" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => `${v}%`}
                    width={32}
                  />
                  {/* Right axis: Price */}
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    tick={{ fontSize: 9, fill: "#3b82f6" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => row.price && row.price > 10 ? v.toFixed(2) : v.toFixed(4)}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
                    formatter={(val: number, name: string) => [
                      name === "sentiment" ? `${val}%` : val.toFixed(row.price && row.price > 10 ? 2 : 4),
                      name === "sentiment" ? "Long %" : "Prix",
                    ]}
                  />
                  <Legend
                    formatter={v => v === "sentiment" ? "Long %" : "Prix"}
                    wrapperStyle={{ fontSize: 10, color: "#94a3b8" }}
                  />
                  {/* Extreme zone bands */}
                  <ReferenceLine yAxisId="sent" y={70} stroke="#ef444420" strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="sent" y={30} stroke="#22c55e20" strokeDasharray="4 4" />
                  {/* Sentiment area */}
                  <Area
                    yAxisId="sent" type="monotone" dataKey="sentiment"
                    stroke="#ef4444" strokeWidth={2} fill="rgba(239,68,68,0.04)"
                    dot={false} name="sentiment" connectNulls
                  />
                  {/* Price line */}
                  <Line
                    yAxisId="price" type="monotone" dataKey="price"
                    stroke="#3b82f6" strokeWidth={2} dot={false}
                    name="price" connectNulls strokeDasharray="5 3"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 16, paddingLeft: 8, marginTop: 8 }}>
                <span style={{ fontSize: 9, color: "#475569" }}>
                  <span style={{ color: "#ef444440" }}>——</span> Zone extrême Long (70%+) — signal SELL
                </span>
                <span style={{ fontSize: 9, color: "#475569" }}>
                  <span style={{ color: "#22c55e40" }}>——</span> Zone extrême Short (30%-) — signal BUY
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Timeline view ─────────────────────────────────────────────────────────────

function TimelineView({ data }: { data: EnhancedSentiment[] }) {
  const [group, setGroup] = useState<Group>("Tous");

  const filtered = data.filter(d => group === "Tous" || getGroup(d.pair) === group);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(["Tous", "Majors", "Crosses", "Commodities"] as Group[]).map(g => (
          <button key={g} onClick={() => setGroup(g)} style={{
            fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
            background: group === g ? "rgba(212,175,55,0.12)" : "transparent",
            border:     `1px solid ${group === g ? "rgba(212,175,55,0.35)" : "#1c1c38"}`,
            color:      group === g ? "#f0c84a" : "#475569",
          }}>{g}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(d => {
          const z    = ZONE_CONFIG[d.zone];
          const d24  = fmtDelta(d.d24h);
          const d7   = fmtDelta(d.d7d);

          return (
            <div key={d.pair} style={{
              background: z.bg, border: `1px solid ${z.border}`,
              borderRadius: 9, padding: "10px 14px",
              display: "grid",
              gridTemplateColumns: "80px 1fr auto",
              gap: 12, alignItems: "center",
            }}>
              {/* Pair + signal */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>{d.pair}</div>
                <div style={{ fontSize: 9, color: z.text, fontWeight: 700, marginTop: 2 }}>
                  {z.icon} {z.label}
                </div>
              </div>

              {/* Sentiment bar + deltas */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 9, color: "#94a3b8" }}>
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>Long {d.longPct}%</span>
                  <span>
                    <span style={{ color: d24.color }}>Δ24h {d24.text}</span>
                    {" · "}
                    <span style={{ color: d7.color }}>Δ7j {d7.text}</span>
                  </span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>Short {d.shortPct}%</span>
                </div>
                <SentimentBar longPct={d.longPct} height={7} />
                {/* Inline mini history (last 10 snapshots) */}
                {d.sentimentHistory.length > 1 && (
                  <div style={{ display: "flex", gap: 2, marginTop: 5, alignItems: "flex-end", height: 16 }}>
                    {d.sentimentHistory.slice(-14).map((p, i) => {
                      const ht = Math.max(2, Math.round((p.longPct / 100) * 16));
                      return (
                        <div key={i} title={`${fmtDate(p.ts)} ${fmtTime(p.ts)}: Long ${p.longPct}%`} style={{
                          flex: 1, height: ht,
                          background: p.longPct >= 70 ? "#ef444480" : p.longPct <= 30 ? "#22c55e80" : "#3b82f640",
                          borderRadius: 2, alignSelf: "flex-end",
                        }} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Score + divergence */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <ScoreRing score={d.score} />
                {d.divergence && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                    background: d.divergence === "BULLISH" ? "rgba(168,85,247,0.15)" : "rgba(168,85,247,0.15)",
                    color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)",
                  }}>
                    ⚡ {d.divergence === "BULLISH" ? "↗" : "↘"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RetailSentimentPro() {
  const [data, setData]         = useState<EnhancedSentiment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tab, setTab]           = useState<TabId>("heatmap");
  const [chartPair, setChartPair] = useState<string>("");

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/retail-sentiment-pro")
      .then(r => r.json())
      .then(res => {
        if (res.error && res.data?.length === 0) setError(res.error);
        else {
          setData(res.data ?? []);
          setUpdatedAt(res.updatedAt);
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // When navigating to chart tab, pre-select the pair
  function goToChart(pair: string) {
    setChartPair(pair);
    setTab("chart");
  }

  const dataForChart = useMemo(() => {
    if (!chartPair) return data;
    return [data.find(d => d.pair === chartPair), ...data.filter(d => d.pair !== chartPair)]
      .filter((d): d is EnhancedSentiment => d !== undefined);
  }, [data, chartPair]);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 14, padding: 22 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
              background: "rgba(212,175,55,0.10)", color: "#f0c84a",
              border: "1px solid rgba(212,175,55,0.25)", padding: "2px 8px", borderRadius: 999,
            }}>Retail Sentiment Pro</span>
            <span style={{ fontSize: 10, color: "#333", background: "#0d0d1a", border: "1px solid #1c1c38", padding: "2px 8px", borderRadius: 999 }}>
              MyFXBook · G8
            </span>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
            Analyse Contrarienne du Sentiment Retail
          </h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
            Zones extrêmes · Deltas · Score composite · Divergences prix/sentiment
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {updatedAt && (
            <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
              {fmtTime(updatedAt)}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
              background: loading ? "transparent" : "rgba(212,175,55,0.10)",
              border: "1px solid rgba(212,175,55,0.25)", color: loading ? "#334155" : "#f0c84a",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <span style={{ display: "inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
            {loading ? "Chargement…" : "Actualiser"}
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #1c1c38", paddingBottom: 0 }}>
        {([
          { id: "heatmap",  label: "⬛ Heatmap G8" },
          { id: "chart",    label: "📈 Sentiment vs Prix" },
          { id: "timeline", label: "📋 Timeline" },
        ] as { id: TabId; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              fontSize: 11, fontWeight: 700, padding: "7px 14px",
              background: "transparent", cursor: "pointer",
              border: "none", borderBottom: tab === id ? "2px solid #f0c84a" : "2px solid transparent",
              color: tab === id ? "#f0c84a" : "#475569",
              marginBottom: -1, transition: "color 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44, borderRadius: 8 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Source indisponible</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>{error}</div>
          <button onClick={load} style={{
            marginTop: 14, fontSize: 11, fontWeight: 700, padding: "6px 16px",
            background: "rgba(212,175,55,0.10)", border: "1px solid rgba(212,175,55,0.25)",
            color: "#f0c84a", borderRadius: 8, cursor: "pointer",
          }}>Réessayer</button>
        </div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 13 }}>
          Aucune donnée disponible
        </div>
      ) : (
        <>
          {tab === "heatmap"  && <HeatmapView  data={data}          onSelectPair={goToChart} />}
          {tab === "chart"    && <ChartView     data={dataForChart} />}
          {tab === "timeline" && <TimelineView  data={data}         />}
        </>
      )}

      {/* Legend */}
      {!loading && data.length > 0 && (
        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: "1px solid #1c1c38",
          display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, color: "#334155" }}>
            <span style={{ color: "#22c55e" }}>Score ≥70</span> = Retail fortement Short → Contrarian <strong style={{ color: "#22c55e" }}>BUY</strong>
          </span>
          <span style={{ fontSize: 10, color: "#334155" }}>
            <span style={{ color: "#ef4444" }}>Score ≤30</span> = Retail fortement Long → Contrarian <strong style={{ color: "#ef4444" }}>SELL</strong>
          </span>
          <span style={{ fontSize: 10, color: "#334155" }}>
            <span style={{ color: "#a855f7" }}>↗↘ Divergence</span> = Prix vs sentiment divergent
          </span>
          <span style={{ fontSize: 10, color: "#1e293b" }}>
            Clic sur une ligne = voir le graphique
          </span>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
