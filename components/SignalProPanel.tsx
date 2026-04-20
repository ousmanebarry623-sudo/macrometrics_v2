// components/SignalProPanel.tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { computeSignalPro }    from "@/lib/signal-pro";
import type { SignalProResult } from "@/lib/signal-pro";
import type { DashMetrics }    from "@/components/ElteSmartDashboard";
import type { PairSignal }     from "@/app/api/signal-analysis/route";
import type { RegimeType }     from "@/lib/market-regime";
import type { MarketRegimeResponse } from "@/app/api/market-regime/route";

interface Props {
  pairLabel:    string;  // ex: "EUR/USD"
  tfLabel:      string;
  metrics:      DashMetrics | null;
  onProResult?: (result: SignalProResult) => void;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "NEUTRAL" }) {
  const colors = {
    BUY:     { bg: "rgba(34,197,94,.15)",   border: "rgba(34,197,94,.4)",   text: "#22c55e" },
    SELL:    { bg: "rgba(239,68,68,.15)",   border: "rgba(239,68,68,.4)",   text: "#ef4444" },
    NEUTRAL: { bg: "rgba(100,116,139,.12)", border: "rgba(100,116,139,.3)", text: "#64748b" },
  };
  const c = colors[signal];
  return (
    <div style={{
      fontSize: 32, fontWeight: 900, fontFamily: "monospace", letterSpacing: 2,
      color: c.text, background: c.bg, border: `2px solid ${c.border}`,
      borderRadius: 12, padding: "12px 28px", textAlign: "center",
    }}>
      {signal}
    </div>
  );
}

