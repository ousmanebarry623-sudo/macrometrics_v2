"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { REGIME_CONFIG, INDICATOR_META, RegimeType } from "@/lib/market-regime";
import type { MarketRegimeResponse } from "@/app/api/market-regime/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null, dec = 2): string {
  if (n === null || isNaN(n)) return "—";
  return n.toFixed(dec);
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function scoreColor(s: number): string {
  if (s >= 70) return "#22c55e";
  if (s >= 60) return "#86efac";
  if (s >= 45) return "#94a3b8";
  if (s >= 35) return "#fdba74";
  return "#ef4444";
}

function scoreBg(s: number): string {
  if (s >= 60) return "rgba(34,197,94,0.12)";
  if (s >= 45) return "rgba(148,163,184,0.08)";
  return "rgba(239,68,68,0.10)";
}

type TabId = "regime" | "detail" | "history";

// ── SVG Gauge (Speedometer) ───────────────────────────────────────────────────

function GaugeChart({ score, regime }: { score: number; regime: RegimeType }) {
  const cx = 200, cy = 175, outerR = 145, innerR = 95;
  const cfg = REGIME_CONFIG[regime];

  // Annular arc from startDeg → endDeg (degrees, math convention, CCW = higher angle)
  // In SVG: y-axis is flipped, so we use cy - r*sin
  function annularPath(startDeg: number, endDeg: number, fill: string, opacity = 0.8) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const cos = (d: number) => Math.cos(toRad(d));
    const sin = (d: number) => Math.sin(toRad(d));
    const large = startDeg - endDeg >= 180 ? 1 : 0;
    const os = { x: cx + outerR * cos(startDeg), y: cy - outerR * sin(startDeg) };
    const oe = { x: cx + outerR * cos(endDeg),   y: cy - outerR * sin(endDeg)   };
    const ie = { x: cx + innerR * cos(endDeg),   y: cy - innerR * sin(endDeg)   };
    const is_ = { x: cx + innerR * cos(startDeg), y: cy - innerR * sin(startDeg) };
    return (
      <path
        key={startDeg}
        d={`M${os.x} ${os.y} A${outerR} ${outerR} 0 ${large} 0 ${oe.x} ${oe.y} L${ie.x} ${ie.y} A${innerR} ${innerR} 0 ${large} 1 ${is_.x} ${is_.y}Z`}
        fill={fill} opacity={opacity}
      />
    );
  }

  // Gauge segments: score 0→100 maps to 180°→0° (left to right)
  const segments = [
    { from: 180, to: 135, fill: "#ef4444" },  // RISK_OFF   0–25
    { from: 135, to: 99,  fill: "#f97316" },  // TRANSITION 25–45
    { from: 99,  to: 72,  fill: "#3b82f6" },  // MIXED      45–60
    { from: 72,  to: 0,   fill: "#22c55e" },  // RISK_ON    60–100
  ];

  // Needle: score 0→100 maps to 180°→0°
  const needleDeg = 180 - (score / 100) * 180;
  const needleRad = (needleDeg * Math.PI) / 180;
  const needleLen = 125;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy - needleLen * Math.sin(needleRad);

  // Gap lines between segments
  const gapAngles = [135, 99, 72];

  return (
    <svg width={400} height={210} viewBox="0 0 400 210" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background ring */}
      {annularPath(0, 180, "#1c1c38", 1)}

      {/* Colored segments */}
      {segments.map(s => annularPath(s.from, s.to, s.fill, 0.75))}

      {/* Segment gap lines */}
      {gapAngles.map(deg => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={cx + (innerR - 2) * Math.cos(rad)} y1={cy - (innerR - 2) * Math.sin(rad)}
            x2={cx + (outerR + 2) * Math.cos(rad)} y2={cy - (outerR + 2) * Math.sin(rad)}
            stroke="#060610" strokeWidth={3}
          />
        );
      })}

      {/* Needle shadow */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#00000080" strokeWidth={5} strokeLinecap="round" />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#f1f5f9" strokeWidth={3} strokeLinecap="round"
        filter="url(#glow)" />
      {/* Needle hub */}
      <circle cx={cx} cy={cy} r={11} fill="#10101e" stroke="#f1f5f9" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={5}  fill={cfg.color} />

      {/* Score */}
      <text x={cx} y={cy - 22} textAnchor="middle" fontSize={42} fontWeight={800}
        fill={cfg.color} fontFamily="JetBrains Mono, monospace">{score}</text>
      <text x={cx} y={cy - 3}  textAnchor="middle" fontSize={13} fontWeight={700}
        fill={cfg.color} fontFamily="Inter, sans-serif">{cfg.emoji} {cfg.label}</text>

      {/* Zone labels */}
      <text x={14}  y={182} textAnchor="middle" fontSize={9} fill="#ef4444" fontWeight={700}>Risk-Off</text>
      <text x={386} y={182} textAnchor="middle" fontSize={9} fill="#22c55e" fontWeight={700}>Risk-On</text>
      <text x={200} y={200} textAnchor="middle" fontSize={9} fill="#94a3b8">0          25        45      60        100</text>
    </svg>
  );
}

