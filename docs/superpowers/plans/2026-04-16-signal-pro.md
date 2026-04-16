# Signal PRO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un panel Signal PRO sous la page Signal existante, fusionnant les données ELTE SMART (techniques) avec les données MacroMetrics (COT, retail, saisonnalité, régime) pour produire un signal institutionnel enrichi BUY/SELL/NEUTRAL.

**Architecture:** Les métriques techniques viennent de `ElteSmartDashboard` (enrichissement de `DashMetrics`). Les données macro viennent des endpoints existants `/api/signal-analysis` et `/api/market-regime`. La fusion se fait dans `lib/signal-pro.ts` (fonctions pures) et le rendu dans `components/SignalProPanel.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS-in-JS inline styles (cohérent avec le reste du projet).

---

## Fichiers créés / modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `lib/signal-pro.ts` | **Créer** | Fonctions pures : scoring, confidence, horizon, divergences, résumé |
| `components/ElteSmartDashboard.tsx` | **Modifier** | Étendre `DashMetrics` + passer les nouveaux champs via `onMetrics` |
| `components/SignalProPanel.tsx` | **Créer** | UI + fetch macro + appel aux fonctions de `lib/signal-pro.ts` |
| `app/signal/page.tsx` | **Modifier** | Ajouter `<SignalProPanel>` sous la zone chart |

---

## Task 1 : Créer `lib/signal-pro.ts` — fonctions pures de scoring

**Files:**
- Create: `lib/signal-pro.ts`

- [ ] **Step 1 : Créer le fichier avec tous les types et fonctions**

```typescript
// lib/signal-pro.ts
// Fonctions pures de scoring Signal PRO — aucune dépendance UI ou réseau.

import type { PairSignal } from "@/app/api/signal-analysis/route";
import type { RegimeType }  from "@/lib/market-regime";
import type { DashMetrics } from "@/components/ElteSmartDashboard";

// ── Types publics ──────────────────────────────────────────────────────────────

export interface TechnicalFactors {
  supertrend:   string;
  macd:         string;
  ema200:       string;
  tfConsensus:  string;
  volume:       string;
  volatility:   string;
  momentum:     string;
  sensitivity:  number;
}

export interface MacroFactors {
  cot:          string;
  retail:       string;
  seasonality:  string;
  macro:        string;
  regime:       string;
}

export interface SignalProResult {
  pair:           string;
  signal:         "BUY" | "SELL" | "NEUTRAL";
  confidence:     number;
  confLevel:      "HIGH" | "MEDIUM" | "LOW";
  horizon:        string;
  technicalScore: number;
  macroScore:     number;
  signalProScore: number;
  factors: {
    technical: TechnicalFactors;
    macro:     MacroFactors;
  };
  divergences: string[];
  resume:      string;
}

// ── Technical Score (0–100) ───────────────────────────────────────────────────
// High score = signaux bullish forts. Low score = signaux bearish forts.

export function computeTechnicalScore(metrics: DashMetrics): number {
  let score = 0;

  // Supertrend direction (20 pts)
  score += metrics.position === "Buy" ? 20 : 0;

  // Multi-TF EMA200 consensus (20 pts)
  const validTFs  = metrics.tfBulls.filter(b => b !== null);
  const bullCount = metrics.tfBulls.filter(b => b === true).length;
  const total     = validTFs.length || 1;
  score += Math.round((bullCount / total) * 20);

  // EMA200 trend sur le TF courant (15 pts)
  score += metrics.trend === "Bullish" ? 15 : 0;

  // Trend strength % (15 pts)
  score += Math.min(15, Math.round((metrics.trendStrength / 100) * 15));

  // Momentum MACD (10 pts)
  score += metrics.momentum === "Bullish" ? 10 : 0;

  // Volume confirmation (10 pts)
  score += metrics.volume === "Bullish" ? 10 : 0;

  // Volatility state (5 pts)
  score += (metrics.volatility.includes("Expanding") || metrics.volatility.includes("Trending")) ? 5 : 2;

  // Sensitivity proxy ADX (5 pts)
  score += metrics.sensitivity >= 3.5 ? 5 : metrics.sensitivity >= 3.0 ? 3 : 1;

  return Math.min(100, score);
}

