// ── TradingEconomics shared lib ────────────────────────────────────────────────
// Uses TE_API_KEY env var. Falls back to curated static data if unavailable.
// API docs: https://docs.tradingeconomics.com

export const TE_BASE = "https://api.tradingeconomics.com";
export const TE_TTL  = 4 * 60 * 60 * 1000; // 4h cache

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CountryMacro {
  code:         string;   // ISO "US" "EU" "GB" etc.
  country:      string;   // Display name
  flag:         string;   // emoji
  currency:     string;   // "USD" "EUR" etc.
  rate:         number | null;
  inflation:    number | null;
  coreInflation:number | null;
  unemployment: number | null;
  gdpGrowth:    number | null;
  tradeBalance: number | null;
  sentiment:    number | null;
  debtToGdp:    number | null;
  score:        number;   // 0–100 macro strength
  trend:        "strong" | "moderate" | "weak" | "risk";
  source:       "live" | "fallback";
}

export interface CentralBank {
  name:        string;
  country:     string;
  flag:        string;
  currency:    string;
  currentRate: number;
  lastChange:  string;   // date string
  nextMeeting: string;   // date string
  forecast:    number | null;
  bias:        "hawkish" | "neutral" | "dovish";
  probability: { hike: number; hold: number; cut: number };
}

// ── G8 + G10 countries ────────────────────────────────────────────────────────
export const MACRO_COUNTRIES: CountryMacro[] = [
  { code:"US", country:"United States", flag:"🇺🇸", currency:"USD", rate:5.50, inflation:3.2, coreInflation:3.8, unemployment:3.9, gdpGrowth:2.1,  tradeBalance:-68.2, sentiment:79.2, debtToGdp:123.4, score:0, trend:"moderate", source:"fallback" },
  { code:"EU", country:"Euro Area",     flag:"🇪🇺", currency:"EUR", rate:4.25, inflation:2.6, coreInflation:2.9, unemployment:6.2, gdpGrowth:0.4,  tradeBalance:15.2,  sentiment:95.5, debtToGdp:88.6,  score:0, trend:"moderate", source:"fallback" },
  { code:"GB", country:"United Kingdom",flag:"🇬🇧", currency:"GBP", rate:5.25, inflation:3.4, coreInflation:4.2, unemployment:4.2, gdpGrowth:0.1,  tradeBalance:-14.5, sentiment:49.0, debtToGdp:98.2,  score:0, trend:"weak",     source:"fallback" },
  { code:"JP", country:"Japan",         flag:"🇯🇵", currency:"JPY", rate:0.10, inflation:2.4, coreInflation:2.2, unemployment:2.4, gdpGrowth:0.4,  tradeBalance:-9.7,  sentiment:38.0, debtToGdp:261.3, score:0, trend:"weak",     source:"fallback" },
  { code:"CA", country:"Canada",        flag:"🇨🇦", currency:"CAD", rate:4.75, inflation:2.9, coreInflation:3.1, unemployment:6.2, gdpGrowth:1.2,  tradeBalance:0.3,   sentiment:52.0, debtToGdp:106.4, score:0, trend:"moderate", source:"fallback" },
  { code:"AU", country:"Australia",     flag:"🇦🇺", currency:"AUD", rate:4.35, inflation:3.6, coreInflation:3.9, unemployment:4.1, gdpGrowth:2.1,  tradeBalance:10.5,  sentiment:84.0, debtToGdp:55.3,  score:0, trend:"moderate", source:"fallback" },
  { code:"NZ", country:"New Zealand",   flag:"🇳🇿", currency:"NZD", rate:5.50, inflation:4.7, coreInflation:3.3, unemployment:4.0, gdpGrowth:-0.3, tradeBalance:-0.8,  sentiment:95.0, debtToGdp:38.5,  score:0, trend:"risk",     source:"fallback" },
  { code:"CH", country:"Switzerland",   flag:"🇨🇭", currency:"CHF", rate:1.50, inflation:1.3, coreInflation:1.1, unemployment:2.3, gdpGrowth:0.3,  tradeBalance:5.2,   sentiment:95.0, debtToGdp:40.9,  score:0, trend:"strong",   source:"fallback" },
  { code:"CN", country:"China",         flag:"🇨🇳", currency:"CNY", rate:3.45, inflation:0.2, coreInflation:0.6, unemployment:5.1, gdpGrowth:5.2,  tradeBalance:75.3,  sentiment:null, debtToGdp:83.4,  score:0, trend:"moderate", source:"fallback" },
  { code:"DE", country:"Germany",       flag:"🇩🇪", currency:"EUR", rate:4.25, inflation:2.5, coreInflation:3.0, unemployment:5.9, gdpGrowth:-0.2, tradeBalance:16.9,  sentiment:87.5, debtToGdp:64.3,  score:0, trend:"weak",     source:"fallback" },
  { code:"FR", country:"France",        flag:"🇫🇷", currency:"EUR", rate:4.25, inflation:2.7, coreInflation:2.3, unemployment:7.3, gdpGrowth:0.7,  tradeBalance:-8.5,  sentiment:90.0, debtToGdp:111.9, score:0, trend:"weak",     source:"fallback" },
];

