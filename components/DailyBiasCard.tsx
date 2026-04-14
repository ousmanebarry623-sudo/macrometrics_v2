"use client";
import { useEffect, useState, useCallback } from "react";
import type { PairSignal } from "@/app/api/signal-analysis/route";

// ── Bias types ────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const biasNum = (b: "Bullish" | "Bearish" | "Neutral"): number =>
  b === "Bullish" ? 1 : b === "Bearish" ? -1 : 0;

// Poids institutionnels : COT > Macro > Sentiment > Saisonnalité
const WEIGHTS = { cot: 0.40, fund: 0.30, sent: 0.20, seas: 0.10 };

function weightedScore(p: PairSignal): number {
  const cotDir  = biasNum(p.institutional.bias);
  const fundDir = biasNum(p.fundamental.bias);
  const sentDir = biasNum(p.sentiment.bias);
  const seasDir = biasNum(p.seasonality.bias);

  // Score de base pondéré (-1.0 → +1.0)
  const base =
    cotDir  * WEIGHTS.cot  +
    fundDir * WEIGHTS.fund +
    sentDir * WEIGHTS.sent +
    seasDir * WEIGHTS.seas;

  // Amplification COT par la force du positionnement (strength 0-100 → 0-1)
  const cotAmplifier = cotDir * (p.institutional.base.strengthPct / 100) * 0.15;

  return base + cotAmplifier;
}

function determineBias(p: PairSignal): BiasType {
  const ws = weightedScore(p);

  // Seuils pondérés — basés sur les poids institutionnels réels
  if (ws >= 0.55)  return "HAUSSIER";
  if (ws >= 0.18)  return "HAUSSIER MODÉRÉ";
  if (ws <= -0.55) return "BAISSIER";
  if (ws <= -0.18) return "BAISSIER MODÉRÉ";
  if (Math.abs(ws) < 0.05) return "INDÉCIS";
  return "NEUTRE";
}

// Score confiance — formule granulaire 4 composantes (max 100)
function computeConfidence(p: PairSignal): number {
  const biases = [p.institutional.bias, p.fundamental.bias, p.sentiment.bias, p.seasonality.bias];
  const bulls  = biases.filter(b => b === "Bullish").length;
  const bears  = biases.filter(b => b === "Bearish").length;

  // Split parfait → signal non exploitable, plafonné à 35
  if (bulls > 0 && bears > 0 && bulls === bears) {
    const cotZ = Math.min(15, Math.round(Math.abs(p.institutional.base.zScore ?? 0) * 5));
    return Math.max(10, Math.min(35, Math.round(p.quality * 0.25 + cotZ)));
  }

  // 1. Alignement directionnel (0–40 pts) : ratio signaux concordants
  const totalSig  = bulls + bears;
  const dominant  = Math.max(bulls, bears);
  const alignScore = totalSig > 0 ? Math.round((dominant / totalSig) * 40) : 0;

  // 2. Force COT institutionnelle via z-score CFTC (0–30 pts) — source la plus objective
  const cotZ     = Math.abs(p.institutional.base.zScore ?? 0);
  const cotScore = Math.min(30, Math.round(cotZ * 9));

  // 3. Magnitude des surprises macro TradingView (0–15 pts)
  const macroScore = Math.min(15, Math.round(Math.abs(p.fundamental.netScore) * 4));

  // 4. Extrémité du sentiment retail MyFXBook (0–10 pts) — signal contrarian
  const sentExt  = Math.abs(p.sentiment.longPct - 50);
  const sentScore = Math.min(10, Math.round(sentExt * 0.22));

  // 5. Saisonnalité historique alignée (0–5 pts)
  const seasScore = p.seasonality.bias !== "Neutral" ? 5 : 0;

  return Math.min(100, alignScore + cotScore + macroScore + sentScore + seasScore);
}

