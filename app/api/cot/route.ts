export const dynamic = "force-dynamic";

// ─── CFTC Official Open Data API ─────────────────────────────────────────────
// Source: https://publicreporting.cftc.gov (portail officiel CFTC)
// Dataset: Commitments of Traders — Futures Only (Legacy format)
// Même données que https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm
// Publiées chaque vendredi ~15h30 ET (couverture: semaine jusqu'au mardi précédent)

export interface COTWeek {
  weekDate: string;
  nonCommLong: number;
  nonCommShort: number;
  nonCommNet: number;
  commLong: number;
  commShort: number;
  commNet: number;
  openInterest: number;
  changeLong: number;
  changeShort: number;
  changeNet: number;
}

export interface COTInstrument {
  name: string;
  category: string;
  code: string;
  latest: COTWeek;
  history: COTWeek[];
  sentiment: "Bullish" | "Bearish" | "Neutral";
  extremeLevel: number;
}

const COT_INSTRUMENTS = [
  { name: "EUR/USD",    market: "EURO FX - CHICAGO MERCANTILE EXCHANGE",                        category: "Forex" },
  { name: "GBP/USD",   market: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",                  category: "Forex" },
  { name: "JPY/USD",   market: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",                   category: "Forex" },
  { name: "CHF/USD",   market: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",                    category: "Forex" },
  { name: "CAD/USD",   market: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",                category: "Forex" },
  { name: "AUD/USD",   market: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",              category: "Forex" },
  { name: "NZD/USD",   market: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",                      category: "Forex" },
  { name: "Gold",      market: "GOLD - COMMODITY EXCHANGE INC.",                               category: "Commodities" },
  { name: "Silver",    market: "SILVER - COMMODITY EXCHANGE INC.",                             category: "Commodities" },
  { name: "Crude Oil", market: "CRUDE OIL, LIGHT SWEET-WTI - ICE FUTURES EUROPE",             category: "Commodities" },
  { name: "S&P 500",   market: "MICRO E-MINI S&P 500 INDEX - CHICAGO MERCANTILE EXCHANGE",    category: "Indices" },
  { name: "Nasdaq 100",market: "MICRO E-MINI NASDAQ-100 INDEX - CHICAGO MERCANTILE EXCHANGE", category: "Indices" },
  { name: "Bitcoin",   market: "BITCOIN - CHICAGO MERCANTILE EXCHANGE",                        category: "Crypto" },
];

// ─── Server-side cache: 6h TTL, cleared during Friday publication window ──────
let cache: { data: COTInstrument[]; ts: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

function isFridayWindow(): boolean {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getDay() === 5 && et.getHours() >= 15 && et.getHours() < 19;
}

// ─── Fetch 2-year history for one instrument from CFTC Socrata ───────────────
async function fetchInstrument(market: string): Promise<COTWeek[]> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const url = [
    "https://publicreporting.cftc.gov/resource/jun7-fc8e.json",
    `?market_and_exchange_names=${encodeURIComponent(market)}`,
    `&$where=report_date_as_yyyy_mm_dd>='${cutoffStr}'`,
    "&$order=report_date_as_yyyy_mm_dd DESC",
    "&$limit=110",
  ].join("");

  // Retry : Socrata throttle les requêtes en rafale → 2 tentatives avec backoff
  let rows: Record<string, string>[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const j = await res.json() as Record<string, string>[];
        if (Array.isArray(j) && j.length > 0) { rows = j; break; }
      }
    } catch { /* retry */ }
    if (attempt === 0) await new Promise(r => setTimeout(r, 400));
  }
  if (!rows.length) return [];

  return rows.map(r => {
    const ncL = parseInt(r["noncomm_positions_long_all"]  ?? "0") || 0;
    const ncS = parseInt(r["noncomm_positions_short_all"] ?? "0") || 0;
    const cL  = parseInt(r["comm_positions_long_all"]     ?? "0") || 0;
    const cS  = parseInt(r["comm_positions_short_all"]    ?? "0") || 0;
    const oi  = parseInt(r["open_interest_all"]           ?? "0") || 0;
    const chL = parseInt(r["change_in_noncomm_long_all"]  ?? "0") || 0;
    const chS = parseInt(r["change_in_noncomm_short_all"] ?? "0") || 0;
    return {
      weekDate:    (r["report_date_as_yyyy_mm_dd"] ?? "").slice(0, 10),
      nonCommLong:  ncL, nonCommShort: ncS, nonCommNet: ncL - ncS,
      commLong:     cL,  commShort:    cS,  commNet:    cL  - cS,
      openInterest: oi,
      changeLong:   chL, changeShort:  chS, changeNet:  chL - chS,
    };
  });
}

function computeExtreme(history: COTWeek[]): number {
  if (history.length < 2) return 50;
  const nets = history.map(h => h.nonCommNet);
  const cur = nets[0], min = Math.min(...nets), max = Math.max(...nets);
  if (max === min) return 50;
  return Math.round(((cur - min) / (max - min)) * 100);
}

export async function GET() {
  // Clear cache during Friday publication window so fresh data loads immediately
  if (cache && isFridayWindow()) cache = null;

  if (cache && (Date.now() - cache.ts) < CACHE_TTL) {
    return Response.json(cache.data);
  }

  // Concurrence limitée à 3 pour éviter le throttle Socrata (sinon certaines paires vides)
  const CONCURRENCY = 3;
  const histories: COTWeek[][] = [];
  for (let i = 0; i < COT_INSTRUMENTS.length; i += CONCURRENCY) {
    const batch = COT_INSTRUMENTS.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(inst => fetchInstrument(inst.market)));
    settled.forEach(s => histories.push(s.status === "fulfilled" ? s.value : []));
  }

  const data: COTInstrument[] = COT_INSTRUMENTS.map((inst, i) => {
    const history: COTWeek[] = histories[i] ?? [];
    const latest = history[0] ?? {
      weekDate: "", nonCommLong: 0, nonCommShort: 0, nonCommNet: 0,
      commLong: 0, commShort: 0, commNet: 0, openInterest: 0,
      changeLong: 0, changeShort: 0, changeNet: 0,
    };
    const extreme = computeExtreme(history);
    const sentiment: "Bullish" | "Bearish" | "Neutral" =
      latest.nonCommNet > 0 ? "Bullish" : latest.nonCommNet < 0 ? "Bearish" : "Neutral";
    return { name: inst.name, category: inst.category, code: inst.market, latest, history, sentiment, extremeLevel: extreme };
  });

  // Ne cacher que si données quasi-complètes (≥80% non vides) — évite de figer des paires vides
  const ok = data.filter(d => d.history.length > 0).length;
  if (ok >= Math.floor(COT_INSTRUMENTS.length * 0.8)) {
    cache = { data, ts: Date.now() };
  }
  return Response.json(data);
}
