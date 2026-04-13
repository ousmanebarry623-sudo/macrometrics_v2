// Shared Google Sheets seasonality logic
// Used by /api/seasonality-range and /api/signal-analysis

export const SHEET_ID  = "1hVlCN-fdH30zAVasyoEsUCkcGtyxzSPOxLaJQ3F01cY";
export const SHEET_TTL = 2 * 60 * 60 * 1000; // 2h cache brut

export const PAIR_TO_TAB: Record<string, string> = {
  // ── Majors ────────────────────────────────────────────────────────────────
  "EUR/USD": "EURUSD", "GBP/USD": "GBPUSD", "USD/JPY": "USDJPY",
  "USD/CHF": "USDCHF", "USD/CAD": "USDCAD", "AUD/USD": "AUDUSD",
  "NZD/USD": "NZDUSD",
  // ── EUR Crosses ───────────────────────────────────────────────────────────
  "EUR/GBP": "EURGBP", "EUR/JPY": "EURJPY", "EUR/CAD": "EURCAD",
  "EUR/AUD": "EURAUD", "EUR/CHF": "EURCHF", "EUR/NZD": "EURNZD",
  // ── GBP Crosses ───────────────────────────────────────────────────────────
  "GBP/JPY": "GBPJPY", "GBP/AUD": "GBPAUD", "GBP/CAD": "GBPCAD",
  "GBP/CHF": "GBPCHF", "GBP/NZD": "GBPNZD",
  // ── AUD Crosses ───────────────────────────────────────────────────────────
  "AUD/JPY": "AUDJPY", "AUD/CAD": "AUDCAD", "AUD/NZD": "AUDNZD",
  "AUD/CHF": "AUDCHF",
  // ── NZD Crosses ───────────────────────────────────────────────────────────
  "NZD/JPY": "NZDJPY", "NZD/CHF": "NZDCHF", "NZD/CAD": "NZDCAD",
  // ── CAD / CHF / JPY Crosses ───────────────────────────────────────────────
  "CAD/JPY": "CADJPY", "CAD/CHF": "CADCHF", "CHF/JPY": "CHFJPY",
  // ── Autres ────────────────────────────────────────────────────────────────
  "USD/MXN": "USDMXN",
  // ── Matières premières ────────────────────────────────────────────────────
  "XAU/USD": "XAUUSD", "XAG/USD": "XAGUSD",
  "WTI/USD": "WTIUSD", "WTI Oil": "WTIUSD",
  "XCU/USD": "XCUUSD", "Copper":  "XCUUSD",
  "Nat. Gas": "NATGAS",
  // ── Indices ───────────────────────────────────────────────────────────────
  "S&P 500":    "SPX500",
  "Nasdaq 100": "NDX100",
  "Dow Jones":  "DJIA",
  "Russell 2000": "RUT2000",
};

export const MONTH_NAMES = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

export interface YearlyRow { year: number; returns: (number | null)[]; }

export interface MonthStat {
  month:      string;
  avg:        number;
  bullishPct: number;
  bias:       number;  // +1 / 0 / -1
  count:      number;
}

// ── Module-level raw cache (shared across all imports in the same process) ────
const rawCache = new Map<string, { data: YearlyRow[]; ts: number }>();

// ── CSV helpers ───────────────────────────────────────────────────────────────
export function parseCSVLine(line: string): string[] {
  const cols: string[] = []; let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

export function parsePct(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^"+|"+$/g, "");
  if (!s) return null;
  const isPct = s.endsWith("%");
  s = s.replace("%", "").replace(",", ".").trim();
  const v = parseFloat(s);
  if (isNaN(v)) return null;
  if (isPct) return parseFloat(v.toFixed(4));
  if (Math.abs(v) < 1) return parseFloat((v * 100).toFixed(4));
  return parseFloat(v.toFixed(4));
}

export function parseDate(raw: string): { year: number; month: number } | null {
  const s = raw.trim().replace(/^"+|"+$/g, "");
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[1], 10) - 1;
  const year  = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(year) || month < 0 || month > 11) return null;
  return { year, month };
}