// ── Macro Score (0–100) ───────────────────────────────────────────────────────
// High score = macro favorable à la hausse. Low score = macro favorable à la baisse.
// Neutre ~50 par construction.

export function computeMacroScore(
  pairSignal: PairSignal | null,
  regime:     RegimeType | null,
): number {
  if (!pairSignal) return 50;

  let score = 0;
  const { institutional, fundamental, sentiment, seasonality } = pairSignal;

  // COT institutionnel (30 pts)
  // Bullish → fort, Neutral → mi-chemin, Bearish → 0
  const cotMag = Math.min(30, Math.round((institutional.strengthPct / 100) * 30));
  if      (institutional.bias === "Bullish") score += cotMag;
  else if (institutional.bias === "Neutral") score += 15;
  // Bearish → 0

  // Retail contrarian MyFXBook (25 pts)
  // Retail très short (< 35%) → bullish contrarien → +25
  // Retail très long  (> 65%) → bearish contrarien → 0
  const longPct = sentiment.longPct;
  if      (longPct < 35) score += 25;
  else if (longPct < 45) score += 18;
  else if (longPct < 55) score += 12;
  else if (longPct < 65) score += 6;
  else                   score += 0;

  // Surprises macro TradingView (20 pts)
  const fundMag = Math.min(20, Math.round((Math.abs(fundamental.netScore) / 5) * 20));
  if      (fundamental.bias === "Bullish") score += fundMag;
  else if (fundamental.bias === "Neutral") score += 10;
  // Bearish → 0

  // Saisonnalité (15 pts)
  if      (seasonality.bias === "Bullish") score += 15;
  else if (seasonality.bias === "Neutral") score += 7;
  // Bearish → 0

  // Market Regime (10 pts)
  if      (regime === "RISK_ON")    score += 10;
  else if (regime === "MIXED")      score += 5;
  else if (regime === "TRANSITION") score += 3;
  // RISK_OFF → 0

  return Math.min(100, score);
}

// ── Confidence (0–100) ────────────────────────────────────────────────────────

export function computeConfidence(
  metrics:        DashMetrics,
  technicalScore: number,
  macroScore:     number,
): number {
  let conf = 0;

  // Cohérence technique — écart par rapport au neutre 50 (0–25 pts)
  const techDev = Math.abs(technicalScore - 50) / 50;
  conf += Math.round(techDev * 25);

  // Cohérence macro — écart par rapport au neutre 50 (0–25 pts)
  const macroDev = Math.abs(macroScore - 50) / 50;
  conf += Math.round(macroDev * 25);

  // Accord technique ↔ macro (0–25 pts)
  const techDir  = technicalScore >= 50 ? 1 : -1;
  const macroDir = macroScore     >= 50 ? 1 : -1;
  if (techDir === macroDir) conf += 25;

  // Intensité — consensus TF + trend strength (0–25 pts)
  const validTFs  = metrics.tfBulls.filter(b => b !== null);
  const bullCount = metrics.tfBulls.filter(b => b === true).length;
  const tfTotal   = validTFs.length || 1;
  const tfDev     = Math.abs((bullCount / tfTotal) - 0.5) / 0.5; // 0→1
  const intensity = Math.round((tfDev * 0.6 + (metrics.trendStrength / 100) * 0.4) * 25);
  conf += Math.min(25, intensity);

  return Math.min(100, conf);
}

// ── Horizon ───────────────────────────────────────────────────────────────────

export function computeHorizon(
  technicalScore: number,
  macroScore:     number,
  pairSignal:     PairSignal | null,
): string {
  const cotDominant = pairSignal
    ? Math.abs(pairSignal.institutional.base.zScore - pairSignal.institutional.quote.zScore) > 2
    : false;

  if (technicalScore > 70 && macroScore < 50)              return "Intraday (< 24h)";
  if (macroScore > 65 && cotDominant)                       return "Position (2–4 semaines)";
  if (technicalScore > 55 && macroScore > 55)               return "Swing (3–7 jours)";
  return "Swing (1–3 jours)";
}

// ── Divergences ───────────────────────────────────────────────────────────────

