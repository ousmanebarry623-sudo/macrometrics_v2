import { NextResponse } from "next/server";
import { fetchAllPairsSeasonality, MONTH_NAMES as SHEET_MONTH_NAMES } from "@/lib/seasonality-sheets";
import { fetchMyfxbookMap } from "@/lib/myfxbook";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CurrencyData {
  bias: "Bullish" | "Bearish" | "Neutral";
  strengthPct: number;
  zScore: number;
  netPos: number;
}

export interface PairSignal {
  pair:       string;
  base:       string;
  quote:      string;
  category:   "Major" | "Cross" | "Commodity" | "Minor";
  signal:     "BUY" | "SELL" | "NEUTRAL";
  direction:  "up" | "down" | "flat";
  confidence: number;
  quality:    number;
  confLevel:  "HIGH" | "MEDIUM" | "LOW";
  factors:    number;
  institutional: {
    bias:        "Bullish" | "Bearish" | "Neutral";
    base:        CurrencyData;
    quote:       CurrencyData;
    strengthPct: number;
  };
  fundamental: {
    bias:       "Bullish" | "Bearish" | "Neutral";
    baseScore:  number;
    quoteScore: number;
    netScore:   number;
  };
  sentiment: {
    bias:     "Bullish" | "Bearish" | "Neutral";
    longPct:  number;
    shortPct: number;
    extreme:  boolean;
    source:   "MyFXBook";
  };
  seasonality: {
    bias:      "Bullish" | "Bearish" | "Neutral";
    score:     number;   // -1, 0, +1
    month:     string;
    trend:     number[]; // 12 mois: -1 / 0 / +1
  };
  updatedAt: string;
}

// ── Pairs ─────────────────────────────────────────────────────────────────────
const PAIRS: { pair: string; base: string; quote: string; category: "Major"|"Cross"|"Commodity"|"Minor" }[] = [
  // Majors
  { pair:"EUR/USD", base:"EUR", quote:"USD", category:"Major" },
  { pair:"GBP/USD", base:"GBP", quote:"USD", category:"Major" },
  { pair:"USD/JPY", base:"USD", quote:"JPY", category:"Major" },
  { pair:"USD/CHF", base:"USD", quote:"CHF", category:"Major" },
  { pair:"USD/CAD", base:"USD", quote:"CAD", category:"Major" },
  { pair:"AUD/USD", base:"AUD", quote:"USD", category:"Major" },
  { pair:"NZD/USD", base:"NZD", quote:"USD", category:"Major" },
  // Crosses
  { pair:"EUR/GBP", base:"EUR", quote:"GBP", category:"Cross" },
  { pair:"EUR/JPY", base:"EUR", quote:"JPY", category:"Cross" },
  { pair:"EUR/CAD", base:"EUR", quote:"CAD", category:"Cross" },
  { pair:"EUR/AUD", base:"EUR", quote:"AUD", category:"Cross" },
  { pair:"GBP/JPY", base:"GBP", quote:"JPY", category:"Cross" },
  { pair:"GBP/AUD", base:"GBP", quote:"AUD", category:"Cross" },
  { pair:"GBP/CAD", base:"GBP", quote:"CAD", category:"Cross" },
  { pair:"GBP/NZD", base:"GBP", quote:"NZD", category:"Cross" },
  { pair:"AUD/JPY", base:"AUD", quote:"JPY", category:"Cross" },
  { pair:"AUD/CAD", base:"AUD", quote:"CAD", category:"Cross" },
  { pair:"AUD/NZD", base:"AUD", quote:"NZD", category:"Cross" },
  { pair:"NZD/JPY", base:"NZD", quote:"JPY", category:"Cross" },
  { pair:"CAD/JPY", base:"CAD", quote:"JPY", category:"Cross" },
  // Mineurs USD
  { pair:"USD/MXN", base:"USD", quote:"MXN", category:"Minor" },
  // Matières premières
  { pair:"XAU/USD", base:"XAU", quote:"USD", category:"Commodity" },
  { pair:"XAG/USD", base:"XAG", quote:"USD", category:"Commodity" },
  { pair:"WTI/USD", base:"WTI", quote:"USD", category:"Commodity" },
  { pair:"XCU/USD", base:"XCU", quote:"USD", category:"Commodity" },
];