function ConfidenceGauge({ value, level }: { value: number; level: "HIGH" | "MEDIUM" | "LOW" }) {
  const color = level === "HIGH" ? "#22c55e" : level === "MEDIUM" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Confidence</span>
        <span style={{ fontSize: 13, fontWeight: 900, color, fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 8, background: "#1c1c38", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${value}%`,
          background: `linear-gradient(90deg, #334155, ${color})`,
          borderRadius: 4, transition: "width .4s ease",
        }} />
      </div>
      <div style={{ marginTop: 4, textAlign: "right" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}22`, border: `1px solid ${color}44`,
          borderRadius: 4, padding: "1px 7px",
        }}>{level}</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score > 60 ? "#22c55e" : score < 40 ? "#ef4444" : "#64748b";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{score}</span>
      </div>
      <div style={{ height: 5, background: "#1c1c38", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Bullet({ value }: { value: string }) {
  const isBull = value === "Bullish" || value === "Buy" || value === "Confirming" || value === "Trending" || value === "Expanding" || value === "RISK_ON" || value === "Risk-On" || value === "Contrarian Bull";
  const isBear = value === "Bearish" || value === "Sell" || value === "RISK_OFF" || value === "Risk-Off" || value === "Contrarian Bear";
  const color  = isBull ? "#22c55e" : isBear ? "#ef4444" : "#64748b";
  return <span style={{ fontSize: 11, color, fontWeight: 700 }}>● {value}</span>;
}

function FactorRow({ label, value }: { label: string; value: string | number }) {
  return (
    <tr style={{ borderBottom: "1px solid #0d0d1a" }}>
      <td style={{ padding: "5px 0", fontSize: 11, color: "#64748b", paddingRight: 12 }}>{label}</td>
      <td style={{ textAlign: "right", padding: "5px 0" }}>
        {typeof value === "number"
          ? <span style={{ fontSize: 11, color: "#f0c84a", fontFamily: "monospace" }}>{value}</span>
          : <Bullet value={value} />}
      </td>
    </tr>
  );
}

function PanelSkeleton() {
  return (
    <div style={{
      background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12,
      padding: 24, display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ height: 14, width: 160, background: "#1c1c38", borderRadius: 6 }} />
      <div style={{ height: 48, width: 200, background: "#1c1c38", borderRadius: 10 }} />
      <div style={{ height: 10, width: "80%", background: "#1c1c38", borderRadius: 4 }} />
      <div style={{ height: 10, width: "60%", background: "#1c1c38", borderRadius: 4 }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SignalProPanel({ pairLabel, tfLabel, metrics, onProResult }: Props) {
  const [pairSignal,  setPairSignal]  = useState<PairSignal | null>(null);
  const [regime,      setRegime]      = useState<RegimeType | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [error,       setError]       = useState<boolean>(false);

  const fetchMacro = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [saRes, rgRes] = await Promise.all([
        fetch("/api/signal-analysis"),
        fetch("/api/market-regime"),
      ]);

      if (saRes.ok) {
        const signals: PairSignal[] = await saRes.json();
        const match = signals.find(s =>
          s.pair === pairLabel ||
          s.pair.replace("/", "") === pairLabel.replace("/", ""),
        );
        setPairSignal(match ?? null);
      } else {
        setError(true);
      }

      if (rgRes.ok) {
        const rgData: MarketRegimeResponse = await rgRes.json();
        const r = rgData.snapshot?.regime;
        if (r === "RISK_ON" || r === "MIXED" || r === "TRANSITION" || r === "RISK_OFF") {
          setRegime(r);
        }
      }

      setLastRefresh(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [pairLabel]);

  useEffect(() => { fetchMacro(); }, [fetchMacro]);

  const lastResultRef = useRef<SignalProResult | null>(null);

  const freshResult = metrics ? computeSignalPro(pairLabel, metrics, pairSignal, regime) : null;
  if (freshResult) lastResultRef.current = freshResult;
  const result = freshResult ?? lastResultRef.current;

  useEffect(() => {
    if (freshResult && onProResult) onProResult(freshResult);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshResult?.signal, freshResult?.confidence, freshResult?.resume, onProResult]);

  if (!metrics) return <PanelSkeleton />;
  if (!result) return <PanelSkeleton />;

  const { signal, confidence, confLevel, horizon, technicalScore, macroScore,
          signalProScore, factors, divergences, resume } = result;

  const signalColor = signal === "BUY" ? "#22c55e" : signal === "SELL" ? "#ef4444" : "#64748b";

  return (
    <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12, overflow: "hidden" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 18px", borderBottom: "1px solid #1c1c38",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
            ⚡ SIGNAL PRO
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>{pairLabel} · {tfLabel}</span>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: "#334155" }}>mis à jour {lastRefresh}</span>
          )}
          {error && (
            <span style={{
              fontSize: 10, color: "#f59e0b",
              background: "rgba(245,158,11,.1)",
              border: "1px solid rgba(245,158,11,.2)",
              borderRadius: 4, padding: "1px 7px",
            }}>⚠ Données macro indisponibles</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={fetchMacro}
            disabled={loading}
            style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              background: "rgba(99,102,241,.12)", border: "1px solid rgba(99,102,241,.3)",
              color: "#818cf8", opacity: loading ? 0.5 : 1,
            }}
          >↻ Refresh</button>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#22c55e",
            background: "rgba(34,197,94,.08)", padding: "3px 10px",
            borderRadius: 999, border: "1px solid rgba(34,197,94,.2)",
          }}>● LIVE</span>
        </div>
      </div>

      {/* ── Signal row ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
        padding: "16px 18px", borderBottom: "1px solid #1c1c38", alignItems: "center",
      }}>

        {/* Direction + Score Pro */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <SignalBadge signal={signal} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Score Pro</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: signalColor }}>
              {signalProScore}
            </div>
          </div>
        </div>

        {/* Confidence + sub-scores */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ConfidenceGauge value={confidence} level={confLevel} />
          <ScoreBar score={technicalScore} label="Technical" />
          <ScoreBar score={macroScore}     label="Macro" />
        </div>

        {/* Horizon */}
        <div style={{
          background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
            Horizon
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{horizon}</div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>Probabilité historique</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: signalColor, fontFamily: "monospace" }}>
            {signal === "NEUTRAL" ? "~50%" : `~${Math.min(90, 50 + Math.round(signalProScore - 50))}%`}
          </div>
        </div>
      </div>

      {/* ── Technical + Macro breakdown ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #1c1c38" }}>

        {/* Technical */}
        <div style={{ padding: "12px 18px", borderRight: "1px solid #1c1c38" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            TECHNIQUE · {technicalScore}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <FactorRow label="Supertrend"   value={factors.technical.supertrend} />
              <FactorRow label="MACD"          value={factors.technical.macd} />
              <FactorRow label="EMA200"        value={factors.technical.ema200} />
              <FactorRow label="TF Consensus"  value={factors.technical.tfConsensus} />
              <FactorRow label="Volume"        value={factors.technical.volume} />
              <FactorRow label="Volatilité"    value={factors.technical.volatility} />
              <FactorRow label="Sensitivity"   value={factors.technical.sensitivity} />
            </tbody>
          </table>
        </div>

        {/* Macro */}
        <div style={{ padding: "12px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            MACRO · {macroScore}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <FactorRow label="COT"          value={factors.macro.cot} />
              <FactorRow label="Retail"       value={factors.macro.retail} />
              <FactorRow label="Saisonnalité" value={factors.macro.seasonality} />
              <FactorRow label="Macro"        value={factors.macro.macro} />
              <FactorRow label="Régime"       value={factors.macro.regime} />
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Divergences ─────────────────────────────────────────────────────── */}
      {divergences.length > 0 && (
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #1c1c38" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            ⚠ Divergences détectées
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
            {divergences.map(d => (
              <li key={d} style={{ fontSize: 11, color: "#94a3b8" }}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Résumé ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          📋 Résumé auto
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{resume}</p>
      </div>

    </div>
  );
}