export function detectDivergences(
  metrics:    DashMetrics,
  pairSignal: PairSignal | null,
  regime:     RegimeType | null,
): string[] {
  const divs: string[] = [];
  const isTechBull = metrics.position === "Buy";

  if (!pairSignal) return divs;
  const { institutional, sentiment, seasonality } = pairSignal;

  // Supertrend vs COT
  if (isTechBull && institutional.bias === "Bearish") {
    divs.push("Supertrend haussier mais COT baissier → divergence technique/institutionnel");
  } else if (!isTechBull && institutional.bias === "Bullish") {
    divs.push("Supertrend baissier mais COT haussier → divergence technique/institutionnel");
  }

  // EMA200 vs COT
  if (metrics.trend === "Bullish" && institutional.bias === "Bearish") {
    divs.push("EMA200 haussière mais COT baissier → attention à la structure long terme");
  } else if (metrics.trend === "Bearish" && institutional.bias === "Bullish") {
    divs.push("EMA200 baissière mais COT haussier → attention à la structure long terme");
  }

  // Retail extrême
  if (sentiment.longPct > 65) {
    divs.push(`Retail ${sentiment.longPct}% long → signal contrarien baissier fort`);
  } else if (sentiment.longPct < 35) {
    divs.push(`Retail ${sentiment.longPct}% short → signal contrarien haussier fort`);
  }

  // Regime vs technical
  if (isTechBull && regime === "RISK_OFF") {
    divs.push("Supertrend haussier mais régime Risk-Off → contexte macro défavorable");
  } else if (!isTechBull && regime === "RISK_ON") {
    divs.push("Supertrend baissier mais régime Risk-On → contexte macro favorable");
  }

  // Multi-TF vs COT
  const bullCount = metrics.tfBulls.filter(b => b === true).length;
  if (bullCount >= 8 && institutional.bias === "Bearish") {
    divs.push(`${bullCount}/11 TFs haussiers mais COT institutionnel baissier → divergence majeure`);
  } else if (bullCount <= 3 && institutional.bias === "Bullish") {
    divs.push(`Seulement ${bullCount}/11 TFs haussiers mais COT haussier → divergence majeure`);
  }

  // Confirmation saisonnière
  const isSeasConfirm =
    (isTechBull && seasonality.bias === "Bullish") ||
    (!isTechBull && seasonality.bias === "Bearish");
  if (isSeasConfirm) {
    divs.push(`Saisonnalité ${seasonality.month} ${seasonality.bias} → confirmation saisonnière`);
  }

  return divs;
}

// ── Résumé automatique ────────────────────────────────────────────────────────

export function generateResume(
  signal:     "BUY" | "SELL" | "NEUTRAL",
  metrics:    DashMetrics,
  pairSignal: PairSignal | null,
  regime:     RegimeType | null,
): string {
  if (signal === "NEUTRAL") {
    return "Les signaux techniques et macro sont insuffisamment alignés pour générer un signal directionnel clair. Prudence recommandée.";
  }

  const dir = signal === "BUY" ? "haussier" : "baissier";
  const techFactors: string[]  = [];
  const macroFactors: string[] = [];

  if (metrics.position === "Buy")      techFactors.push("Supertrend");
  if (metrics.momentum === "Bullish")  techFactors.push("MACD");
  if (metrics.trend    === "Bullish")  techFactors.push("EMA200");
  const bullTFs = metrics.tfBulls.filter(b => b === true).length;
  if (bullTFs >= 7)                    techFactors.push(`${bullTFs}/11 TFs`);

  if (pairSignal) {
    if (pairSignal.institutional.bias !== "Neutral")
      macroFactors.push(`COT ${pairSignal.institutional.bias.toLowerCase()}`);
    if (pairSignal.sentiment.extreme)
      macroFactors.push("retail contrarien");
    if (pairSignal.seasonality.bias !== "Neutral")
      macroFactors.push(`saisonnalité ${pairSignal.seasonality.bias.toLowerCase()}`);
  }
  if (regime === "RISK_ON")   macroFactors.push("régime Risk-On");
  if (regime === "RISK_OFF")  macroFactors.push("régime Risk-Off");

  const techPart  = techFactors.length > 0
    ? `Les signaux techniques (${techFactors.join(", ")}) sont ${dir}s`
    : "Les signaux techniques sont partiellement alignés";
  const macroPart = macroFactors.length > 0
    ? `les signaux macro (${macroFactors.join(", ")}) confirment la direction`
    : "les signaux macro sont neutres";

  return `Signal ${dir} : ${techPart}. ${macroPart.charAt(0).toUpperCase() + macroPart.slice(1)}.`;
}