// ── Fetch raw yearly rows for a given sheet tab ───────────────────────────────
export async function fetchSheetRaw(tab: string): Promise<YearlyRow[] | null> {
  const hit = rawCache.get(tab);
  if (hit && Date.now() - hit.ts < SHEET_TTL) return hit.data;

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith("/*") || text.includes("setResponse") || text.trim() === "") return null;

    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;

    const byYear: Record<number, (number | null)[]> = {};
    for (const line of lines.slice(1)) {
      const cols = parseCSVLine(line);
      if (cols.length < 2) continue;
      const dateInfo = parseDate(cols[0]);
      if (!dateInfo) continue;
      const ret = parsePct(cols[1]);
      const { year, month } = dateInfo;
      if (!byYear[year]) byYear[year] = Array(12).fill(null);
      byYear[year][month] = ret;
    }

    const result: YearlyRow[] = Object.entries(byYear)
      .map(([y, rets]) => ({ year: parseInt(y), returns: rets }))
      .sort((a, b) => a.year - b.year);

    if (!result.length) return null;
    rawCache.set(tab, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

// ── Compute monthly stats for a year range ────────────────────────────────────
export function computeRangeStats(rows: YearlyRow[], from: number, to: number): { months: MonthStat[]; trend: number[] } {
  const filtered = rows.filter(r => r.year >= from && r.year <= to);

  const months: MonthStat[] = MONTH_NAMES.map((month, i) => {
    const vals = filtered.map(r => r.returns[i]).filter((v): v is number => v !== null);
    if (!vals.length) return { month, avg: 0, bullishPct: 50, bias: 0, count: 0 };

    const avg        = vals.reduce((a, b) => a + b, 0) / vals.length;
    const bullishPct = Math.round((vals.filter(v => v > 0).length / vals.length) * 100);

    // Règle de majorité : avg et bullishPct dans le même sens → biais confirmé
    let bias = 0;
    if      (avg > 0 && bullishPct > 50) bias = 1;
    else if (avg < 0 && bullishPct < 50) bias = -1;
    // Cas où avg et bullishPct divergent légèrement : avg seul décide si fort
    else if (avg > 0.15) bias = 1;
    else if (avg < -0.15) bias = -1;

    return { month, avg: Math.round(avg * 100) / 100, bullishPct, bias, count: vals.length };
  });

  return { months, trend: months.map(m => m.bias) };
}

// ── Fetch all pairs' full-history trend (used by signal-analysis) ─────────────
// Returns: Record<pair, { trend: number[12]; bias: number (current month) }>
let allPairsCacheStore: { data: Record<string, { bias: number; trend: number[] }>; ts: number } | null = null;
const ALL_PAIRS_TTL = 30 * 60 * 1000; // 30 min

export async function fetchAllPairsSeasonality(): Promise<Record<string, { bias: number; trend: number[] }>> {
  if (allPairsCacheStore && Date.now() - allPairsCacheStore.ts < ALL_PAIRS_TTL) {
    return allPairsCacheStore.data;
  }

  const toYear   = new Date().getFullYear() - 1; // données disponibles jusqu'à l'année précédente (2025)
  const monthIdx = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })).getMonth();

  // Dédupliquer les tabs (plusieurs labels peuvent pointer vers le même onglet)
  const tabToPairs: Record<string, string[]> = {};
  for (const [pair, tab] of Object.entries(PAIR_TO_TAB)) {
    if (!tabToPairs[tab]) tabToPairs[tab] = [];
    tabToPairs[tab].push(pair);
  }

  const entries = Object.entries(tabToPairs);
  const fetched = await Promise.all(
    entries.map(async ([tab, pairLabels]) => {
      const rows = await fetchSheetRaw(tab);
      if (!rows || rows.length === 0) {
        return pairLabels.map(pair => ({ pair, bias: 0, trend: new Array(12).fill(0) }));
      }
      const { trend } = computeRangeStats(rows, 2015, toYear);
      return pairLabels.map(pair => ({ pair, bias: trend[monthIdx], trend }));
    })
  );

  const data: Record<string, { bias: number; trend: number[] }> = {};
  for (const group of fetched) {
    for (const { pair, bias, trend } of group) data[pair] = { bias, trend };
  }

  allPairsCacheStore = { data, ts: Date.now() };
  return data;
}