// ── Score ring (mini) ─────────────────────────────────────────────────────────

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r    = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const c    = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1c1c38" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={c} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle"
        fontSize={size < 40 ? 9 : 11} fontWeight={800} fill={c}
        fontFamily="JetBrains Mono, monospace">{score}</text>
    </svg>
  );
}

// ── Tab: Régime (Gauge + sub-scores + divergences) ────────────────────────────

function RegimeTab({ data }: { data: MarketRegimeResponse }) {
  const { snapshot } = data;
  const cfg = REGIME_CONFIG[snapshot.regime];

  const subScores = [
    { key: "vix",     label: "VIX",         score: snapshot.vixScore,     weight: 30 },
    { key: "equity",  label: "S&P 500",      score: snapshot.equityScore,  weight: 25 },
    { key: "usd",     label: "DXY",          score: snapshot.usdScore,     weight: 20 },
    { key: "options", label: "CBOE SKEW",    score: snapshot.optionsScore, weight: 15 },
    { key: "news",    label: "Fear & Greed", score: snapshot.newsScore,    weight: 10 },
  ];

  return (
    <div>
      {/* Gauge */}
      <div style={{ background: "#0d0d1a", border: `1px solid ${cfg.border}`, borderRadius: 12, padding: "20px 12px 10px", marginBottom: 16 }}>
        <GaugeChart score={snapshot.composite} regime={snapshot.regime} />

        {/* Regime label + description */}
        <div style={{ textAlign: "center", marginTop: 8, padding: "0 16px" }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 999,
            background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
          }}>Confiance : {snapshot.confidence}%</span>
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 8, lineHeight: 1.5 }}>
            {cfg.description}
          </p>
          <p style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
            {cfg.favorites}
          </p>
        </div>
      </div>

      {/* Sub-scores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        {subScores.map(({ key, label, score, weight }) => {
          const meta = INDICATOR_META[key];
          return (
            <div key={key} style={{
              background: scoreBg(score), border: `1px solid ${scoreColor(score)}20`,
              borderRadius: 10, padding: "12px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <ScoreRing score={score} size={48} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#e2e8f0" }}>{label}</div>
                <div style={{ fontSize: 9, color: "#475569" }}>Poids {weight}%</div>
              </div>
              {meta && (
                <div style={{ fontSize: 8, color: "#334155", textAlign: "center", lineHeight: 1.4 }}>
                  {meta.interpretation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Divergences */}
      {snapshot.divergences.length > 0 && (
        <div style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#a855f7", marginBottom: 8 }}>
            ⚡ Divergences détectées ({snapshot.divergences.length})
          </div>
          {snapshot.divergences.map((d, i) => (
            <div key={i} style={{ fontSize: 11, color: "#94a3b8", padding: "3px 0", borderBottom: i < snapshot.divergences.length - 1 ? "1px solid #1c1c38" : "none" }}>
              · {d}
            </div>
          ))}
        </div>
      )}

      {/* Raw indicator values */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6 }}>
        {[
          { label: "VIX",        val: fmt(data.indicators.vix, 2),          sub: "Volatilité" },
          { label: "S&P500",     val: fmtPct(data.indicators.sp500Change1w), sub: "Retour 1S" },
          { label: "DXY",        val: fmtPct(data.indicators.dxyChange1w),   sub: "Retour 1S" },
          { label: "SKEW",       val: fmt(data.indicators.skew, 1),          sub: "Options" },
          { label: "Fear&Greed", val: fmt(data.indicators.fearGreed, 0),     sub: "0–100" },
          { label: "Or",         val: fmt(data.indicators.gold, 0),          sub: "USD/oz" },
          { label: "US10Y",      val: fmt(data.indicators.us10y, 2) + "%",   sub: "Taux 10A" },
        ].map(({ label, val, sub }) => (
          <div key={label} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "7px 8px" }}>
            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", marginTop: 1 }}>{val}</div>
            <div style={{ fontSize: 9, color: "#334155" }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Détail (Heatmap + Radar) ─────────────────────────────────────────────

function DetailTab({ data }: { data: MarketRegimeResponse }) {
  const { snapshot } = data;

  const rows = [
    { key: "vix",     label: "VIX",         score: snapshot.vixScore,     raw: fmt(data.indicators.vix, 2), direction: snapshot.vixScore >= 60 ? "Risk-On" : snapshot.vixScore <= 40 ? "Risk-Off" : "Neutre" },
    { key: "equity",  label: "S&P500 1S",   score: snapshot.equityScore,  raw: fmtPct(data.indicators.sp500Change1w), direction: snapshot.equityScore >= 60 ? "Risk-On" : snapshot.equityScore <= 40 ? "Risk-Off" : "Neutre" },
    { key: "usd",     label: "DXY 1S",      score: snapshot.usdScore,     raw: fmtPct(data.indicators.dxyChange1w), direction: snapshot.usdScore >= 60 ? "Risk-On" : snapshot.usdScore <= 40 ? "Risk-Off" : "Neutre" },
    { key: "options", label: "CBOE SKEW",   score: snapshot.optionsScore, raw: fmt(data.indicators.skew, 1), direction: snapshot.optionsScore >= 60 ? "Risk-On" : snapshot.optionsScore <= 40 ? "Risk-Off" : "Neutre" },
    { key: "news",    label: "Fear & Greed", score: snapshot.newsScore,   raw: fmt(data.indicators.fearGreed, 0), direction: snapshot.newsScore >= 60 ? "Risk-On" : snapshot.newsScore <= 40 ? "Risk-Off" : "Neutre" },
  ];

  const radarData = [
    { subject: "VIX",         score: snapshot.vixScore     },
    { subject: "Equités",     score: snapshot.equityScore  },
    { subject: "USD",         score: snapshot.usdScore     },
    { subject: "Options",     score: snapshot.optionsScore },
    { subject: "Sentiment",   score: snapshot.newsScore    },
  ];

  return (
    <div>
      {/* Heatmap table */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1c1c38", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#0d0d1a" }}>
            <tr>
              {["Indicateur", "Valeur brute", "Score", "Signal", "Interprétation", "Poids"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1c1c38" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const meta = INDICATOR_META[r.key];
              const dirColor = r.direction === "Risk-On" ? "#22c55e" : r.direction === "Risk-Off" ? "#ef4444" : "#94a3b8";
              return (
                <tr key={r.key} style={{ background: i % 2 === 0 ? "transparent" : "#0a0a18", borderBottom: "1px solid #13132a" }}>
                  <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{r.label}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace" }}>{r.raw}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#1c1c38", borderRadius: 999, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ width: `${r.score}%`, height: "100%", background: scoreColor(r.score), transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor(r.score), fontFamily: "JetBrains Mono, monospace", width: 28 }}>{r.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      color: dirColor, background: `${dirColor}15`, border: `1px solid ${dirColor}30`,
                    }}>{r.direction}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 10, color: "#475569", maxWidth: 200 }}>
                    {meta?.interpretation}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#f0c84a", fontFamily: "JetBrains Mono, monospace" }}>
                    {meta?.weight}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Radar chart */}
      <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Radar des sous-scores
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart cx="50%" cy="50%" outerRadius={90} data={radarData}>
            <PolarGrid stroke="#1c1c38" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Score Risk-On"
              dataKey="score"
              stroke="#f0c84a"
              fill="rgba(240,200,74,0.15)"
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, fontSize: 11 }}
              formatter={(val) => [`${val}/100`, "Score Risk-On"]}
            />
          </RadarChart>
        </ResponsiveContainer>
        <div style={{ textAlign: "center", fontSize: 9, color: "#334155", marginTop: 4 }}>
          Score 0–100 · Vers l'extérieur = Risk-On · Vers le centre = Risk-Off
        </div>
      </div>
    </div>
  );
}

