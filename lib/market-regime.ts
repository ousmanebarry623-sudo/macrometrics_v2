// Market Regime Detector — Core scoring, classification, and divergence logic

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegimeType = "RISK_ON" | "MIXED" | "TRANSITION" | "RISK_OFF";

export interface RegimeSnapshot {
  ts:           number;
  composite:    number;   // 0–100, high = Risk-On
  regime:       RegimeType;
  confidence:   number;   // 0–100 (higher = more agreement between indicators)
  // Sub-scores (all 0–100, high = Risk-On)
  vixScore:     number;
  equityScore:  number;
  usdScore:     number;
  optionsScore: number;
  newsScore:    number;
  // Raw values
  vix:           number | null;
  sp500Change1w: number | null;  // % weekly return
  dxyChange1w:   number | null;
  skew:          number | null;
  fearGreed:     number | null;
  // Signals
  divergences: string[];
}

export interface IndicatorMeta {
  label:       string;
  description: string;
  weight:      number;  // % weight in composite
  interpretation: string;
  impact:      "HIGH" | "MEDIUM" | "LOW";
}

// ── Regime configuration ──────────────────────────────────────────────────────

export const REGIME_CONFIG: Record<RegimeType, {
  label:       string;
  color:       string;
  bg:          string;
  border:      string;
  emoji:       string;
  scoreRange:  [number, number];
  description: string;
  favorites:   string;
}> = {
  RISK_ON: {
    label:      "Risk-On",
    color:      "#22c55e",
    bg:         "rgba(34,197,94,0.12)",
    border:     "rgba(34,197,94,0.35)",
    emoji:      "🟢",
    scoreRange: [60, 100],
    description: "Appétit pour le risque élevé. VIX bas, actions haussières, sentiment positif.",
    favorites:  "Actions · Crypto · EM · Carry trades (AUD, NZD, EUR) · Short USD/JPY",
  },
  MIXED: {
    label:      "Mixed",
    color:      "#3b82f6",
    bg:         "rgba(59,130,246,0.12)",
    border:     "rgba(59,130,246,0.3)",
    emoji:      "🔵",
    scoreRange: [45, 60],
    description: "Signaux contradictoires. Pas de consensus clair entre volatilité, actions et sentiment.",
    favorites:  "Sélectivité recommandée · Favoriser les actifs défensifs de qualité",
  },
  TRANSITION: {
    label:      "Transition",
    color:      "#f97316",
    bg:         "rgba(249,115,22,0.12)",
    border:     "rgba(249,115,22,0.3)",
    emoji:      "🟠",
    scoreRange: [25, 45],
    description: "Changement de régime potentiel. Surveiller les ruptures et les divergences.",
    favorites:  "Or · Obligations court terme · Réduire les positions à risque",
  },
  RISK_OFF: {
    label:      "Risk-Off",
    color:      "#ef4444",
    bg:         "rgba(239,68,68,0.12)",
    border:     "rgba(239,68,68,0.3)",
    emoji:      "🔴",
    scoreRange: [0, 25],
    description: "Aversion au risque. VIX élevé, actions baissières, fuite vers la sécurité.",
    favorites:  "USD · JPY · Or · Treasuries · Short Equities · Short AUD/USD",
  },
};

export const INDICATOR_META: Record<string, IndicatorMeta> = {
  vix: {
    label: "VIX",
    description: "Volatilité implicite S&P500 (CBOE)",
    weight: 30,
    interpretation: "Score élevé = VIX bas = calme = Risk-On (inversé)",
    impact: "HIGH",
  },
  equity: {
    label: "S&P500",
    description: "Momentum 1 semaine du S&P500",
    weight: 25,
    interpretation: "Score élevé = actions haussières sur 5 jours",
    impact: "HIGH",
  },
  usd: {
    label: "DXY",
    description: "Dollar Index — retour 1 semaine",
    weight: 20,
    interpretation: "Score élevé = DXY faible = Risk-On (inversé)",
    impact: "MEDIUM",
  },
  options: {
    label: "CBOE SKEW",
    description: "Indice de risque de queue options S&P500",
    weight: 15,
    interpretation: "Score élevé = SKEW bas = faible protection put = Risk-On (inversé)",
    impact: "MEDIUM",
  },
  news: {
    label: "Fear & Greed",
    description: "Indice CNN Fear & Greed (sentiment global)",
    weight: 10,
    interpretation: "Score élevé = euphorie = Risk-On (attention : signal contrarien à l'extrême)",
    impact: "LOW",
  },
};

