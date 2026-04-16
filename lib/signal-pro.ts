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
  score += metrics.volatility !== "Ranging" ? 5 : 2;

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
  const cotMag = Math.min(30, Math.round((institutional.strengthPct / 100) * 30));
  if      (institutional.bias === "Bullish") score += cotMag;
  else if (institutional.bias === "Neutral") score += 15;
  // Bearish → 0

  // Retail contrarian MyFXBook (25 pts)
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
  const tfDev     = Math.abs((bullCount / tfTotal) - 0.5) / 0.5;
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

  if (technicalScore > 70 && macroScore < 50)  return "Intraday (< 24h)";
  if (macroScore > 65 && cotDominant)           return "Position (2–4 semaines)";
  if (technicalScore > 55 && macroScore > 55)   return "Swing (3–7 jours)";
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

  if (isTechBull && institutional.bias === "Bearish")
    divs.push("Supertrend haussier mais COT baissier → divergence technique/institutionnel");
  else if (!isTechBull && institutional.bias === "Bullish")
    divs.push("Supertrend baissier mais COT haussier → divergence technique/institutionnel");

  if (metrics.trend === "Bullish" && institutional.bias === "Bearish")
    divs.push("EMA200 haussière mais COT baissier → attention à la structure long terme");
  else if (metrics.trend === "Bearish" && institutional.bias === "Bullish")
    divs.push("EMA200 baissière mais COT haussier → attention à la structure long terme");

  if (sentiment.longPct > 65)
    divs.push(`Retail ${sentiment.longPct}% long → signal contrarien baissier fort`);
  else if (sentiment.longPct < 35)
    divs.push(`Retail ${sentiment.longPct}% short → signal contrarien haussier fort`);

  if (isTechBull && regime === "RISK_OFF")
    divs.push("Supertrend haussier mais régime Risk-Off → contexte macro défavorable");
  else if (!isTechBull && regime === "RISK_ON")
    divs.push("Supertrend baissier mais régime Risk-On → contexte macro favorable");

  const bullCount = metrics.tfBulls.filter(b => b === true).length;
  const tfValid   = metrics.tfBulls.filter(b => b !== null).length || 1;
  const highThreshold = Math.round(tfValid * 0.73);
  const lowThreshold  = Math.round(tfValid * 0.27);

  if (bullCount >= highThreshold && institutional.bias === "Bearish")
    divs.push(`${bullCount}/${tfValid} TFs haussiers mais COT institutionnel baissier → divergence majeure`);
  else if (bullCount <= lowThreshold && institutional.bias === "Bullish")
    divs.push(`Seulement ${bullCount}/${tfValid} TFs haussiers mais COT haussier → divergence majeure`);

  const isSeasConfirm =
    (isTechBull && seasonality.bias === "Bullish") ||
    (!isTechBull && seasonality.bias === "Bearish");
  if (isSeasConfirm)
    divs.push(`Saisonnalité ${seasonality.month} ${seasonality.bias} → confirmation saisonnière`);

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

  const isBuy = signal === "BUY";

  if (isBuy) {
    if (metrics.position === "Buy")     techFactors.push("Supertrend");
    if (metrics.momentum === "Bullish") techFactors.push("MACD");
    if (metrics.trend    === "Bullish") techFactors.push("EMA200");
    const bullTFs = metrics.tfBulls.filter(b => b === true).length;
    if (bullTFs >= 7)                   techFactors.push(`${bullTFs}/11 TFs`);
  } else {
    if (metrics.position === "Sell")    techFactors.push("Supertrend");
    if (metrics.momentum === "Bearish") techFactors.push("MACD");
    if (metrics.trend    === "Bearish") techFactors.push("EMA200");
    const bearTFs = metrics.tfBulls.filter(b => b === false).length;
    if (bearTFs >= 7)                   techFactors.push(`${bearTFs}/11 TFs`);
  }

  if (pairSignal) {
    if (pairSignal.institutional.bias !== "Neutral")
      macroFactors.push(`COT ${pairSignal.institutional.bias.toLowerCase()}`);
    if (pairSignal.sentiment.extreme)
      macroFactors.push("retail contrarien");
    if (pairSignal.seasonality.bias !== "Neutral")
      macroFactors.push(`saisonnalité ${pairSignal.seasonality.bias.toLowerCase()}`);
  }
  if (isBuy && regime === "RISK_ON")   macroFactors.push("régime Risk-On");
  if (!isBuy && regime === "RISK_OFF") macroFactors.push("régime Risk-Off");

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

  const confidence  = computeConfidence(metrics, technicalScore, macroScore);
  const confLevel: "HIGH" | "MEDIUM" | "LOW" =
    confidence >= 65 ? "HIGH" : confidence >= 45 ? "MEDIUM" : "LOW";
  const horizon     = computeHorizon(technicalScore, macroScore, pairSignal);
  const divergences = detectDivergences(metrics, pairSignal, regime);
  const resume      = generateResume(signal, metrics, pairSignal, regime);

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
        volatility:  metrics.volatility === "Ranging" ? "Ranging"
                   : metrics.volatility === "Trending 📈" ? "Trending" : "Expanding",
        sensitivity: metrics.sensitivity,
      },
      macro: {
        cot:         pairSignal?.institutional.bias ?? "N/A",
        retail:      pairSignal
          ? (pairSignal.sentiment.longPct < 35 ? "Contrarian Bull"
            : pairSignal.sentiment.longPct > 65 ? "Contrarian Bear"
            : `${pairSignal.sentiment.longPct}% Long`)
          : "N/A",
        seasonality: pairSignal?.seasonality.bias  ?? "N/A",
        macro:       pairSignal?.fundamental.bias  ?? "N/A",
        regime:      regime ?? "N/A",
      },
    },
    divergences,
    resume,
  };
}
