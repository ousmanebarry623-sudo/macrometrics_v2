"use client";
import { useEffect, useState, useCallback } from "react";
import type { PairSignal } from "@/app/api/signal-analysis/route";
import type { InstitutionalPairSignal } from "@/lib/institutional-bias";
import { useBreakpoint } from "@/lib/use-breakpoint";

// ── Legacy Bias types (fallback) ─────────────────────────────────────────────
type BiasType = "HAUSSIER" | "HAUSSIER MODÉRÉ" | "BAISSIER" | "BAISSIER MODÉRÉ" | "NEUTRE" | "INDÉCIS";

interface DailyBias {
  pair:      string;
  bias:      BiasType;
  score:     number;
  args:      string[];
  risk:      string;
  opportunity: string;
  factors:   { label: string; bias: string; detail: string }[];
}

interface InstitutionalResponse {
  top6:      InstitutionalPairSignal[];
  regime:    string;
  dxyTrend:  string;
  vix:       number;
  updatedAt: string;
  error?:    string;
}

// ── Legacy helpers ────────────────────────────────────────────────────────────
const biasNum = (b: "Bullish" | "Bearish" | "Neutral"): number =>
  b === "Bullish" ? 1 : b === "Bearish" ? -1 : 0;

const WEIGHTS = { cot: 0.40, fund: 0.30, sent: 0.20, seas: 0.10 };

function weightedScore(p: PairSignal): number {
  const cotDir  = biasNum(p.institutional.bias);
  const fundDir = biasNum(p.fundamental.bias);
  const sentDir = biasNum(p.sentiment.bias);
  const seasDir = biasNum(p.seasonality.bias);
  const base =
    cotDir  * WEIGHTS.cot  +
    fundDir * WEIGHTS.fund +
    sentDir * WEIGHTS.sent +
    seasDir * WEIGHTS.seas;
  const cotAmplifier = cotDir * (p.institutional.base.strengthPct / 100) * 0.15;
  return base + cotAmplifier;
}

function determineBias(p: PairSignal): BiasType {
  const ws = weightedScore(p);
  if (ws >= 0.55)  return "HAUSSIER";
  if (ws >= 0.18)  return "HAUSSIER MODÉRÉ";
  if (ws <= -0.55) return "BAISSIER";
  if (ws <= -0.18) return "BAISSIER MODÉRÉ";
  if (Math.abs(ws) < 0.05) return "INDÉCIS";
  return "NEUTRE";
}

function computeConfidenceLegacy(p: PairSignal): number {
  const biases = [p.institutional.bias, p.fundamental.bias, p.sentiment.bias, p.seasonality.bias];
  const bulls  = biases.filter(b => b === "Bullish").length;
  const bears  = biases.filter(b => b === "Bearish").length;
  if (bulls > 0 && bears > 0 && bulls === bears) {
    const cotZ = Math.min(15, Math.round(Math.abs(p.institutional.base.zScore ?? 0) * 5));
    return Math.max(10, Math.min(35, Math.round(p.quality * 0.25 + cotZ)));
  }
  const totalSig  = bulls + bears;
  const dominant  = Math.max(bulls, bears);
  const alignScore = totalSig > 0 ? Math.round((dominant / totalSig) * 40) : 0;
  const cotZ     = Math.abs(p.institutional.base.zScore ?? 0);
  const cotScore = Math.min(30, Math.round(cotZ * 9));
  const macroScore = Math.min(15, Math.round(Math.abs(p.fundamental.netScore) * 4));
  const sentExt  = Math.abs(p.sentiment.longPct - 50);
  const sentScore = Math.min(10, Math.round(sentExt * 0.22));
  const seasScore = p.seasonality.bias !== "Neutral" ? 5 : 0;
  return Math.min(100, alignScore + cotScore + macroScore + sentScore + seasScore);
}