// ── Central banks ─────────────────────────────────────────────────────────────
export const CENTRAL_BANKS_FALLBACK: CentralBank[] = [
  { name:"Fed (FOMC)",  country:"United States", flag:"🇺🇸", currency:"USD", currentRate:5.50, lastChange:"2023-07-26", nextMeeting:"2025-05-07", forecast:5.25, bias:"neutral",  probability:{ hike:5,  hold:60, cut:35 } },
  { name:"BCE (ECB)",   country:"Euro Area",     flag:"🇪🇺", currency:"EUR", currentRate:4.25, lastChange:"2024-09-12", nextMeeting:"2025-04-17", forecast:3.65, bias:"dovish",   probability:{ hike:5,  hold:35, cut:60 } },
  { name:"BoE",         country:"United Kingdom",flag:"🇬🇧", currency:"GBP", currentRate:5.25, lastChange:"2024-08-01", nextMeeting:"2025-05-08", forecast:4.75, bias:"dovish",   probability:{ hike:5,  hold:40, cut:55 } },
  { name:"BoJ",         country:"Japan",         flag:"🇯🇵", currency:"JPY", currentRate:0.10, lastChange:"2024-03-19", nextMeeting:"2025-05-01", forecast:0.25, bias:"hawkish",  probability:{ hike:45, hold:45, cut:10 } },
  { name:"BoC",         country:"Canada",        flag:"🇨🇦", currency:"CAD", currentRate:4.75, lastChange:"2024-10-23", nextMeeting:"2025-04-16", forecast:3.75, bias:"dovish",   probability:{ hike:5,  hold:30, cut:65 } },
  { name:"RBA",         country:"Australia",     flag:"🇦🇺", currency:"AUD", currentRate:4.35, lastChange:"2023-11-07", nextMeeting:"2025-05-20", forecast:4.10, bias:"neutral",  probability:{ hike:10, hold:60, cut:30 } },
  { name:"RBNZ",        country:"New Zealand",   flag:"🇳🇿", currency:"NZD", currentRate:5.50, lastChange:"2023-05-24", nextMeeting:"2025-05-28", forecast:5.25, bias:"dovish",   probability:{ hike:5,  hold:35, cut:60 } },
  { name:"SNB",         country:"Switzerland",   flag:"🇨🇭", currency:"CHF", currentRate:1.50, lastChange:"2024-03-21", nextMeeting:"2025-06-19", forecast:1.25, bias:"dovish",   probability:{ hike:5,  hold:40, cut:55 } },
];

// ── Macro score computation ───────────────────────────────────────────────────
// Weights: rate 30%, inflation 25%, unemployment 15%, gdp 15%, trade 10%, sentiment 5%
export function computeMacroScore(c: CountryMacro): number {
  // Each sub-score: 0 = weakest, 100 = strongest for FX bullishness
  const rateScore = c.rate !== null
    ? Math.min(100, Math.max(0, ((c.rate - (-1)) / (8 - (-1))) * 100))
    : 50;

  // Low inflation = stronger currency (target ~2%)
  const inflScore = c.inflation !== null
    ? Math.max(0, 100 - Math.abs(c.inflation - 2.0) * 12)
    : 50;

  // Low unemployment = stronger economy
  const unempScore = c.unemployment !== null
    ? Math.max(0, 100 - (c.unemployment / 15) * 100)
    : 50;

  // Higher GDP growth = stronger
  const gdpScore = c.gdpGrowth !== null
    ? Math.min(100, Math.max(0, ((c.gdpGrowth + 2) / 8) * 100))
    : 50;

  // Trade surplus = stronger
  const tradeScore = c.tradeBalance !== null
    ? Math.min(100, Math.max(0, 50 + c.tradeBalance * 0.4))
    : 50;

  // Higher sentiment = stronger
  const sentScore = c.sentiment !== null
    ? Math.min(100, Math.max(0, c.sentiment))
    : 50;

  const raw =
    rateScore  * 0.30 +
    inflScore  * 0.25 +
    unempScore * 0.15 +
    gdpScore   * 0.15 +
    tradeScore * 0.10 +
    sentScore  * 0.05;

  return Math.round(raw);
}

export function computeTrend(score: number): CountryMacro["trend"] {
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  if (score >= 35) return "weak";
  return "risk";
}

// ── FX Macro Score for a currency pair ───────────────────────────────────────
export interface FXMacroScore {
  pair:      string;
  baseCode:  string;
  quoteCode: string;
  baseScore: number;
  quoteScore:number;
  diff:      number;      // base - quote (-100 → +100)
  bias:      "Bullish" | "Bearish" | "Neutral";
  strength:  number;      // 0–100
  breakdown: { label: string; base: number; quote: number; winner: string }[];
}