// ── CFTC market names ─────────────────────────────────────────────────────────
// TFF = Traders in Financial Futures (devises, DXY) → endpoint jun7-fc8e
// LEGACY = Legacy COT Futures Only (matières premières) → endpoint 6dca-aqww
const CFTC: Record<string, { market: string; invert: boolean; legacy?: boolean }> = {
  EUR: { market: "EURO FX - CHICAGO MERCANTILE EXCHANGE",                          invert: false },
  GBP: { market: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",                    invert: false },
  JPY: { market: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",                     invert: true  },
  CAD: { market: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",                  invert: true  },
  AUD: { market: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",               invert: false },
  NZD: { market: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",                        invert: false },
  CHF: { market: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",                      invert: true  },
  USD: { market: "U.S. DOLLAR INDEX - ICE FUTURES U.S.",                           invert: false },
  MXN: { market: "MEXICAN PESO - CHICAGO MERCANTILE EXCHANGE",                     invert: true  },
  // Matières premières → Legacy COT (6dca-aqww)
  XAU: { market: "GOLD - COMMODITY EXCHANGE INC.",                                 invert: false, legacy: true },
  XAG: { market: "SILVER - COMMODITY EXCHANGE INC.",                               invert: false, legacy: true },
  WTI: { market: "WTI FINANCIAL CRUDE OIL - NEW YORK MERCANTILE EXCHANGE",         invert: false, legacy: true },
  XCU: { market: "COPPER- #1 - COMMODITY EXCHANGE INC.",                           invert: false, legacy: true },
};

// ── TV Calendar country codes ─────────────────────────────────────────────────
const COUNTRY: Record<string, string> = {
  USD:"US", EUR:"EU", GBP:"GB", JPY:"JP",
  CAD:"CA", AUD:"AU", NZD:"NZ", CHF:"CH",
};

// ── Saisonnalité : calculé depuis Google Sheets (lib/seasonality-sheets.ts) ───
// seasonMap est passé par le GET handler, calculé une fois pour toutes les paires
function computeSeasonality(
  pair: string,
  seasonMap: Record<string, { bias: number; trend: number[] }>,
): PairSignal["seasonality"] {
  const monthIdx = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })).getMonth();
  const entry    = seasonMap[pair];
  const trend    = entry?.trend ?? new Array(12).fill(0);
  const score    = trend[monthIdx] ?? 0;
  const bias: PairSignal["seasonality"]["bias"] =
    score > 0 ? "Bullish" : score < 0 ? "Bearish" : "Neutral";
  return { bias, score, month: SHEET_MONTH_NAMES[monthIdx], trend };
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache: { data: PairSignal[]; ts: number } | null = null;
const TTL = 30 * 60 * 1000;

// ── Fetch CFTC COT (52 weeks) ─────────────────────────────────────────────────
async function fetchCOT(currency: string): Promise<CurrencyData | null> {
  const cfg = CFTC[currency];
  if (!cfg) return null;

  // Deux endpoints selon le type d'actif
  const BASE_URL = cfg.legacy
    ? "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
    : "https://publicreporting.cftc.gov/resource/jun7-fc8e.json";

  try {
    const url = [
      BASE_URL,
      `?market_and_exchange_names=${encodeURIComponent(cfg.market)}`,
      "&$order=report_date_as_yyyy_mm_dd DESC",
      "&$limit=52",
      "&$select=noncomm_positions_long_all,noncomm_positions_short_all",
    ].join("");

    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const rows: Record<string, string>[] = await res.json();
    if (!rows.length) return null;

    const ncLong  = rows.map(r => parseInt(r.noncomm_positions_long_all  || "0"));
    const ncShort = rows.map(r => parseInt(r.noncomm_positions_short_all || "0"));

    const nets = ncLong.map((l, i) => l - ncShort[i]);
    const currentNet = nets[0];

    const mean = nets.reduce((a, b) => a + b, 0) / nets.length;
    const std  = Math.sqrt(nets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nets.length) || 1;
    const z    = (currentNet - mean) / std;

    const adjustedZ   = cfg.invert ? -z          : z;
    const adjustedNet = cfg.invert ? -currentNet : currentNet;

    const bias: CurrencyData["bias"] = adjustedZ > 0.3 ? "Bullish" : adjustedZ < -0.3 ? "Bearish" : "Neutral";
    const strengthPct = Math.min(100, Math.round(Math.abs(adjustedZ / 2) * 100));

    return { bias, strengthPct, zScore: adjustedZ, netPos: adjustedNet };
  } catch {
    return null;
  }
}

// ── Fetch TV Economic Calendar (last 30 days) ─────────────────────────────────
async function fetchMacroSurprises(): Promise<Record<string, number>> {
  try {
    const to    = new Date();
    const from  = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const countries = Object.values(COUNTRY).join(",");
    const url = `https://economic-calendar.tradingview.com/events?from=${from.toISOString()}&to=${to.toISOString()}&countries=${countries}`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Origin": "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return {};
    const json = await res.json();
    const events: { currency: string; importance: number; actual: number | null; forecast: number | null }[] = json.result ?? [];

    const scores: Record<string, { sum: number; count: number }> = {};

    for (const ev of events) {
      if (ev.importance < 0) continue;
      if (ev.actual === null || ev.forecast === null || ev.forecast === 0) continue;
      const surprise = (ev.actual - ev.forecast) / Math.abs(ev.forecast);
      const weight   = ev.importance === 1 ? 2 : 1;
      const cur = ev.currency;
      if (!scores[cur]) scores[cur] = { sum: 0, count: 0 };
      scores[cur].sum   += surprise * weight;
      scores[cur].count += weight;
    }

    const result: Record<string, number> = {};
    for (const [cur, cfg] of Object.entries(COUNTRY)) {
      const s = scores[cfg] || scores[cur];
      if (s && s.count > 0) {
        const avg = s.sum / s.count;
        result[cur] = Math.max(-3, Math.min(3, Math.round(avg * 10) / 2));
      } else {
        result[cur] = 0;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── Score helpers ─────────────────────────────────────────────────────────────
function biasToNum(bias: "Bullish"|"Bearish"|"Neutral"): number {
  return bias === "Bullish" ? 1 : bias === "Bearish" ? -1 : 0;
}

function numToBias(n: number): "Bullish"|"Bearish"|"Neutral" {
  return n > 0.1 ? "Bullish" : n < -0.1 ? "Bearish" : "Neutral";
}

// ── Compute single pair ───────────────────────────────────────────────────────
function computePair(
  p: typeof PAIRS[0],
  cotMap: Record<string, CurrencyData | null>,
  macroMap: Record<string, number>,
  mfxMap: Record<string, number>,
  seasonMap: Record<string, { bias: number; trend: number[] }>,
): PairSignal {
  const baseC  = cotMap[p.base];
  const quoteC = cotMap[p.quote];

  // ── Institutionnel ────────────────────────────────────────────────────────
  const baseZ    = baseC  ? baseC.zScore  : 0;
  const quoteZ   = quoteC ? quoteC.zScore : 0;
  const instNetZ = baseZ - quoteZ;
  const instBias = numToBias(instNetZ * 0.5);
  const instStrengthPct = Math.min(100, Math.round(Math.abs(instNetZ) * 25));

  const fallback: CurrencyData = { bias:"Neutral", strengthPct:0, zScore:0, netPos:0 };

  // ── Fondamental ───────────────────────────────────────────────────────────
  const isCommodity = p.category === "Commodity";
  const baseScore  = isCommodity ? -(macroMap["USD"] ?? 0) : (macroMap[p.base]  ?? 0);
  const quoteScore = isCommodity ? 0                       : (macroMap[p.quote] ?? 0);
  const fundNet    = baseScore - quoteScore;
  const fundBias   = numToBias(fundNet);

  // ── Sentiment retail MyFXBook (contrarian) ───────────────────────────────
  // Source unique : MyFXBook Community Outlook. Si indisponible → 50 (neutre).
  const pairRetailLong = mfxMap[p.pair] ?? 50;
  const sentExtreme = pairRetailLong >= 70 || pairRetailLong <= 30;
  const sentBias: "Bullish"|"Bearish"|"Neutral" =
    pairRetailLong >= 65 ? "Bearish" :
    pairRetailLong <= 35 ? "Bullish" : "Neutral";

  // ── Saisonnalité ──────────────────────────────────────────────────────────
  const seasonal = computeSeasonality(p.pair, seasonMap);

  // ── Signal combiné (4 facteurs) ───────────────────────────────────────────
  const instScore = biasToNum(instBias);
  const fundScore = biasToNum(fundBias);
  const sentScore = biasToNum(sentBias);
  const seasScore = seasonal.score;

  const rawSum  = instScore + fundScore + sentScore + seasScore;
  const factors = [instBias, fundBias, sentBias, seasonal.bias].filter(b => b !== "Neutral").length;

  let signal: PairSignal["signal"] = "NEUTRAL";
  if (rawSum >= 2)  signal = "BUY";
  else if (rawSum <= -2) signal = "SELL";
  else if (rawSum === 1) signal = "BUY";
  else if (rawSum === -1) signal = "SELL";

  const direction: PairSignal["direction"] =
    signal === "BUY" ? "up" : signal === "SELL" ? "down" : "flat";

  // ── Confidence (0–100) — 4 composantes continues ─────────────────────────
  // 1. Force directionnelle (0–50) : accord des facteurs
  const dirForce   = Math.round((Math.abs(rawSum) / 4) * 50);
  // 2. Conviction COT via z-score CFTC (0–30) — mesure la plus objective
  const cotConv    = Math.min(30, Math.round((Math.abs(instNetZ) / 3.5) * 30));
  // 3. Magnitude des surprises macro TradingView (0–15)
  const macroConv  = Math.min(15, Math.round((Math.abs(fundNet) / 5.0) * 15));
  // 4. Bonus sentiment extrême MyFXBook (0–5)
  const sentConv   = sentExtreme ? 5 : 0;
  const confidence = Math.min(100, dirForce + cotConv + macroConv + sentConv);

  const confLevel: PairSignal["confLevel"] =
    confidence >= 65 ? "HIGH" : confidence >= 45 ? "MEDIUM" : "LOW";

  // ── Quality (0–100) — force de chaque dimension, plafonnée individuellement
  // 1. Force COT institutionnelle (0–35) — z-score CFTC
  const cotQuality   = Math.min(35, Math.round((Math.abs(instNetZ) / 3.5) * 35));
  // 2. Magnitude surprises macro (0–25)
  const macroQuality = Math.min(25, Math.round((Math.abs(fundNet) / 5.0) * 25));
  // 3. Extrémité sentiment retail MyFXBook (0–20)
  const sentExt      = Math.abs(pairRetailLong - 50);
  const sentQuality  = Math.min(20, Math.round((sentExt / 40) * 20));
  // 4. Alignement signaux (0–15) — % de facteurs non-neutres
  const alignQuality = Math.round((factors / 4) * 15);
  // 5. Saisonnalité présente (0–5)
  const seasQuality  = Math.abs(seasonal.score) > 0 ? 5 : 0;
  const quality      = Math.min(100, cotQuality + macroQuality + sentQuality + alignQuality + seasQuality);

  return {
    pair: p.pair, base: p.base, quote: p.quote, category: p.category,
    signal, direction, confidence, quality: Math.min(100, quality),
    confLevel, factors,
    institutional: {
      bias: instBias,
      base:  baseC  ?? fallback,
      quote: quoteC ?? fallback,
      strengthPct: instStrengthPct,
    },
    fundamental: { bias: fundBias, baseScore, quoteScore, netScore: fundNet },
    sentiment:   { bias: sentBias, longPct: pairRetailLong, shortPct: 100 - pairRetailLong, extreme: sentExtreme, source: "MyFXBook" as const },
    seasonality: seasonal,
    updatedAt: new Date().toLocaleString("fr-FR", { timeZone:"Europe/Paris", hour:"2-digit", minute:"2-digit" }),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && cache && Date.now() < cache.ts) {
    return NextResponse.json(cache.data, { headers: { "X-Cache":"HIT" } });
  }

  const currencies = ["EUR","GBP","JPY","CAD","AUD","NZD","CHF","USD","MXN","XAU","XAG","WTI","XCU"];

  const [cotResults, macroMap, mfxMap, seasonMap] = await Promise.all([
    Promise.all(currencies.map(c => fetchCOT(c).then(d => ({ c, d })))),
    fetchMacroSurprises(),
    fetchMyfxbookMap(),
    fetchAllPairsSeasonality(),
  ]);

  const cotMap: Record<string, CurrencyData | null> = {};
  for (const { c, d } of cotResults) cotMap[c] = d;

  const results = PAIRS.map(p => computePair(p, cotMap, macroMap, mfxMap, seasonMap));

  results.sort((a, b) => {
    if (a.signal !== "NEUTRAL" && b.signal === "NEUTRAL") return -1;
    if (a.signal === "NEUTRAL" && b.signal !== "NEUTRAL") return 1;
    return b.confidence - a.confidence;
  });

  cache = { data: results, ts: Date.now() + TTL };
  return NextResponse.json(results, { headers: { "X-Cache":"MISS", "X-Total": String(results.length) } });
}