// ── Fonction principale ───────────────────────────────────────────────────────

export function computeSignalPro(
  pair:       string,
  metrics:    DashMetrics,
  pairSignal: PairSignal | null,
  regime:     RegimeType | null,
): SignalProResult {
  const technicalScore  = computeTechnicalScore(metrics);
  const macroScore      = computeMacroScore(pairSignal, regime);
  const signalProScore  = Math.round(0.55 * technicalScore + 0.45 * macroScore);

  const signal: "BUY" | "SELL" | "NEUTRAL" =
    signalProScore > 60 ? "BUY" : signalProScore < 40 ? "SELL" : "NEUTRAL";

  const confidence = computeConfidence(metrics, technicalScore, macroScore);
  const confLevel: "HIGH" | "MEDIUM" | "LOW" =
    confidence >= 65 ? "HIGH" : confidence >= 45 ? "MEDIUM" : "LOW";
  const horizon    = computeHorizon(technicalScore, macroScore, pairSignal);
  const divergences = detectDivergences(metrics, pairSignal, regime);
  const resume     = generateResume(signal, metrics, pairSignal, regime);

  const bullCount = metrics.tfBulls.filter(b => b === true).length;
  const tfValid   = metrics.tfBulls.filter(b => b !== null).length;

  return {
    pair,
    signal,
    confidence,
    confLevel,
    horizon,
    technicalScore,
    macroScore,
    signalProScore,
    factors: {
      technical: {
        supertrend:  metrics.position === "Buy" ? "Bullish" : "Bearish",
        macd:        metrics.momentum,
        ema200:      metrics.trend,
        tfConsensus: `${bullCount}/${tfValid} Bullish`,
        volume:      metrics.volume,
        volatility:  metrics.volatility.includes("Expanding") ? "Expanding"
                   : metrics.volatility.includes("Trending")  ? "Trending" : "Ranging",
        momentum:    metrics.momentum,
        sensitivity: metrics.sensitivity,
      },
      macro: {
        cot:         pairSignal?.institutional.bias ?? "N/A",
        retail:      pairSignal ? `${pairSignal.sentiment.longPct}% Long` : "N/A",
        seasonality: pairSignal?.seasonality.bias  ?? "N/A",
        macro:       pairSignal?.fundamental.bias  ?? "N/A",
        regime:      regime ?? "N/A",
      },
    },
    divergences,
    resume,
  };
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile sans erreur**

```bash
cd "C:/Users/ousma/OneDrive/Documents/claude projet/gann/macrometrics-v6"
npx tsc --noEmit 2>&1 | head -30
```

Résultat attendu : aucune erreur sur `lib/signal-pro.ts`.

- [ ] **Step 3 : Commit**

```bash
git add lib/signal-pro.ts
git commit -m "feat(signal-pro): add pure scoring functions in lib/signal-pro.ts"
```

---

## Task 2 : Étendre `DashMetrics` dans `ElteSmartDashboard.tsx`

**Files:**
- Modify: `components/ElteSmartDashboard.tsx`

- [ ] **Step 1 : Mettre à jour l'interface `DashMetrics` (ligne ~247)**

Remplacer :
```typescript
export interface DashMetrics {
  trend:      string;
  volume:     string;
  momentum:   string;
  volatility: string;
  barsSince:  number;
}
```

Par :
```typescript
export interface DashMetrics {
  trend:         string;
  volume:        string;
  momentum:      string;
  volatility:    string;
  barsSince:     number;
  // Signal PRO enrichment
  position:      "Buy" | "Sell";
  sensitivity:   number;
  trendStrength: number;
  tfBulls:       (boolean | null)[];
}
```

- [ ] **Step 2 : Mettre à jour l'appel `onMetrics` dans le `useEffect` principal (ligne ~276)**

Remplacer :
```typescript
if (result && onMetrics) {
  onMetrics({
    trend:      result.trend,
    volume:     result.volume,
    momentum:   result.momentum,
    volatility: result.volatility,
    barsSince:  result.barsSince,
  });
}
```

Par :
```typescript
if (result && onMetrics) {
  onMetrics({
    trend:         result.trend,
    volume:        result.volume,
    momentum:      result.momentum,
    volatility:    result.volatility,
    barsSince:     result.barsSince,
    position:      result.position,
    sensitivity:   result.sensitivity,
    trendStrength: result.trendStrength,
    tfBulls:       TF_DASH.map(() => null), // sera mis à jour par fetchMultiTF
  });
}
```

- [ ] **Step 3 : Propager `tfBulls` mis à jour via un second appel `onMetrics`**

Dans la fonction `updateTfBulls` (à l'intérieur de `fetchMultiTF`, après `setTfBulls`), ajouter :

```typescript
const updateTfBulls = (srcKey: string, data: Candle[]) => {
  cache[srcKey] = data;
  setTfBulls(prev => {
    const next = [...prev];
    TF_DASH.forEach((tf, i) => {
      const key = `${tf.src}|${tf.range}`;
      if (key === srcKey && cache[key]) {
        const aggregated = aggregateCandles(cache[key], tf.factor);
        next[i] = ema200Bull(aggregated);
      }
    });
    // Propager tfBulls mis à jour vers Signal PRO
    if (onMetrics && dash) {
      onMetrics({
        trend:         dash.trend,
        volume:        dash.volume,
        momentum:      dash.momentum,
        volatility:    dash.volatility,
        barsSince:     dash.barsSince,
        position:      dash.position,
        sensitivity:   dash.sensitivity,
        trendStrength: dash.trendStrength,
        tfBulls:       next,
      });
    }
    return next;
  });
};
```

Note : `dash` et `onMetrics` sont déjà dans le scope de `fetchMultiTF` via la closure — `onMetrics` vient des props, `dash` vient du state.

- [ ] **Step 4 : Vérifier que TypeScript compile sans erreur**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5 : Commit**

```bash
git add components/ElteSmartDashboard.tsx
git commit -m "feat(signal-pro): enrich DashMetrics with position, sensitivity, trendStrength, tfBulls"
```

---

## Task 3 : Créer `components/SignalProPanel.tsx`

**Files:**
- Create: `components/SignalProPanel.tsx`

- [ ] **Step 1 : Créer le composant complet**

```typescript
// components/SignalProPanel.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { computeSignalPro }  from "@/lib/signal-pro";
import type { SignalProResult } from "@/lib/signal-pro";
import type { DashMetrics }  from "@/components/ElteSmartDashboard";
import type { PairSignal }   from "@/app/api/signal-analysis/route";
import type { RegimeType }   from "@/lib/market-regime";
import type { MarketRegimeResponse } from "@/app/api/market-regime/route";

interface Props {
  yfSymbol:  string;
  pairLabel: string;  // ex: "EUR/USD"
  tfLabel:   string;
  metrics:   DashMetrics | null;
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

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
          fontSize: 10, fontWeight: 700,
          color, background: `${color}22`,
          border: `1px solid ${color}44`,
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
        <div style={{
          height: "100%", width: `${score}%`,
          background: color, borderRadius: 3,
        }} />
      </div>
    </div>
  );
}

function Bullet({ value, neutral }: { value: string; neutral?: boolean }) {
  const isBull = value.toLowerCase().includes("bull") || value === "Buy" || value === "Confirming" || value === "Trending" || value === "Expanding";
  const isBear = value.toLowerCase().includes("bear") || value === "Sell" || value.includes("Bearish");
  const color  = neutral ? "#64748b" : isBull ? "#22c55e" : isBear ? "#ef4444" : "#64748b";
  return (
    <span style={{ fontSize: 11, color, fontWeight: 700 }}>
      ● {value}
    </span>
  );
}

function FactorRow({ label, value, neutral }: { label: string; value: string | number; neutral?: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid #0d0d1a" }}>
      <td style={{ padding: "5px 0", fontSize: 11, color: "#64748b", paddingRight: 12 }}>{label}</td>
      <td style={{ textAlign: "right", padding: "5px 0" }}>
        {typeof value === "number"
          ? <span style={{ fontSize: 11, color: "#f0c84a", fontFamily: "monospace" }}>{value}</span>
          : <Bullet value={value} neutral={neutral} />}
      </td>
    </tr>
  );
}

function Skeleton() {
  return (
    <div style={{
      background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12,
      padding: 20, display: "flex", flexDirection: "column", gap: 12,
    }}>
      {[180, 80, 120, 100].map((w, i) => (
        <div key={i} style={{
          height: 16, width: `${w}px`, maxWidth: "100%",
          background: "#1c1c38", borderRadius: 6,
          animation: "pulse 1.5s ease-in-out infinite",
        }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalProPanel({ yfSymbol, pairLabel, tfLabel, metrics }: Props) {
  const [pairSignal, setPairSignal] = useState<PairSignal | null>(null);
  const [regime,     setRegime]     = useState<RegimeType | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const fetchMacro = useCallback(async () => {
    setLoading(true);
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
      }

      if (rgRes.ok) {
        const rgData: MarketRegimeResponse = await rgRes.json();
        setRegime((rgData.snapshot?.regime ?? null) as RegimeType | null);
      }

      setLastRefresh(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setLoading(false);
    }
  }, [pairLabel]);

  // Refetch quand la paire change
  useEffect(() => { fetchMacro(); }, [fetchMacro]);

  // Si on n'a pas encore les métriques ELTE SMART, afficher skeleton
  if (!metrics) return <Skeleton />;

  const result: SignalProResult | null = loading
    ? null
    : computeSignalPro(pairLabel, metrics, pairSignal, regime);

  if (!result) return <Skeleton />;

  const { signal, confidence, confLevel, horizon, technicalScore, macroScore,
          signalProScore, factors, divergences, resume } = result;

  const signalColor = signal === "BUY" ? "#22c55e" : signal === "SELL" ? "#ef4444" : "#64748b";

  return (
    <div style={{
      background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 12,
      overflow: "hidden", marginTop: 0,
    }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 18px", borderBottom: "1px solid #1c1c38",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
            ⚡ SIGNAL PRO
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {pairLabel} · {tfLabel}
          </span>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: "#334155" }}>mis à jour {lastRefresh}</span>
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
        padding: "16px 18px", borderBottom: "1px solid #1c1c38",
        alignItems: "center",
      }}>

        {/* Direction */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <SignalBadge signal={signal} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Score Pro</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: signalColor }}>
              {signalProScore}
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ConfidenceGauge value={confidence} level={confLevel} />
          <ScoreBar score={technicalScore} label="Technical" />
          <ScoreBar score={macroScore}     label="Macro" />
        </div>

        {/* Horizon */}
        <div style={{
          background: "#10101e", border: "1px solid #1c1c38", borderRadius: 8,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
            Horizon
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{horizon}</div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>
            Probabilité historique
          </div>
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
              <FactorRow label="TF Consensus"  value={factors.technical.tfConsensus} neutral />
              <FactorRow label="Volume"        value={factors.technical.volume} />
              <FactorRow label="Volatilité"    value={factors.technical.volatility} neutral />
              <FactorRow label="Momentum"      value={factors.technical.momentum} />
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
              <FactorRow label="Retail"       value={factors.macro.retail} neutral />
              <FactorRow label="Saisonnalité" value={factors.macro.seasonality} />
              <FactorRow label="Macro"        value={factors.macro.macro} />
              <FactorRow label="Régime"       value={factors.macro.regime} neutral />
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
            {divergences.map((d, i) => (
              <li key={i} style={{ fontSize: 11, color: "#94a3b8" }}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Résumé auto ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          📋 Résumé auto
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{resume}</p>
      </div>

    </div>
  );
}
```

- [ ] **Step 2 : Vérifier que TypeScript compile sans erreur**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3 : Commit**

```bash
git add components/SignalProPanel.tsx
git commit -m "feat(signal-pro): add SignalProPanel component"
```

---

## Task 4 : Intégrer `SignalProPanel` dans `app/signal/page.tsx`

**Files:**
- Modify: `app/signal/page.tsx`

- [ ] **Step 1 : Ajouter l'import dynamique (avec les autres imports lazy en haut du fichier)**

Après les imports existants de `dynamic`, ajouter :

```typescript
const SignalProPanel = dynamic(() => import("@/components/SignalProPanel"), { ssr: false });
```

- [ ] **Step 2 : Ajouter `<SignalProPanel>` sous `<SignalMonitorPanel>`**

Juste avant la div `Note` en bas du return, ajouter :

```tsx
{/* ── Signal PRO ──────────────────────────────────────────────────── */}
<SignalProPanel
  key={`pro-${sym.yf}-${tf.label}`}
  yfSymbol={sym.yf}
  pairLabel={sym.label}
  tfLabel={tf.label}
  metrics={metricsRef.current}
/>
```

Note : `metricsRef.current` est déjà disponible dans le composant. Mais comme c'est une ref (pas un state), le panel ne se re-rendra pas automatiquement. Il faut exposer les métriques comme state.

- [ ] **Step 3 : Exposer les métriques comme state (pour déclencher le re-render)**

Dans `SignalPage`, ajouter un state pour les métriques enrichies :

```typescript
const [proMetrics, setProMetrics] = useState<DashMetrics | null>(null);
```

Importer `DashMetrics` en haut :
```typescript
import type { DashMetrics } from "@/components/ElteSmartDashboard";
```

Mettre à jour `handleMetrics` pour aussi setter le state :
```typescript
const handleMetrics = useCallback((m: DashMetrics) => {
  metricsRef.current = m;
  setProMetrics(m);   // ← ajouter cette ligne
  if (sigDataRef.current) {
    rebuildTgSignal(sigDataRef.current.sig, sigDataRef.current.params, m, sym.label, tf.label);
  }
}, [sym.label, tf.label, rebuildTgSignal]);
```

Mettre à jour le prop dans `SignalProPanel` :
```tsx
<SignalProPanel
  key={`pro-${sym.yf}-${tf.label}`}
  yfSymbol={sym.yf}
  pairLabel={sym.label}
  tfLabel={tf.label}
  metrics={proMetrics}
/>
```

Réinitialiser `proMetrics` quand on change de paire (dans les boutons paire) :
```typescript
onClick={() => { setSymIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); setProMetrics(null); }}
```

Et quand on change de timeframe :
```typescript
onClick={() => { setTfIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); setProMetrics(null); }}
```

- [ ] **Step 4 : Vérifier que TypeScript compile sans erreur**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5 : Commit**

```bash
git add app/signal/page.tsx
git commit -m "feat(signal-pro): wire SignalProPanel into signal page"
```

---

## Task 5 : Vérification manuelle + push + deploy

- [ ] **Step 1 : Lancer le serveur de dev et vérifier le rendu**

```bash
npm run dev
```

Ouvrir `http://localhost:3000/signal`. Vérifier :
- Le panel Signal PRO apparaît sous `SignalMonitorPanel`
- Le signal BUY/SELL/NEUTRAL s'affiche avec la bonne couleur
- La gauge de confidence est visible
- Le breakdown Technical/Macro affiche des valeurs
- Les divergences s'affichent si pertinentes
- Le résumé auto est cohérent
- Changer de paire → le panel se réinitialise puis recalcule

- [ ] **Step 2 : Vérifier qu'il n'y a pas d'erreurs dans la console**

Ouvrir DevTools → Console. Aucune erreur TypeScript ou runtime.

- [ ] **Step 3 : Push sur la branche**

```bash
git push origin feature/market-regime-detector
```

- [ ] **Step 4 : Déployer sur Vercel**

```bash
npx vercel --prod
```

Ou via le dashboard Vercel si la branche est configurée pour auto-deploy.

- [ ] **Step 5 : Vérifier le déploiement en production**

Ouvrir l'URL Vercel de production → `/signal` → confirmer que le panel Signal PRO s'affiche correctement en prod.

---

## Récapitulatif des commits

```
feat(signal-pro): add pure scoring functions in lib/signal-pro.ts
feat(signal-pro): enrich DashMetrics with position, sensitivity, trendStrength, tfBulls
feat(signal-pro): add SignalProPanel component
feat(signal-pro): wire SignalProPanel into signal page
```
