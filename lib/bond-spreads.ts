// lib/bond-spreads.ts
// Fetch 10Y sovereign bond yields for major G10 currencies.
// US 10Y: Yahoo Finance ^TNX (value is already in %, multiply by 0.1 because YF stores it as ×10)
// All others: FRED monthly series (free, no API key required)

export interface BondSpreadResult {
  baseYield:  number;
  quoteYield: number;
  spread_bps: number;   // (base − quote) × 100
  direction:  "FAVORABLE" | "UNFAVORABLE" | "NEUTRAL";
  source:     "live" | "cache" | "fallback";
}

// FRED series IDs for each country
const BOND_SERIES: Record<string, string> = {
  US: "DGS10",               // via Yahoo Finance ^TNX
  DE: "IRLTLT01DEM156N",
  GB: "IRLTLT01GBM156N",
  JP: "IRLTLT01JPM156N",
  CA: "IRLTLT01CAM156N",
  AU: "IRLTLT01AUM156N",
  NZ: "IRLTLT01NZM156N",
  CH: "IRLTLT01CHM156N",
};

// Maps pair label → [baseCountry, quoteCountry]
const PAIR_BOND_MAP: Record<string, [string, string]> = {
  "EUR/USD": ["DE", "US"], "GBP/USD": ["GB", "US"], "USD/JPY": ["US", "JP"],
  "USD/CHF": ["US", "CH"], "AUD/USD": ["AU", "US"], "NZD/USD": ["NZ", "US"],
  "USD/CAD": ["US", "CA"], "EUR/GBP": ["DE", "GB"], "EUR/JPY": ["DE", "JP"],
  "EUR/CHF": ["DE", "CH"], "EUR/AUD": ["DE", "AU"], "EUR/CAD": ["DE", "CA"],
  "EUR/NZD": ["DE", "NZ"], "GBP/JPY": ["GB", "JP"], "GBP/CHF": ["GB", "CH"],
  "GBP/AUD": ["GB", "AU"], "GBP/CAD": ["GB", "CA"], "GBP/NZD": ["GB", "NZ"],
  "AUD/JPY": ["AU", "JP"], "NZD/JPY": ["NZ", "JP"], "CAD/JPY": ["CA", "JP"],
  "CHF/JPY": ["CH", "JP"], "AUD/NZD": ["AU", "NZ"], "AUD/CAD": ["AU", "CA"],
  "AUD/CHF": ["AU", "CH"], "NZD/CAD": ["NZ", "CA"], "NZD/CHF": ["NZ", "CH"],
  "CAD/CHF": ["CA", "CH"], "USD/MXN": ["US", "US"],
  "XAU/USD": ["AU", "US"], "XAG/USD": ["AU", "US"], "WTI": ["US", "US"],
};

// Module-level in-process cache (TTL 6 hours)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { data: Map<string, number>; ts: number } | null = null;

/**
 * Fetch a single FRED series and return the last non-null value.
 * FRED returns monthly CSV: date,value — the last rows may be "." for missing.
 */
export async function fetchFREDYield(seriesId: string): Promise<number> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMetrics/1.0)" },
    cache:   "no-store",
    signal:  AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`FRED fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").slice(1); // skip header
  // iterate from end to find first valid value
  for (let i = lines.length - 1; i >= 0; i--) {
    const parts = lines[i].split(",");
    const val   = parseFloat(parts[1]);
    if (!isNaN(val)) return val;
  }
  throw new Error(`No valid data in FRED series ${seriesId}`);
}

/**
 * Fetch US 10Y yield from Yahoo Finance ^TNX.
 * YF stores it as ×10 (e.g. 44.5 means 4.45%), so we divide by 10.
 */
async function fetchUSYield(): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMetrics/1.0)" },
    cache:   "no-store",
    signal:  AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`YF ^TNX fetch failed: ${res.status}`);
  const json   = await res.json();
  const closes: number[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const valid  = closes.filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (!valid.length) throw new Error("No valid ^TNX data");
  return valid[valid.length - 1] / 10; // convert ×10 format to %
}

/**
 * Fetch all unique countries in parallel, with fallback to 0 if fetch fails.
 * Returns Map<countryCode, yieldPct>.
 */
async function fetchAllYields(): Promise<Map<string, number>> {
  // Check in-process cache
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const countries = Object.keys(BOND_SERIES);
  const results   = await Promise.allSettled(
    countries.map(async (code) => {
      const yld = code === "US" ? await fetchUSYield() : await fetchFREDYield(BOND_SERIES[code]);
      return { code, yld };
    }),
  );

  const data = new Map<string, number>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      data.set(r.value.code, r.value.yld);
    }
  }

  cache = { data, ts: Date.now() };
  return data;
}

/**
 * Compute bond spread results for all pairs.
 * Returns Map<pairLabel, BondSpreadResult>.
 */
export async function fetchAllBondSpreads(): Promise<Map<string, BondSpreadResult>> {
  let yields: Map<string, number>;
  let source: "live" | "cache" | "fallback" = "live";

  try {
    yields = await fetchAllYields();
    source = cache && Date.now() - cache.ts > 1000 ? "cache" : "live";
  } catch {
    // If everything fails, return neutral results
    yields = new Map();
    source = "fallback";
  }

  const out = new Map<string, BondSpreadResult>();

  for (const [pair, [baseCode, quoteCode]] of Object.entries(PAIR_BOND_MAP)) {
    const baseYield  = yields.get(baseCode)  ?? 0;
    const quoteYield = yields.get(quoteCode) ?? 0;

    // WTI or same-country pairs → neutral
    if (baseCode === quoteCode) {
      out.set(pair, { baseYield: 0, quoteYield: 0, spread_bps: 0, direction: "NEUTRAL", source: "fallback" });
      continue;
    }

    const spread_bps = Math.round((baseYield - quoteYield) * 100);
    const direction: BondSpreadResult["direction"] =
      spread_bps > 15  ? "FAVORABLE"   :
      spread_bps < -15 ? "UNFAVORABLE" : "NEUTRAL";

    out.set(pair, { baseYield, quoteYield, spread_bps, direction, source });
  }

  return out;
}

/** Convenience: get spread for a single pair (from pre-fetched map) */
export function getBondSpread(
  spreads: Map<string, BondSpreadResult>,
  pair:    string,
): BondSpreadResult | undefined {
  return spreads.get(pair);
}