function buildArgs(p: PairSignal): string[] {
  const a: string[] = [];
  const cotStr = p.institutional.base.strengthPct;
  const cotZ   = p.institutional.base.zScore?.toFixed(1) ?? "—";
  if (p.institutional.bias === "Bullish") {
    a.push(`COT : institutionnels ${p.base} nets longs · force ${cotStr}% (z-score ${cotZ})`);
  } else if (p.institutional.bias === "Bearish") {
    a.push(`COT : institutionnels ${p.base} nets courts · force ${cotStr}% (z-score ${cotZ})`);
  } else {
    a.push(`COT : positionnement institutionnel neutre sur ${p.base}/${p.quote}`);
  }
  const net  = p.fundamental.netScore;
  const sign = net >= 0 ? "+" : "";
  if (p.fundamental.bias !== "Neutral") {
    const dir = p.fundamental.bias === "Bullish" ? "positives" : "négatives";
    a.push(`Macro : surprises économiques ${dir} · score net ${sign}${net.toFixed(1)} (${p.base})`);
  } else {
    a.push(`Macro : surprises économiques équilibrées · score net ${sign}${net.toFixed(1)}`);
  }
  const lp = p.sentiment.longPct;
  if (lp > 62) {
    a.push(`Retail ${lp}% long → signal contrarian baissier (foule en position longue)`);
  } else if (lp < 38) {
    a.push(`Retail ${lp}% long → signal contrarian haussier (foule en position courte)`);
  } else if (p.seasonality.bias !== "Neutral") {
    const sDir = p.seasonality.bias === "Bullish" ? "haussière" : "baissière";
    a.push(`Saisonnalité ${p.seasonality.month} historiquement ${sDir} sur cette paire`);
  } else {
    a.push(`Sentiment retail neutre · ratio ${lp}% long / ${p.sentiment.shortPct}% short`);
  }
  return a;
}

function buildRisk(p: PairSignal): string {
  const lp  = p.sentiment.longPct;
  const ib  = biasNum(p.institutional.bias);
  const fb  = biasNum(p.fundamental.bias);
  const wb  = weightedScore(p);
  const biases = [p.institutional.bias, p.fundamental.bias, p.sentiment.bias, p.seasonality.bias];
  const bulls  = biases.filter(b => b === "Bullish").length;
  const bears  = biases.filter(b => b === "Bearish").length;
  if (bulls > 0 && bears > 0 && bulls === bears) {
    return `Signaux contradictoires : COT/Macro ${ib <= 0 ? "baissiers" : "haussiers"} mais Sentiment/Saison inverses — biais non confirmé, attendre la prochaine publication COT`;
  }
  if (ib !== 0 && fb !== 0 && ib !== fb) {
    return `Divergence COT/Macro : institutionnels ${p.institutional.bias.toLowerCase()} (z-score ${p.institutional.base.zScore?.toFixed(1) ?? "—"}) vs surprises macro ${p.fundamental.bias.toLowerCase()} — signal mixte`;
  }
  if (wb < 0 && lp < 38) {
    return `Short squeeze potentiel : retail ${lp}% long seulement — tout rebond peut déclencher une compression des shorts`;
  }
  if (wb > 0 && lp > 62) {
    return `Excès long retail (${lp}%) — risque de liquidation si niveau support clé cède`;
  }
  if (p.institutional.base.strengthPct >= 90) {
    return `Positionnement COT extrême (${p.institutional.base.strengthPct}%) — risque de retournement si les fondamentaux changent`;
  }
  if (p.confLevel === "LOW" || Math.abs(wb) < 0.20) {
    return `Conviction faible (score pondéré ${(wb * 100).toFixed(0)}/100) — attendre un catalyseur macro pour confirmer la direction`;
  }
  return `Surveiller le calendrier macro des 24h — tout choc fondamental peut invalider le biais`;
}

