// Shared MyFXBook Community Outlook logic
// Cache module-level + Redis partagé entre toutes les routes serverless

import { kv } from "@/lib/redis";

const REDIS_KEY = "mfxbook:sentiment";
const REDIS_TTL = 15 * 60; // 15 minutes en secondes

export const MFX_PAIR_MAP: Record<string, string> = {
  EURUSD:"EUR/USD", GBPUSD:"GBP/USD", USDJPY:"USD/JPY", USDCHF:"USD/CHF",
  USDCAD:"USD/CAD", AUDUSD:"AUD/USD", NZDUSD:"NZD/USD",
  EURGBP:"EUR/GBP", EURJPY:"EUR/JPY", EURCHF:"EUR/CHF", EURCAD:"EUR/CAD",
  EURAUD:"EUR/AUD", EURNZD:"EUR/NZD",
  GBPJPY:"GBP/JPY", GBPCHF:"GBP/CHF", GBPCAD:"GBP/CAD",
  GBPAUD:"GBP/AUD", GBPNZD:"GBP/NZD",
  AUDJPY:"AUD/JPY", AUDCAD:"AUD/CAD", AUDNZD:"AUD/NZD",
  NZDJPY:"NZD/JPY", CADJPY:"CAD/JPY", CHFJPY:"CHF/JPY",
  XAUUSD:"XAU/USD", XAGUSD:"XAG/USD",
};

export function mfxFormatPair(key: string): string {
  return MFX_PAIR_MAP[key.toUpperCase()] ?? key.replace(/([A-Z]{3})([A-Z]{3})/, "$1/$2");
}

// ── Cache module-level (partagé) ─────────────────────────────────────────────
// pair → longPct (ex: "EUR/USD" → 23)
let mapCache: { data: Record<string, number>; ts: number } | null = null;
const MAP_TTL = 15 * 60 * 1000; // 15 min

// Session auth MyFXBook
let mfxSession: { id: string; expiry: number } | null = null;

// ── Auth avec credentials env ─────────────────────────────────────────────────
async function getMfxSession(): Promise<string | null> {
  if (mfxSession && Date.now() < mfxSession.expiry) return mfxSession.id;
  const email    = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) return null;
  try {
    const res  = await fetch(
      `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data.error || !data.session) return null;
    mfxSession = { id: data.session, expiry: Date.now() + 50 * 60 * 1000 };
    return mfxSession.id;
  } catch { return null; }
}

function parseSymbols(symbols: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (Array.isArray(symbols)) {
    for (const item of symbols as Record<string, number & string>[]) {
      const name    = String(item.name ?? "");
      const longPct = Math.round(Number(item.longPercentage ?? (100 - (item.shortPercentage ?? 50))));
      if (name && longPct >= 0 && longPct <= 100) result[mfxFormatPair(name)] = longPct;
    }
  } else if (symbols && typeof symbols === "object") {
    for (const [key, val] of Object.entries(symbols) as [string, Record<string, number>][]) {
      const longPct = Math.round(val?.longPercentage ?? (100 - (val?.shortPercentage ?? 50)));
      if (longPct >= 0 && longPct <= 100) result[mfxFormatPair(key)] = longPct;
    }
  }
  return result;
}

// ── Fetch principal : Redis → auth → API public → scrape HTML ────────────────
// Retourne Record<pair, longPct> ex: { "EUR/USD": 23, "GBP/USD": 43, ... }
export async function fetchMyfxbookMap(): Promise<Record<string, number>> {
  // Cache module-level (warm instance)
  if (mapCache && Date.now() - mapCache.ts < MAP_TTL) return mapCache.data;

  // Cache Redis partagé (survit aux nouvelles invocations serverless)
  try {
    const cached = await kv.get<Record<string, number>>(REDIS_KEY);
    if (cached && Object.keys(cached).length > 0) {
      mapCache = { data: cached, ts: Date.now() };
      return cached;
    }
  } catch { /* Redis indisponible → continuer */ }

  // Tentative 1 : Auth avec credentials
  try {
    const session = await getMfxSession();
    if (session) {
      const res  = await fetch(
        `https://www.myfxbook.com/api/get-community-outlook.json?session=${session}`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) }
      );
      const data = await res.json();
      if (!data.error && data.symbols) {
        const result = parseSymbols(data.symbols);
        if (Object.keys(result).length > 0) {
          mapCache = { data: result, ts: Date.now() };
          kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
          return result;
        }
      }
      mfxSession = null;
    }
  } catch { mfxSession = null; }

  // Tentative 2 : API sans session (parfois publique)
  try {
    const apiRes = await fetch(
      "https://www.myfxbook.com/api/get-community-outlook.json",
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      if (apiData && !apiData.error && apiData.symbols) {
        const result = parseSymbols(apiData.symbols);
        if (Object.keys(result).length > 0) {
          mapCache = { data: result, ts: Date.now() };
          kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
          return result;
        }
      }
    }
  } catch { /* continue */ }

  // Tentative 3 : Scrape page HTML
  try {
    const pageRes = await fetch("https://www.myfxbook.com/community/outlook", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": "https://www.myfxbook.com/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const jsonPatterns: RegExp[] = [
        /var\s+_outlookData\s*=\s*(\[[\s\S]*?\]);/,
        /var\s+outlookData\s*=\s*(\[[\s\S]*?\]);/,
        /"communityOutlook"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
        /communityOutlookData\s*=\s*(\[[\s\S]*?\])\s*;/,
        /"symbols"\s*:\s*(\[[\s\S]{20,5000}?\])\s*[,}]/,
      ];
      for (const pat of jsonPatterns) {
        const m = html.match(pat);
        if (!m) continue;
        try {
          const arr = JSON.parse(m[1]);
          if (!Array.isArray(arr) || arr.length === 0) continue;
          const result = parseSymbols(arr);
          if (Object.keys(result).length > 0) {
            mapCache = { data: result, ts: Date.now() };
            kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
            return result;
          }
        } catch { continue; }
      }

      // Tentative 4 : Parser les % directement dans le HTML
      const KNOWN_PAIRS = [
        "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
        "EURGBP","EURJPY","EURCHF","EURCAD","EURAUD","EURNZD",
        "GBPJPY","GBPCHF","GBPCAD","GBPAUD","GBPNZD",
        "AUDJPY","AUDCAD","AUDNZD","NZDJPY","CADJPY","CHFJPY",
        "XAUUSD","XAGUSD",
      ];
      const result: Record<string, number> = {};
      for (const sym of KNOWN_PAIRS) {
        const re = new RegExp(
          `${sym}[\\s\\S]{0,400}?(\\d{1,3}\\.?\\d{0,2})\\s*%[\\s\\S]{0,80}?(\\d{1,3}\\.?\\d{0,2})\\s*%`,
          "i"
        );
        const m = html.match(re);
        if (!m) continue;
        const a = parseFloat(m[1]), b = parseFloat(m[2]);
        if (!isNaN(a) && !isNaN(b) && Math.abs(a + b - 100) < 5) {
          result[mfxFormatPair(sym)] = Math.round(a);
        }
      }
      if (Object.keys(result).length > 0) {
        mapCache = { data: result, ts: Date.now() };
        kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
        return result;
      }
    }
  } catch { /* silently fail */ }

  return {};
}

// Force invalidation du cache (utile depuis retail-sentiment après un fetch réussi)
export function setMyfxbookCache(data: Record<string, number>): void {
  if (Object.keys(data).length > 0) {
    mapCache = { data, ts: Date.now() };
    kv.set(REDIS_KEY, data, { ex: REDIS_TTL }).catch(() => {});
  }
}
