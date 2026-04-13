"use client";
import { useEffect, useState, useCallback } from "react";
import type { CountryMacro, CentralBank, FXMacroScore } from "@/lib/trading-economics";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MacroData {
  countries:    CountryMacro[];
  centralBanks: CentralBank[];
  fxScores:     FXMacroScore[];
  source:       "live" | "fallback";
  updatedAt:    string;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const TREND_CFG = {
  strong:   { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   label: "Fort" },
  moderate: { color: "#f0c84a", bg: "rgba(240,200,74,0.08)",  label: "Modéré" },
  weak:     { color: "#f97316", bg: "rgba(249,115,22,0.08)",  label: "Faible" },
  risk:     { color: "#ef4444", bg: "rgba(239,68,68,0.08)",   label: "Risque" },
};

const SCORE_COLOR = (s: number) =>
  s >= 65 ? "#22c55e" : s >= 45 ? "#f0c84a" : "#ef4444";

const fmtNum = (v: number | null, suffix = "", dec = 1) =>
  v === null ? "—" : `${v >= 0 ? "" : ""}${v.toFixed(dec)}${suffix}`;

const BIAS_CFG = {
  Bullish: { color: "#22c55e", arrow: "↑" },
  Bearish: { color: "#ef4444", arrow: "↓" },
  Neutral: { color: "#94a3b8", arrow: "—" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{subtitle}</p>}
      </div>
      {badge && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(240,200,74,0.08)", border: "1px solid rgba(240,200,74,0.2)", color: "#f0c84a" }}>{badge}</span>}
    </div>
  );
}

// Macro Heatmap
function MacroHeatmap({ countries }: { countries: CountryMacro[] }) {
  const indicators: { key: keyof CountryMacro; label: string; suffix: string; invert?: boolean }[] = [
    { key: "rate",         label: "Taux",       suffix: "%" },
    { key: "inflation",    label: "Inflation",  suffix: "%", invert: true },
    { key: "unemployment", label: "Chômage",    suffix: "%", invert: true },
    { key: "gdpGrowth",    label: "PIB",        suffix: "%" },
    { key: "tradeBalance", label: "Balance",    suffix: "B" },
    { key: "score",        label: "Score",      suffix: "" },
  ];

  // Normalize for heatmap coloring
  function cellColor(key: keyof CountryMacro, val: number | null, invert?: boolean): string {
    if (val === null) return "rgba(255,255,255,0.03)";
    const vals = countries.map(c => c[key] as number | null).filter((v): v is number => v !== null);
    if (!vals.length) return "rgba(255,255,255,0.03)";
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const norm = max === min ? 0.5 : (val - min) / (max - min);
    const v = invert ? 1 - norm : norm;
    if (v >= 0.7) return "rgba(34,197,94,0.25)";
    if (v >= 0.5) return "rgba(34,197,94,0.12)";
    if (v >= 0.35) return "rgba(240,200,74,0.12)";
    if (v >= 0.2) return "rgba(249,115,22,0.15)";
    return "rgba(239,68,68,0.20)";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ padding: "8px 10px", textAlign: "left", color: "#334155", fontSize: 9, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #1c1c38", whiteSpace: "nowrap" }}>Pays</th>
            {indicators.map(i => (
              <th key={i.key} style={{ padding: "8px 8px", textAlign: "center", color: "#334155", fontSize: 9, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #1c1c38", minWidth: 66, whiteSpace: "nowrap" }}>{i.label}</th>
            ))}
            <th style={{ padding: "8px 8px", textAlign: "center", color: "#334155", fontSize: 9, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #1c1c38" }}>Tendance</th>
          </tr>
        </thead>
        <tbody>
          {countries.map(c => {
            const cfg = TREND_CFG[c.trend];
            return (
              <tr key={c.code} style={{ borderBottom: "1px solid #1c1c3830" }}>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 16 }}>{c.flag}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9" }}>{c.code === "EU" ? "Eurozone" : c.country.split(" ")[0]}</div>
                      <div style={{ fontSize: 9, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>{c.currency}</div>
                    </div>
                  </div>
                </td>
                {indicators.map(ind => {
                  const val = c[ind.key] as number | null;
                  return (
                    <td key={ind.key} style={{ padding: "9px 6px", textAlign: "center", background: cellColor(ind.key, val, ind.invert), fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 11, color: ind.key === "score" ? SCORE_COLOR(val ?? 50) : "#f1f5f9" }}>
                      {fmtNum(val, ind.suffix)}
                    </td>
                  );
                })}
                <td style={{ padding: "9px 8px", textAlign: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 8px", borderRadius: 999, border: `1px solid ${cfg.color}30` }}>{cfg.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Central Bank Monitor
function CentralBankGrid({ banks }: { banks: CentralBank[] }) {
  const BIAS_BANK = {
    hawkish: { color: "#22c55e", label: "Hawkish 🦅", bg: "rgba(34,197,94,0.06)" },
    neutral: { color: "#f0c84a", label: "Neutre ⚖️",  bg: "rgba(240,200,74,0.06)" },
    dovish:  { color: "#ef4444", label: "Dovish 🕊️",  bg: "rgba(239,68,68,0.06)" },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 10 }}>
      {banks.map(b => {
        const bc = BIAS_BANK[b.bias];
        return (
          <div key={b.name} style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "14px 16px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{b.flag}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>{b.country}</div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: bc.color, background: bc.bg, padding: "3px 9px", borderRadius: 999, border: `1px solid ${bc.color}30` }}>{bc.label}</span>
            </div>

            {/* Rate */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Taux actuel</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#f0c84a", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{b.currentRate.toFixed(2)}%</div>
              </div>
              {b.forecast !== null && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Prévision</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: b.forecast < b.currentRate ? "#ef4444" : b.forecast > b.currentRate ? "#22c55e" : "#94a3b8", fontFamily: "JetBrains Mono, monospace" }}>
                    {b.forecast > b.currentRate ? "▲" : b.forecast < b.currentRate ? "▼" : "—"} {b.forecast.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {/* Probability bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Probabilité prochaine décision</div>
              <div style={{ height: 6, borderRadius: 999, overflow: "hidden", display: "flex", gap: 1 }}>
                <div style={{ width: `${b.probability.hike}%`, background: "#22c55e", borderRadius: "999px 0 0 999px", flexShrink: 0 }} />
                <div style={{ width: `${b.probability.hold}%`, background: "#f0c84a", flexShrink: 0 }} />
                <div style={{ flex: 1, background: "#ef4444", borderRadius: "0 999px 999px 0" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
                <span style={{ color: "#22c55e" }}>↑ {b.probability.hike}%</span>
                <span style={{ color: "#f0c84a" }}>— {b.probability.hold}%</span>
                <span style={{ color: "#ef4444" }}>↓ {b.probability.cut}%</span>
              </div>
            </div>

            {/* Next meeting */}
            <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 10 }}>
              <span style={{ color: "#334155" }}>Prochaine réunion</span>
              <span style={{ color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
                {new Date(b.nextMeeting).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// FX Macro Score Table
function FXMacroTable({ scores }: { scores: FXMacroScore[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {scores.map(s => {
        const bc = BIAS_CFG[s.bias];
        const isOpen = expanded === s.pair;
        return (
          <div key={s.pair} style={{ background: "#0d0d1a", border: `1px solid ${s.bias !== "Neutral" ? bc.color + "25" : "#1c1c38"}`, borderRadius: 8 }}>
            {/* Row */}
            <button onClick={() => setExpanded(isOpen ? null : s.pair)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", minWidth: 80, textAlign: "left" }}>{s.pair}</span>

              {/* Base score */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <span style={{ fontSize: 10, color: "#475569" }}>{s.baseCode}</span>
                <div style={{ flex: 1, height: 4, background: "#1c1c38", borderRadius: 999, overflow: "hidden", maxWidth: 80 }}>
                  <div style={{ height: "100%", width: `${s.baseScore}%`, background: SCORE_COLOR(s.baseScore), borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: SCORE_COLOR(s.baseScore), fontFamily: "JetBrains Mono, monospace", minWidth: 24 }}>{s.baseScore}</span>
              </div>

              <span style={{ color: "#334155", fontSize: 11 }}>vs</span>

              {/* Quote score */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: SCORE_COLOR(s.quoteScore), fontFamily: "JetBrains Mono, monospace", minWidth: 24 }}>{s.quoteScore}</span>
                <div style={{ flex: 1, height: 4, background: "#1c1c38", borderRadius: 999, overflow: "hidden", maxWidth: 80 }}>
                  <div style={{ height: "100%", width: `${s.quoteScore}%`, background: SCORE_COLOR(s.quoteScore), borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 10, color: "#475569" }}>{s.quoteCode}</span>
              </div>

              {/* Bias */}
              <span style={{ fontSize: 12, fontWeight: 800, color: bc.color, minWidth: 70, textAlign: "right" }}>{bc.arrow} {s.bias}</span>
              <span style={{ color: "#334155", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* Breakdown */}
            {isOpen && (
              <div style={{ padding: "0 14px 14px", borderTop: "1px solid #1c1c38" }}>
                <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {s.breakdown.map(b => (
                    <div key={b.label} style={{ background: "#10101e", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{b.label}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: b.winner === s.pair.split("/")[0] ? "#22c55e" : "#475569", fontFamily: "JetBrains Mono, monospace" }}>{typeof b.base === "number" ? b.base.toFixed(1) : "—"}</span>
                        <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>✓ {b.winner}</span>
                        <span style={{ fontSize: 11, color: b.winner === s.pair.split("/")[1] ? "#22c55e" : "#475569", fontFamily: "JetBrains Mono, monospace" }}>{typeof b.quote === "number" ? b.quote.toFixed(1) : "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: "#475569", textAlign: "center" }}>
                  Différentiel pondéré : <strong style={{ color: s.diff > 0 ? "#22c55e" : s.diff < 0 ? "#ef4444" : "#94a3b8" }}>{s.diff > 0 ? "+" : ""}{s.diff} pts</strong> en faveur de {s.diff >= 0 ? s.baseCode : s.quoteCode}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Country Detail Card
function CountryCard({ c }: { c: CountryMacro }) {
  const cfg = TREND_CFG[c.trend];
  const rows = [
    { label: "Taux d'intérêt",   value: fmtNum(c.rate,         "%"),  icon: "🏦" },
    { label: "Inflation (CPI)",  value: fmtNum(c.inflation,    "%"),  icon: "📈" },
    { label: "Core Inflation",   value: fmtNum(c.coreInflation,"%"),  icon: "🎯" },
    { label: "Chômage",          value: fmtNum(c.unemployment, "%"),  icon: "👷" },
    { label: "Croissance PIB",   value: fmtNum(c.gdpGrowth,    "%"),  icon: "💹" },
    { label: "Balance commerciale", value: fmtNum(c.tradeBalance, "B"), icon: "⚖️" },
    { label: "Dette/PIB",        value: fmtNum(c.debtToGdp,   "%"),  icon: "📊" },
  ];

  return (
    <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 24 }}>{c.flag}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>{c.country}</div>
            <div style={{ fontSize: 10, color: "#475569" }}>{c.currency}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: SCORE_COLOR(c.score), fontFamily: "JetBrains Mono, monospace" }}>{c.score}</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 7px", borderRadius: 999 }}>{cfg.label}</span>
        </div>
      </div>
      <div style={{ height: 3, background: "#1c1c38", borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${c.score}%`, background: SCORE_COLOR(c.score), borderRadius: 999 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "#475569" }}>{r.icon} {r.label}</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#94a3b8" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
type Tab = "heatmap" | "countries" | "fx-scores" | "central-banks";

export default function MacroDashboard() {
  const [data, setData]       = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("heatmap");
  const [lastUpd, setLastUpd] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/macro-data?type=all", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d: MacroData = await r.json();
      setData(d);
      setLastUpd(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 4 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "heatmap",       label: "Heatmap Mondiale",  icon: "🌍" },
    { key: "countries",     label: "Pays (G8+)",        icon: "🏦" },
    { key: "fx-scores",     label: "FX Macro Score",    icon: "💱" },
    { key: "central-banks", label: "Banques Centrales", icon: "🏛️" },
  ];

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>Macro Dashboard</h2>
          <p style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
            Indicateurs G8+ · Banques centrales · FX Macro Score
            {data?.source === "live" && <span style={{ color: "#22c55e", marginLeft: 6 }}>● Live TradingEconomics</span>}
            {data?.source === "fallback" && <span style={{ color: "#f0c84a", marginLeft: 6 }}>● Données de référence</span>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpd && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>MAJ {lastUpd}</span>}
          <button onClick={fetchData} style={{ background: "none", border: "1px solid #1c1c38", borderRadius: 6, color: "#475569", cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 8, padding: "3px 4px" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, fontSize: 11, fontWeight: tab === t.key ? 700 : 500, padding: "5px 8px", borderRadius: 5, cursor: "pointer",
            background: tab === t.key ? "rgba(212,175,55,0.15)" : "transparent",
            border: `1px solid ${tab === t.key ? "rgba(212,175,55,0.4)" : "transparent"}`,
            color: tab === t.key ? "#f0c84a" : "#475569", whiteSpace: "nowrap",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 400, borderRadius: 8 }} />
      ) : data ? (
        <>
          {tab === "heatmap" && (
            <>
              <SectionHeader title="Heatmap Macro Mondiale" subtitle="Taux · Inflation · Chômage · PIB · Balance · Score global" badge={`${data.countries.length} pays`} />
              <MacroHeatmap countries={data.countries} />
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["Fort", "Modéré", "Faible", "Risque"] as const).map((l, i) => {
                  const cfgs = [TREND_CFG.strong, TREND_CFG.moderate, TREND_CFG.weak, TREND_CFG.risk];
                  const c = cfgs[i];
                  return <span key={l} style={{ fontSize: 9, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 4, border: `1px solid ${c.color}25` }}>{l}</span>;
                })}
                <span style={{ fontSize: 9, color: "#334155", marginLeft: "auto" }}>Score pondéré : Taux 30% · Inflation 25% · Chômage 15% · PIB 15% · Balance 10% · Sentiment 5%</span>
              </div>
            </>
          )}

          {tab === "countries" && (
            <>
              <SectionHeader title="Indicateurs par Pays" subtitle="Score macro normalisé 0–100" badge={`${data.countries.length} pays`} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 10 }}>
                {data.countries.map(c => <CountryCard key={c.code} c={c} />)}
              </div>
            </>
          )}

          {tab === "fx-scores" && (
            <>
              <SectionHeader title="FX Macro Score" subtitle="Comparaison macro bilatérale — cliquer une paire pour le détail" badge={`${data.fxScores.length} paires`} />
              <FXMacroTable scores={data.fxScores} />
            </>
          )}

          {tab === "central-banks" && (
            <>
              <SectionHeader title="Banques Centrales" subtitle="Taux actuel · Prévision · Probabilités · Prochaine réunion" badge="G8" />
              <CentralBankGrid banks={data.centralBanks} />
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center", color: "#475569", padding: "60px 0", fontSize: 13 }}>
          Impossible de charger les données macro — réessayez
          <br /><button onClick={fetchData} style={{ marginTop: 12, fontSize: 12, color: "#f0c84a", background: "rgba(240,200,74,0.08)", border: "1px solid rgba(240,200,74,0.2)", padding: "6px 16px", borderRadius: 6, cursor: "pointer" }}>Réessayer</button>
        </div>
      )}
    </div>
  );
}