// ── Tab: Historique (Timeline) ────────────────────────────────────────────────

type ChartPoint = {
  ts: number; composite: number; regime: string;
  vixScore: number; equityScore: number; usdScore: number;
  optionsScore: number; newsScore: number;
};

const REGIME_COLORS: Record<string, string> = {
  RISK_ON:    "#22c55e",
  MIXED:      "#3b82f6",
  TRANSITION: "#f97316",
  RISK_OFF:   "#ef4444",
};

function HistoryTab({ history }: { history: ChartPoint[] }) {
  const [showSub, setShowSub] = useState(false);

  const chartData = useMemo(() => history.map(p => ({
    date: fmtDate(p.ts),
    time: fmtTime(p.ts),
    composite:    p.composite,
    vixScore:     p.vixScore,
    equityScore:  p.equityScore,
    usdScore:     p.usdScore,
    optionsScore: p.optionsScore,
    newsScore:    p.newsScore,
    fill: REGIME_COLORS[p.regime] ?? "#94a3b8",
  })), [history]);

  if (chartData.length < 2) {
    return (
      <div style={{ background: "#0d0d1a", border: "1px dashed #1c1c38", borderRadius: 10, padding: "50px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Historique en cours de construction</div>
        <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
          Les données s'accumulent à chaque visite (toutes les 30 min). Revenez plus tard.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#475569" }}>
          {chartData.length} snapshots · {fmtDate(history[0].ts)} → {fmtDate(history[history.length - 1].ts)}
        </div>
        <button onClick={() => setShowSub(v => !v)} style={{
          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
          background: showSub ? "rgba(240,200,74,0.12)" : "transparent",
          border: `1px solid ${showSub ? "rgba(240,200,74,0.35)" : "#1c1c38"}`,
          color: showSub ? "#f0c84a" : "#475569",
        }}>
          {showSub ? "Vue simplifiée" : "Afficher sous-scores"}
        </button>
      </div>

      {/* Composite score timeline */}
      <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "16px 8px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8, paddingLeft: 8 }}>
          Score composite Risk-On (0–100) avec zones de régime
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c1c38" vertical={false} />
            {/* Regime background bands */}
            <ReferenceArea y1={0}  y2={25} fill="rgba(239,68,68,0.05)"  yAxisId="score" />
            <ReferenceArea y1={25} y2={45} fill="rgba(249,115,22,0.05)" yAxisId="score" />
            <ReferenceArea y1={45} y2={60} fill="rgba(59,130,246,0.04)" yAxisId="score" />
            <ReferenceArea y1={60} y2={100} fill="rgba(34,197,94,0.05)" yAxisId="score" />
            {/* Threshold lines */}
            <ReferenceLine yAxisId="score" y={60} stroke="#22c55e20" strokeDasharray="4 4" />
            <ReferenceLine yAxisId="score" y={45} stroke="#3b82f620" strokeDasharray="4 4" />
            <ReferenceLine yAxisId="score" y={25} stroke="#f9731620" strokeDasharray="4 4" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#1c1c38" }} interval="preserveStartEnd" />
            <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
              formatter={(val, name) => [`${val}`, name === "composite" ? "Score composite" : String(name)]}
            />
            <Area yAxisId="score" type="monotone" dataKey="composite"
              stroke="#f0c84a" strokeWidth={2.5} fill="rgba(240,200,74,0.06)"
              dot={false} name="composite" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        {/* Zone legend */}
        <div style={{ display: "flex", gap: 16, paddingLeft: 8, marginTop: 8, flexWrap: "wrap" }}>
          {[
            { label: "Risk-Off (0–25)", color: "#ef4444" },
            { label: "Transition (25–45)", color: "#f97316" },
            { label: "Mixed (45–60)", color: "#3b82f6" },
            { label: "Risk-On (60+)", color: "#22c55e" },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontSize: 9, color: "#475569" }}>
              <span style={{ color }}>■</span> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Sub-scores timeline (optional) */}
      {showSub && (
        <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "16px 8px" }}>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 8, paddingLeft: 8 }}>
            Évolution des sous-scores
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c1c38" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={{ stroke: "#1c1c38" }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, fontSize: 10 }}
                labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
              <Line type="monotone" dataKey="vixScore"     stroke="#ef4444" strokeWidth={1.5} dot={false} name="VIX"     connectNulls />
              <Line type="monotone" dataKey="equityScore"  stroke="#22c55e" strokeWidth={1.5} dot={false} name="Equités" connectNulls />
              <Line type="monotone" dataKey="usdScore"     stroke="#f97316" strokeWidth={1.5} dot={false} name="USD"     connectNulls />
              <Line type="monotone" dataKey="optionsScore" stroke="#a855f7" strokeWidth={1.5} dot={false} name="Options" connectNulls />
              <Line type="monotone" dataKey="newsScore"    stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Sentiment" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarketRegimeDetector() {
  const [data, setData]           = useState<MarketRegimeResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<TabId>("regime");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/market-regime")
      .then(r => r.json())
      .then((res: MarketRegimeResponse) => {
        if (res.error && !res.snapshot) { setError(res.error); return; }
        setData(res);
        setUpdatedAt(res.updatedAt);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const regime = data?.snapshot?.regime ?? "MIXED";
  const cfg    = REGIME_CONFIG[regime];

  return (
    <div style={{ background: "#10101e", border: `1px solid ${data ? cfg.border : "#1c1c38"}`, borderRadius: 14, padding: 22, transition: "border-color 0.5s" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
              background: "rgba(168,85,247,0.10)", color: "#a855f7",
              border: "1px solid rgba(168,85,247,0.25)", padding: "2px 8px", borderRadius: 999,
            }}>Market Regime Detector</span>
            {data && (
              <span style={{
                fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 999,
                background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
              }}>
                {cfg.emoji} {cfg.label}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
            Détecteur de Régime de Marché
          </h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
            VIX · S&P500 · DXY · CBOE SKEW · Fear&Greed · Or · US10Y
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {updatedAt && (
            <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
              {fmtTime(updatedAt)}
            </span>
          )}
          <button onClick={load} disabled={loading} style={{
            fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
            background: loading ? "transparent" : "rgba(168,85,247,0.10)",
            border: "1px solid rgba(168,85,247,0.25)", color: loading ? "#334155" : "#a855f7",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ display: "inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
            {loading ? "Chargement…" : "Actualiser"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #1c1c38" }}>
        {([
          { id: "regime",  label: "🎯 Régime" },
          { id: "detail",  label: "🔬 Détail" },
          { id: "history", label: "📈 Historique" },
        ] as { id: TabId; label: string }[]).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            fontSize: 11, fontWeight: 700, padding: "7px 14px",
            background: "transparent", cursor: "pointer",
            border: "none", borderBottom: tab === id ? "2px solid #a855f7" : "2px solid transparent",
            color: tab === id ? "#a855f7" : "#475569", marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="skeleton" style={{ height: 210, borderRadius: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 10 }} />)}
          </div>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Données indisponibles</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>{error}</div>
          <button onClick={load} style={{
            marginTop: 14, fontSize: 11, fontWeight: 700, padding: "6px 16px",
            background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.25)",
            color: "#a855f7", borderRadius: 8, cursor: "pointer",
          }}>Réessayer</button>
        </div>
      ) : data ? (
        <>
          {tab === "regime"  && <RegimeTab  data={data} />}
          {tab === "detail"  && <DetailTab  data={data} />}
          {tab === "history" && <HistoryTab history={data.history as ChartPoint[]} />}
        </>
      ) : null}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