function buildOpportunity(p: PairSignal): string {
  const ib  = biasNum(p.institutional.bias);
  const fb  = biasNum(p.fundamental.bias);
  const sb  = biasNum(p.seasonality.bias);
  const wb  = weightedScore(p);
  const dir = wb >= 0 ? "haussier" : "baissier";
  if (ib !== 0 && ib === fb && ib === sb) {
    return `Triple confluence COT + Macro + Saisonnalité ${dir} — setup haute probabilité institutionnelle`;
  }
  if (ib !== 0 && ib === fb) {
    return `Confluence COT + Macro ${dir} — les deux facteurs institutionnels majeurs (70% du score) sont alignés`;
  }
  if (p.institutional.base.strengthPct >= 85) {
    const posDir = ib === 1 ? "long extrême" : "short extrême";
    return `COT ${posDir} (${p.institutional.base.strengthPct}%) — niveau historiquement associé à des retournements ou continuations fortes`;
  }
  if (Math.abs(wb) >= 0.18) {
    return `Biais pondéré ${dir} malgré signaux mixtes — COT (40%) + Macro (30%) surpèsent Sentiment et Saisonnalité`;
  }
  return `Attendre alignement COT + Macro avant entrée — surveiller prochaine publication CFTC vendredi`;
}

function computeDailyBias(p: PairSignal): DailyBias {
  return {
    pair:        p.pair,
    bias:        determineBias(p),
    score:       computeConfidenceLegacy(p),
    args:        buildArgs(p),
    risk:        buildRisk(p),
    opportunity: buildOpportunity(p),
    factors: [
      { label: "COT (40%)",  bias: p.institutional.bias, detail: `${p.institutional.base.strengthPct}% · z${p.institutional.base.zScore?.toFixed(1) ?? "—"}` },
      { label: "Macro (30%)", bias: p.fundamental.bias,  detail: `${p.fundamental.netScore >= 0 ? "+" : ""}${p.fundamental.netScore.toFixed(1)}` },
      { label: "Sent (20%)", bias: p.sentiment.bias,     detail: `${p.sentiment.longPct}% L` },
      { label: "Saison (10%)", bias: p.seasonality.bias, detail: p.seasonality.month },
    ],
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BIAS_CFG: Record<BiasType, { color: string; bg: string; arrow: string }> = {
  "HAUSSIER":          { color: "#22c55e", bg: "rgba(34,197,94,0.07)",  arrow: "↑" },
  "HAUSSIER MODÉRÉ":   { color: "#86efac", bg: "rgba(34,197,94,0.04)",  arrow: "↗" },
  "BAISSIER":          { color: "#ef4444", bg: "rgba(239,68,68,0.07)",  arrow: "↓" },
  "BAISSIER MODÉRÉ":   { color: "#fca5a5", bg: "rgba(239,68,68,0.04)",  arrow: "↘" },
  "NEUTRE":            { color: "#94a3b8", bg: "rgba(148,163,184,0.05)", arrow: "—" },
  "INDÉCIS":           { color: "#f0c84a", bg: "rgba(240,200,74,0.06)", arrow: "⇄" },
};

const FACTOR_COLOR = (b: string) =>
  b === "Bullish" ? "#22c55e" : b === "Bearish" ? "#ef4444" : "#475569";

const SCORE_COLOR = (s: number) =>
  s >= 75 ? "#22c55e" : s >= 50 ? "#f0c84a" : "#ef4444";

const REGIME_COLOR: Record<string, string> = {
  RISK_ON:    "#22c55e",
  RISK_OFF:   "#ef4444",
  TRANSITION: "#f97316",
  MIXED:      "#3b82f6",
};

// ── Layer bar ────────────────────────────────────────────────────────────────
function LayerBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontFamily: "JetBrains Mono, monospace", color, fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, background: "#1c1c38", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DailyBiasCard() {
  const [inst, setInst]         = useState<InstitutionalResponse | null>(null);
  const [allData, setAllData]   = useState<PairSignal[]>([]);
  const [selected, setSelected] = useState("EUR/USD");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [instFailed, setInstFailed] = useState(false);
  const [lastUpd, setLastUpd]   = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [instRes, sigRes] = await Promise.allSettled([
        fetch("/api/institutional-bias", { cache: "no-store" }),
        fetch("/api/signal-analysis",     { cache: "no-store" }),
      ]);

      let instOk = false;
      if (instRes.status === "fulfilled" && instRes.value.ok) {
        const j: InstitutionalResponse = await instRes.value.json();
        if (!j.error && j.top6 && j.top6.length > 0) {
          setInst(j);
          instOk = true;
        }
      }
      setInstFailed(!instOk);

      if (sigRes.status === "fulfilled" && sigRes.value.ok) {
        const data: PairSignal[] = await sigRes.value.json();
        setAllData(data);
      }

      setLastUpd(new Date().toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit",
      }));
    } catch {
      setInstFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const { isMobile } = useBreakpoint();
  const pairSignal = allData.find(d => d.pair === selected);
  const bias       = pairSignal ? computeDailyBias(pairSignal) : null;
  const cfg        = bias ? BIAS_CFG[bias.bias] : null;

  const regimeColor = inst ? (REGIME_COLOR[inst.regime] ?? "#64748b") : "#64748b";
  const dxyArrow    = inst?.dxyTrend === "BULLISH" ? "↑" : inst?.dxyTrend === "BEARISH" ? "↓" : "→";
  const dxyColor    = inst?.dxyTrend === "BULLISH" ? "#22c55e" : inst?.dxyTrend === "BEARISH" ? "#ef4444" : "#64748b";
  const vixColor    = inst && inst.vix > 25 ? "#ef4444" : inst && inst.vix < 18 ? "#22c55e" : "#f59e0b";

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: isMobile ? "14px 12px" : 20 }} suppressHydrationWarning>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
            Biais Journalier
          </h3>
          <p style={{ fontSize: 10, color: "#334155", marginTop: 2, margin: 0 }}>Morning brief · COT · SMC · Bonds · Régime</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {inst && (
            <>
              <span title="Régime marché" style={{ fontSize: 10, fontWeight: 700, color: regimeColor, background: `${regimeColor}18`, border: `1px solid ${regimeColor}40`, borderRadius: 5, padding: "3px 7px" }}>
                {inst.regime}
              </span>
              <span title="DXY trend" style={{ fontSize: 10, fontWeight: 700, color: dxyColor, background: `${dxyColor}18`, borderRadius: 5, padding: "3px 7px", fontFamily: "JetBrains Mono, monospace" }}>
                DXY {dxyArrow}
              </span>
              <span title="VIX" style={{ fontSize: 10, fontWeight: 700, color: vixColor, background: `${vixColor}18`, borderRadius: 5, padding: "3px 7px", fontFamily: "JetBrains Mono, monospace" }}>
                VIX {inst.vix.toFixed(1)}
              </span>
            </>
          )}
          {instFailed && (
            <span title="Mode basique — API institutionnelle indisponible" style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 5, padding: "3px 7px" }}>
              Mode basique
            </span>
          )}
          {lastUpd && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>MAJ {lastUpd}</span>}
          <button onClick={fetchData} title="Actualiser" style={{ background: "none", border: "1px solid #1c1c38", borderRadius: 6, color: "#475569", cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {loading && !inst && (
        <div className="skeleton" style={{ height: 380, borderRadius: 8 }} />
      )}

      {/* TOP 6 — Primary */}
      {!loading && inst && inst.top6.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Top 6 setups institutionnels
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inst.top6.map((s, i) => {
              const dirColor = s.direction === "BUY" ? "#22c55e" : "#ef4444";
              const dirLabel = s.direction === "BUY" ? "↑ HAUSSIER" : "↓ BAISSIER";
              const isOpen   = expanded === `${s.pair}-${s.direction}`;
              return (
                <div key={`${s.pair}-${s.direction}-${i}`} style={{
                  background: "#0d0d1a",
                  border: `1px solid ${isOpen ? dirColor + "50" : "#1c1c38"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : `${s.pair}-${s.direction}`)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", background: "transparent", border: "none",
                      padding: "8px 11px", cursor: "pointer", textAlign: "left", color: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>#{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{s.pair}</span>
                      <span style={{ fontSize: 9, color: "#475569" }}>{s.category}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: dirColor, background: `${dirColor}15`, borderRadius: 4, padding: "2px 6px" }}>
                        {dirLabel}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: SCORE_COLOR(s.score), fontFamily: "JetBrains Mono, monospace", minWidth: 26, textAlign: "right" }}>
                        {s.score}
                      </span>
                      <span style={{ fontSize: 10, color: "#475569" }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #1c1c38" }}>
                      {/* Layer bars */}
                      <div style={{ marginBottom: 10 }}>
                        <LayerBar label="Macro / COT / Bonds" value={s.layers.macro}      max={40} color="#3b82f6" />
                        <LayerBar label="Sentiment / Régime"  value={s.layers.sentiment}  max={20} color="#8b5cf6" />
                        <LayerBar label="SMC / Structure"     value={s.layers.smc}        max={30} color="#f59e0b" />
                        <LayerBar label="Confluence DXY/VIX"  value={s.layers.confluence} max={10} color="#22c55e" />
                      </div>

                      {/* SMC context */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", background: "#1c1c38", borderRadius: 4, padding: "3px 7px" }}>
                          {s.smcContext.structure}
                        </span>
                        {s.smcContext.lastEvent !== "NONE" && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.15)", borderRadius: 4, padding: "3px 7px" }}>
                            {s.smcContext.lastEvent}
                          </span>
                        )}
                        {s.smcContext.hasValidOB && s.smcContext.obZone && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.15)", borderRadius: 4, padding: "3px 7px", fontFamily: "JetBrains Mono, monospace" }}>
                            OB {s.smcContext.obZone.low.toFixed(5)}–{s.smcContext.obZone.high.toFixed(5)}
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", background: "#1c1c38", borderRadius: 4, padding: "3px 7px" }}>
                          ⏱ 48h max
                        </span>
                        {s.bondSpread !== 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", background: "#1c1c38", borderRadius: 4, padding: "3px 7px", fontFamily: "JetBrains Mono, monospace" }}>
                            Bonds {s.bondSpread > 0 ? "+" : ""}{s.bondSpread}bp
                          </span>
                        )}
                      </div>

                      {/* Entry zone */}
                      <div style={{ background: "#0a0a15", border: "1px solid #1c1c38", borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5,1fr)", gap: 6, color: "#94a3b8" }}>
                          <div>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>Entry</div>
                            <div style={{ color: "#f1f5f9" }}>{s.entry.zone.low.toFixed(5)}<br/>{s.entry.zone.high.toFixed(5)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>SL</div>
                            <div style={{ color: "#ef4444" }}>{s.entry.stopLoss.toFixed(5)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>TP1</div>
                            <div style={{ color: "#22c55e" }}>{s.entry.target1.toFixed(5)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>TP2</div>
                            <div style={{ color: "#22c55e" }}>{s.entry.target2.toFixed(5)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>R/R</div>
                            <div style={{ color: "#f59e0b" }}>{s.entry.rr1}x / {s.entry.rr2}x</div>
                          </div>
                        </div>
                      </div>

                      {/* Arguments */}
                      <div>
                        {s.arguments.map((arg, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 7, marginBottom: idx < s.arguments.length - 1 ? 6 : 0, alignItems: "flex-start" }}>
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color: "#f0c84a", flexShrink: 0, lineHeight: 1.6 }}>{idx + 1}.</span>
                            <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{arg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback: top 3 legacy when institutional failed */}
      {!loading && instFailed && allData.length > 0 && (() => {
        const top3 = allData
          .filter(d => d.signal !== "NEUTRAL")
          .map(d => ({ ...d, confScore: computeConfidenceLegacy(d), biasFull: determineBias(d) }))
          .sort((a, b) => b.confScore - a.confScore)
          .slice(0, 3);
        if (!top3.length) return null;
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
              🏆 Top paires (mode basique)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {top3.map((d, i) => {
                const cfg = BIAS_CFG[d.biasFull];
                return (
                  <button key={d.pair} onClick={() => setSelected(d.pair)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: selected === d.pair ? `${cfg.color}12` : "#0d0d1a",
                    border: `1px solid ${selected === d.pair ? cfg.color + "40" : "#1c1c38"}`,
                    borderRadius: 7, padding: "7px 10px", cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>#{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>{d.pair}</span>
                      <span style={{ fontSize: 9, color: "#475569" }}>{d.category}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}15`, borderRadius: 4, padding: "2px 6px" }}>
                        {cfg.arrow} {d.biasFull}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: SCORE_COLOR(d.confScore), fontFamily: "JetBrains Mono, monospace" }}>{d.confScore}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pair selector (legacy detail) */}
      {allData.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7, marginTop: 4 }}>
            Détail par paire (tous facteurs)
          </div>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={{
            width: "100%", background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 7,
            color: "#f1f5f9", fontSize: 13, fontWeight: 600, padding: "7px 10px",
            cursor: "pointer", outline: "none", marginBottom: 14,
          }}>
            {allData.map(d => <option key={d.pair} value={d.pair}>{d.pair} · {d.category}</option>)}
          </select>
        </>
      )}

      {bias && cfg && pairSignal && (
        <div>
          {/* Main bias display */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 18px", background: cfg.bg,
            border: `1px solid ${cfg.color}35`, borderRadius: 10, marginBottom: 14,
          }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: cfg.color, letterSpacing: "-0.02em" }}>
                {cfg.arrow} {bias.bias}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                {pairSignal.confLevel} · {pairSignal.factors} facteurs · {pairSignal.seasonality.month}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: SCORE_COLOR(bias.score), fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>{bias.score}</div>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Score confiance</div>
            </div>
          </div>

          {/* Score bar */}
          <div style={{ height: 3, background: "#1c1c38", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", width: `${bias.score}%`, background: SCORE_COLOR(bias.score), borderRadius: 999, transition: "width 0.6s ease" }} />
          </div>

          {/* Factor mini-pills */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 6, marginBottom: 16 }} suppressHydrationWarning>
            {bias.factors.map(f => (
              <div key={f.label} style={{
                background: "#0d0d1a", border: `1px solid ${FACTOR_COLOR(f.bias)}25`,
                borderRadius: 7, padding: "8px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.label}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: FACTOR_COLOR(f.bias) }}>
                  {f.bias === "Bullish" ? "▲" : f.bias === "Bearish" ? "▼" : "—"} {f.bias}
                </div>
                <div style={{ fontSize: 9, color: "#334155", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>{f.detail}</div>
              </div>
            ))}
          </div>

          {/* Arguments */}
          <div style={{ marginBottom: 14, background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 9, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 9 }}>
              Arguments clés
            </div>
            {bias.args.map((arg, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < 2 ? 7 : 0, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color: "#f0c84a", flexShrink: 0, lineHeight: 1.6 }}>{i + 1}.</span>
                <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{arg}</span>
              </div>
            ))}
          </div>

          {/* Risk + Opportunity */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }} suppressHydrationWarning>
            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>⚠ Risque principal</div>
              <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.55, margin: 0 }}>{bias.risk}</p>
            </div>
            <div style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>🎯 Opportunité</div>
              <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.55, margin: 0 }}>{bias.opportunity}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && !inst && !allData.length && (
        <div style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 12 }}>
          Données indisponibles — réessayez dans quelques instants
        </div>
      )}
    </div>
  );
}