// ── Math utilities ────────────────────────────────────────────────────────────

export function percentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 50;
  const below = history.filter(v => v <= value).length;
  return Math.round((below / history.length) * 100);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── Weekly return helpers ─────────────────────────────────────────────────────

export function currentWeeklyReturn(closes: number[]): number | null {
  if (closes.length < 6) return null;
  const cur = closes[closes.length - 1];
  const ago = closes[closes.length - 6];
  if (!ago || ago === 0) return null;
  return ((cur - ago) / ago) * 100;
}

export function rollingWeeklyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 5; i < closes.length - 1; i++) { // exclude last (current)
    if (closes[i - 5] === 0) continue;
    returns.push(((closes[i] - closes[i - 5]) / closes[i - 5]) * 100);
  }
  return returns;
}

// ── Classification ────────────────────────────────────────────────────────────

export function classifyRegime(score: number): RegimeType {
  if (score >= 60) return "RISK_ON";
  if (score >= 45) return "MIXED";
  if (score >= 25) return "TRANSITION";
  return "RISK_OFF";
}

// Confidence = inversely proportional to spread between sub-scores
// Low spread (consensus) = high confidence; high spread (divergence) = low confidence
export function computeConfidence(scores: number[]): number {
  const sd = stdDev(scores);
  // Max possible std-dev for 0-100 values ≈ 50; map to 0-100 confidence
  return Math.max(0, Math.round(100 - (sd / 50) * 100));
}

// ── Divergence detection ──────────────────────────────────────────────────────

export function detectDivergences(
  vixScore:     number,
  equityScore:  number,
  usdScore:     number,
  optionsScore: number,
  newsScore:    number,
): string[] {
  const divs: string[] = [];

  // Classic: VIX up but equities not crashing
  if (vixScore < 35 && equityScore > 60)
    divs.push("VIX élevé mais S&P500 résistant — volatilité sans baisse");

  // Equity down but no fear in VIX
  if (equityScore < 35 && vixScore > 65)
    divs.push("Baisse des actions sans hausse du VIX — correction ordonnée");

  // Dollar strength coexisting with equity strength (unusual late-cycle)
  if (usdScore < 30 && equityScore > 70)
    divs.push("Dollar fort + actions haussières — régime late-cycle inhabituel");

  // Options vs news divergence (protective puts bought but news still positive)
  if (optionsScore < 35 && newsScore > 65)
    divs.push("Protection options élevée malgré sentiment positif — couverture institutionnelle");

  // Risk-Off across vol/equity/USD but sentiment still complacent
  const riskOffCount = [vixScore, equityScore, usdScore].filter(s => s < 35).length;
  if (riskOffCount >= 2 && newsScore > 65)
    divs.push("Signaux Risk-Off multiples mais sentiment encore optimiste — retournement imminent ?");

  // Broad Risk-On but options heavily hedged
  if (equityScore > 70 && vixScore > 65 && optionsScore < 35)
    divs.push("Momentum positif avec forte protection options — marché fragile");

  return divs;
}

// ── Composite score ───────────────────────────────────────────────────────────

export const WEIGHTS = {
  vix:     0.30,
  equity:  0.25,
  usd:     0.20,
  options: 0.15,
  news:    0.10,
} as const;

export function computeComposite(
  vixScore:     number,
  equityScore:  number,
  usdScore:     number,
  optionsScore: number,
  newsScore:    number,
): number {
  return Math.round(
    vixScore     * WEIGHTS.vix     +
    equityScore  * WEIGHTS.equity  +
    usdScore     * WEIGHTS.usd     +
    optionsScore * WEIGHTS.options +
    newsScore    * WEIGHTS.news,
  );
}