function buildArgs(p: PairSignal): string[] {
  const a: string[] = [];

  // 1. COT
  const cotStr = p.institutional.base.strengthPct;
  const cotZ   = p.institutional.base.zScore?.toFixed(1) ?? "—";
  if (p.institutional.bias === "Bullish") {
    a.push(`COT : institutionnels ${p.base} nets longs · force ${cotStr}% (z-score ${cotZ})`);
  } else if (p.institutional.bias === "Bearish") {
    a.push(`COT : institutionnels ${p.base} nets courts · force ${cotStr}% (z-score ${cotZ})`);
  } else {
    a.push(`COT : positionnement institutionnel neutre sur ${p.base}/${p.quote}`);
  }

  // 2. Fundamental
  const net  = p.fundamental.netScore;
  const sign = net >= 0 ? "+" : "";
  if (p.fundamental.bias !== "Neutral") {
    const dir = p.fundamental.bias === "Bullish" ? "positives" : "négatives";
    a.push(`Macro : surprises économiques ${dir} · score net ${sign}${net.toFixed(1)} (${p.base})`);
  } else {
    a.push(`Macro : surprises économiques équilibrées · score net ${sign}${net.toFixed(1)}`);
  }

  // 3. Sentiment ou Saisonnalité (le plus significatif)
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

  // Cas 1 : signal split — les deux facteurs dominants se contredisent
  const biases = [p.institutional.bias, p.fundamental.bias, p.sentiment.bias, p.seasonality.bias];
  const bulls  = biases.filter(b => b === "Bullish").length;
  const bears  = biases.filter(b => b === "Bearish").length;
  if (bulls > 0 && bears > 0 && bulls === bears) {
    return `Signaux contradictoires : COT/Macro ${ib <= 0 ? "baissiers" : "haussiers"} mais Sentiment/Saison inverses — biais non confirmé, attendre la prochaine publication COT`;
  }

  // Cas 2 : COT et Macro opposés (divergence institutionnelle majeure)
  if (ib !== 0 && fb !== 0 && ib !== fb) {
    return `Divergence COT/Macro : institutionnels ${p.institutional.bias.toLowerCase()} (z-score ${p.institutional.base.zScore?.toFixed(1) ?? "—"}) vs surprises macro ${p.fundamental.bias.toLowerCase()} — signal mixte`;
  }

  // Cas 3 : Retail en foule dans la mauvaise direction
  if (wb < 0 && lp < 38) {
    return `Short squeeze potentiel : retail ${lp}% long seulement — tout rebond peut déclencher une compression des shorts`;
  }
  if (wb > 0 && lp > 62) {
    return `Excès long retail (${lp}%) — risque de liquidation si niveau support clé cède`;
  }

  // Cas 4 : COT à positionnement extrême (retournement contrarian)
  if (p.institutional.base.strengthPct >= 90) {
    return `Positionnement COT extrême (${p.institutional.base.strengthPct}%) — risque de retournement si les fondamentaux changent`;
  }

  // Cas 5 : faible conviction
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

  // Triple confluence
  if (ib !== 0 && ib === fb && ib === sb) {
    return `Triple confluence COT + Macro + Saisonnalité ${dir} — setup haute probabilité institutionnelle`;
  }

  // Double confluence COT + Macro (les plus importants)
  if (ib !== 0 && ib === fb) {
    return `Confluence COT + Macro ${dir} — les deux facteurs institutionnels majeurs (70% du score) sont alignés`;
  }

  // COT extrême seul = opportunité contrarian ou continuation
  if (p.institutional.base.strengthPct >= 85) {
    const posDir = ib === 1 ? "long extrême" : "short extrême";
    return `COT ${posDir} (${p.institutional.base.strengthPct}%) — niveau historiquement associé à des retournements ou continuations fortes`;
  }

  // Split signal mais domination baissière/haussière pondérée
  if (Math.abs(wb) >= 0.18) {
    return `Biais pondéré ${dir} malgré signaux mixtes — COT (40%) + Macro (30%) surpèsent Sentiment et Saisonnalité`;
  }

  return `Attendre alignement COT + Macro avant entrée — surveiller prochaine publication CFTC vendredi`;
}

function computeDailyBias(p: PairSignal): DailyBias {
  return {
    pair:        p.pair,
    bias:        determineBias(p),
    score:       computeConfidence(p),   // ← score pondéré réel, pas p.quality brut
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function DailyBiasCard() {
  const [allData, setAllData]   = useState<PairSignal[]>([]);
  const [selected, setSelected] = useState("EUR/USD");
  const [loading, setLoading]   = useState(true);
  const [lastUpd, setLastUpd]   = useState("");

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/signal-analysis", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const data: PairSignal[] = await r.json();
      setAllData(data);
      setLastUpd(new Date().toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit",
      }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const pairSignal = allData.find(d => d.pair === selected);
  const bias       = pairSignal ? computeDailyBias(pairSignal) : null;
  const cfg        = bias ? BIAS_CFG[bias.bias] : null;

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Biais Journalier
          </h3>
          <p style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>Morning brief · COT · Macro · Sentiment · Saisonnalité</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpd && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>MAJ {lastUpd}</span>}
          <button onClick={fetchData} title="Actualiser" style={{ background: "none", border: "1px solid #1c1c38", borderRadius: 6, color: "#475569", cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {/* Top paires du jour */}
      {allData.length > 0 && (() => {
        const top3 = allData
          .filter(d => d.signal !== "NEUTRAL")
          .map(d => ({ ...d, confScore: computeConfidence(d), biasFull: determineBias(d) }))
          .sort((a, b) => b.confScore - a.confScore)
          .slice(0, 3);
        if (!top3.length) return null;
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
              🏆 Meilleures paires du jour
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

      {/* Pair selector */}
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{
        width: "100%", background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 7,
        color: "#f1f5f9", fontSize: 13, fontWeight: 600, padding: "7px 10px",
        cursor: "pointer", outline: "none", marginBottom: 14,
      }}>
        {allData.map(d => <option key={d.pair} value={d.pair}>{d.pair} · {d.category}</option>)}
      </select>

      {loading ? (
        <div className="skeleton" style={{ height: 320, borderRadius: 8 }} />
      ) : bias && cfg ? (
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
                {pairSignal?.confLevel} · {pairSignal?.factors} facteurs · {pairSignal?.seasonality.month}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
      ) : (
        <div style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 12 }}>
          Données indisponibles — réessayez dans quelques instants
        </div>
      )}
    </div>
  );
}
