export const dynamic = "force-dynamic";
import { G8_PAIRS, type G8Pair } from "@/lib/g8-pairs";

// ── Google Sheets public ID ─────────────────────────────────────────────────
const SHEET_ID = "1hVlCN-fdH30zAVasyoEsUCkcGtyxzSPOxLaJQ3F01cY";
const GSHEET_TTL = 2 * 60 * 60 * 1000; // 2 h

// ── Types ───────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface MonthStat {
  month: string;
  avg: number; median: number; positive: number;
  best: number; worst: number; count: number;
}
interface YearlyRow { year: number; returns: (number | null)[]; }
interface SeasonalityResult {
  pair: string; group: string;
  stats: MonthStat[];
  yearlyData: YearlyRow[];
  source: "gsheets" | "yahoo";
}

// ── Server-side cache for Google Sheets data ────────────────────────────────
const gsheetCache = new Map<string, { data: YearlyRow[]; ts: number }>();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "EUR/USD" → "EURUSD" */
function pairToTab(label: string) { return label.replace("/", ""); }

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

/**
 * Parse French/English percentage:
 *  "-6,70%"  → -6.70
 *  "-6.70%"  → -6.70
 *  "-0.067"  → -6.7  (raw Google Sheets fraction)
 */
function parsePct(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^"+|"+$/g, ""); // strip surrounding quotes
  if (!s) return null;

  const isPercent = s.endsWith("%");
  s = s.replace("%", "").replace(",", ".").trim();

  const v = parseFloat(s);
  if (isNaN(v)) return null;

  if (isPercent) return parseFloat(v.toFixed(4));
  // Raw Google Sheets fraction stored as decimal (e.g. -0.067 = -6.7%)
  if (Math.abs(v) < 1) return parseFloat((v * 100).toFixed(4));
  return parseFloat(v.toFixed(4));
}

/**
 * Parse "DD/MM/YYYY" (French date format) → { year, month (0-indexed) }
 */
function parseDate(raw: string): { year: number; month: number } | null {
  const s = raw.trim().replace(/^"+|"+$/g, "");
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const year  = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(year) || month < 0 || month > 11) return null;
  return { year, month };
}

function computeStats(yearlyData: YearlyRow[]): MonthStat[] {
  return MONTHS.map((month, i) => {
    const vals = yearlyData.map(y => y.returns[i]).filter((v): v is number => v !== null);
    if (!vals.length) return { month, avg: 0, median: 0, positive: 50, best: 0, worst: 0, count: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const positive = (vals.filter(v => v > 0).length / vals.length) * 100;
    return {
      month, count: vals.length,
      avg:      parseFloat(avg.toFixed(3)),
      median:   parseFloat(median.toFixed(3)),
      positive: parseFloat(positive.toFixed(1)),
      best:     parseFloat(Math.max(...vals).toFixed(3)),
      worst:    parseFloat(Math.min(...vals).toFixed(3)),
    };
  });
}

// ── Google Sheets fetcher ───────────────────────────────────────────────────
async function fetchFromSheets(pairLabel: string): Promise<YearlyRow[] | null> {
  const tab = pairToTab(pairLabel); // "EUR/USD" → "EURUSD"

  // Check cache
  const hit = gsheetCache.get(tab);
  if (hit && Date.now() - hit.ts < GSHEET_TTL) return hit.data;

  // gviz endpoint – works for publicly shared spreadsheets, no API key needed
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const text = await res.text();

    // Google returns JS error wrapper when sheet doesn't exist
    if (text.startsWith("/*") || text.includes("setResponse")) return null;

    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;

    const byYear: Record<number, (number | null)[]> = {};

    for (const line of lines.slice(1)) { // skip header
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
      .sort((a, b) => b.year - a.year);

    if (!result.length) return null;

    gsheetCache.set(tab, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

// ── Yahoo Finance fallback ──────────────────────────────────────────────────
async function fetchFromYahoo(pair: G8Pair): Promise<YearlyRow[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair.yf)}?interval=1mo&range=20y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.yahoo.com/" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const opens:  (number | null)[] = result.indicators?.quote?.[0]?.open  ?? [];

    const byYear: Record<number, (number | null)[]> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const d     = new Date(timestamps[i] * 1000);
      const year  = d.getFullYear();
      const month = d.getMonth();
      const open  = opens[i]  ?? null;
      const close = closes[i] ?? null;
      const ret   = (open && close && open > 0) ? parseFloat(((close - open) / open * 100).toFixed(4)) : null;
      if (!byYear[year]) byYear[year] = Array(12).fill(null);
      byYear[year][month] = ret;
    }

    return Object.entries(byYear)
      .map(([y, rets]) => ({ year: parseInt(y), returns: rets }))
      .sort((a, b) => b.year - a.year);
  } catch {
    return [];
  }
}

// ── Route handler ───────────────────────────────────────────────────────────
export async function GET() {
  const results = await Promise.allSettled(
    G8_PAIRS.map(async (p): Promise<SeasonalityResult> => {
      // 1. Try user's Google Sheets first
      const sheetsData = await fetchFromSheets(p.label);
      if (sheetsData && sheetsData.length > 0) {
        return {
          pair: p.label,
          group: p.group,
          stats: computeStats(sheetsData),
          yearlyData: sheetsData,
          source: "gsheets",
        };
      }

      // 2. Fallback to Yahoo Finance
      const yahooData = await fetchFromYahoo(p);
      return {
        pair: p.label,
        group: p.group,
        stats: computeStats(yahooData),
        yearlyData: yahooData,
        source: "yahoo",
      };
    })
  );

  const all: SeasonalityResult[] = G8_PAIRS.map((p, i) => {
    const r = results[i];
    if (r.status === "fulfilled") return r.value;
    return { pair: p.label, group: p.group, stats: computeStats([]), yearlyData: [], source: "yahoo" };
  });

  return Response.json(all);
}