export function computeFXMacro(base: CountryMacro, quote: CountryMacro): FXMacroScore {
  const breakdown = [
    { label: "Taux",          base: base.rate         ?? 0,  quote: quote.rate         ?? 0,  weight: 0.30 },
    { label: "Inflation",     base: base.inflation    ?? 2,  quote: quote.inflation    ?? 2,  weight: 0.25 },
    { label: "Chômage",       base: base.unemployment ?? 5,  quote: quote.unemployment ?? 5,  weight: 0.15 },
    { label: "PIB",           base: base.gdpGrowth    ?? 0,  quote: quote.gdpGrowth    ?? 0,  weight: 0.15 },
    { label: "Balance",       base: base.tradeBalance ?? 0,  quote: quote.tradeBalance ?? 0,  weight: 0.10 },
    { label: "Sentiment",     base: base.sentiment    ?? 50, quote: quote.sentiment    ?? 50, weight: 0.05 },
  ].map(b => ({
    label:  b.label,
    base:   b.base,
    quote:  b.quote,
    winner: b.label === "Inflation" || b.label === "Chômage"
      ? (b.base < b.quote ? base.currency : quote.currency)
      : (b.base > b.quote ? base.currency : quote.currency),
  }));

  const bs = computeMacroScore(base);
  const qs = computeMacroScore(quote);
  const diff = bs - qs;

  return {
    pair:       `${base.currency}/${quote.currency}`,
    baseCode:   base.code,
    quoteCode:  quote.code,
    baseScore:  bs,
    quoteScore: qs,
    diff,
    bias:       diff > 8 ? "Bullish" : diff < -8 ? "Bearish" : "Neutral",
    strength:   Math.min(100, Math.abs(diff) * 2),
    breakdown,
  };
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let macroCache: { data: CountryMacro[]; ts: number } | null = null;

export function getMacroCache() { return macroCache; }
export function setMacroCache(data: CountryMacro[]) {
  macroCache = { data, ts: Date.now() };
}

// ── Fetch from TradingEconomics ───────────────────────────────────────────────
const TE_COUNTRY_MAP: Record<string, string> = {
  US: "united%20states", EU: "euro%20area", GB: "united%20kingdom",
  JP: "japan", CA: "canada", AU: "australia", NZ: "new%20zealand",
  CH: "switzerland", CN: "china", DE: "germany", FR: "france",
};

const TE_INDICATORS = [
  "interest-rate", "inflation-rate", "core-inflation-rate",
  "unemployment-rate", "gdp-growth", "balance-of-trade",
  "consumer-confidence", "government-debt-to-gdp",
];

interface TEIndicator {
  Category:       string;
  Title:          string;
  LatestValue:    number;
  LatestValueDate:string;
  Unit:           string;
  Country:        string;
}

export async function fetchTECountry(code: string): Promise<Partial<CountryMacro>> {
  const apiKey = process.env.TE_API_KEY;
  if (!apiKey) return {};

  const teName = TE_COUNTRY_MAP[code];
  if (!teName) return {};

  try {
    const results = await Promise.all(
      TE_INDICATORS.map(async ind => {
        const url = `${TE_BASE}/${teName}/${ind}?c=${apiKey}&f=json`;
        const r = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
          headers: { "User-Agent": "MacroMetrics/1.0" },
        });
        if (!r.ok) return null;
        const data: TEIndicator[] = await r.json();
        return data?.[0] ?? null;
      })
    );

    const find = (title: string) =>
      results.find(r => r?.Category?.toLowerCase().includes(title))?.LatestValue ?? null;

    return {
      rate:         find("interest"),
      inflation:    find("inflation rate"),
      coreInflation:find("core inflation"),
      unemployment: find("unemployment"),
      gdpGrowth:    find("gdp growth"),
      tradeBalance: find("balance of trade"),
      sentiment:    find("consumer confidence"),
      debtToGdp:    find("government debt"),
      source:       "live" as const,
    };
  } catch {
    return {};
  }
}

export async function fetchAllMacroData(): Promise<CountryMacro[]> {
  const cached = getMacroCache();
  if (cached && Date.now() - cached.ts < TE_TTL) return cached.data;

  const apiKey = process.env.TE_API_KEY;

  let data = MACRO_COUNTRIES.map(c => ({ ...c }));

  if (apiKey) {
    // Fetch all countries in parallel (with rate limit protection)
    const liveResults = await Promise.allSettled(
      data.map(c => fetchTECountry(c.code))
    );
    data = data.map((c, i) => {
      const r = liveResults[i];
      if (r.status === "fulfilled" && Object.keys(r.value).length > 0) {
        return { ...c, ...r.value };
      }
      return c;
    });
  }

  // Compute scores
  data = data.map(c => ({
    ...c,
    score: computeMacroScore(c),
    trend: computeTrend(computeMacroScore(c)),
  }));

  setMacroCache(data);
  return data;
}
