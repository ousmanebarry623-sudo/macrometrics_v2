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

function determineBias(p: PairSignal): BiasType {
  const scores = [
    biasNum(p.institutional.bias),
    biasNum(p.fundamental.bias),
    biasNum(p.sentiment.bias),
    biasNum(p.seasonality.bias),
  ];
  const sum = scores.reduce((a, b) => a + b, 0);
  const bull = scores.filter(s => s === 1).length;
  const bear = scores.filter(s => s === -1).length;

  if (p.signal === "BUY") {
    return bull >= 3 || p.confidence >= 65 ? "HAUSSIER" : "HAUSSIER MODÉRÉ";
  }
  if (p.signal === "SELL") {
    return bear >= 3 || p.confidence >= 65 ? "BAISSIER" : "BAISSIER MODÉRÉ";
  }
  // Neutral signal — refine by factor balance
  if (sum >= 2)  return "HAUSSIER MODÉRÉ";
  if (sum <= -2) return "BAISSIER MODÉRÉ";
  if (bull === bear && p.quality < 40) return "INDÉCIS";
  return "NEUTRE";
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
  const lp = p.sentiment.longPct;
  if (p.signal === "BUY" && lp > 62) {
    return `Retail ${lp}% long — risque de liquidation en cascade si le niveau clé cède`;
  }
  if (p.signal === "SELL" && lp < 38) {
    return `Retail ${lp}% long (foule très courte) — risque de short squeeze si rebond`;
  }
  if (p.institutional.bias !== "Neutral" && biasNum(p.institutional.bias) !== biasNum(p.fundamental.bias) && p.fundamental.bias !== "Neutral") {
    return `Divergence COT/Macro : institutionnels ${p.institutional.bias.toLowerCase()} mais fondamentaux ${p.fundamental.bias.toLowerCase()}`;
  }
  if (p.confLevel === "LOW") {
    return `Signaux de faible conviction (qualité ${p.quality}/100) — attendre confirmation`;
  }
  return `Publication macro à fort impact possible dans les 24h — surveiller le calendrier`;
}

function buildOpportunity(p: PairSignal): string {
  const ib = biasNum(p.institutional.bias);
  const fb = biasNum(p.fundamental.bias);
  const sb = biasNum(p.seasonality.bias);

  if (ib !== 0 && ib === fb && ib === sb) {
    const dir = ib === 1 ? "haussier" : "baissier";
    return `Triple confluence COT + Macro + Saisonnalité ${dir} — setup haute probabilité`;
  }
  if (ib !== 0 && ib === fb) {
    const dir = ib === 1 ? "haussier" : "baissier";
    return `Convergence COT + Macro ${dir} — momentum institutionnel confirmé`;
  }
  if (Math.abs(p.institutional.base.strengthPct - 50) > 35) {
    const dir = p.institutional.base.strengthPct > 85 ? "extrême long" : "extrême short";
    return `Positionnement COT ${dir} sur ${p.base} (${p.institutional.base.strengthPct}%) — potentiel retournement contrarian`;
  }
  if (p.seasonality.bias !== "Neutral" && p.signal !== "NEUTRAL") {
    const sDir = p.seasonality.bias === "Bullish" ? "haussier" : "baissier";
    return `Saisonnalité ${sDir} confirme le signal — contexte macro favorable pour le mois en cours`;
  }
  return `Surveiller la publication COT vendredi pour confirmer le positionnement institutionnel`;
}

function computeDailyBias(p: PairSignal): DailyBias {
  return {
    pair:        p.pair,
    bias:        determineBias(p),
    score:       p.quality,
    args:        buildArgs(p),
    risk:        buildRisk(p),
    opportunity: buildOpportunity(p),
    factors: [
      { label: "COT",     bias: p.institutional.bias, detail: `${p.institutional.base.strengthPct}% force` },
      { label: "Macro",   bias: p.fundamental.bias,   detail: `${p.fundamental.netScore >= 0 ? "+" : ""}${p.fundamental.netScore.toFixed(1)}` },
      { label: "Sentiment", bias: p.sentiment.bias,   detail: `${p.sentiment.longPct}% L` },
      { label: "Saison",  bias: p.seasonality.bias,   detail: p.seasonality.month },
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
