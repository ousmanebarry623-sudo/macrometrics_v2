// Shared MyFXBook Community Outlook logic
// Cache module-level + Redis partage entre toutes les routes serverless

import { kv } from "@/lib/redis";

const REDIS_KEY = "mfxbook:sentiment";
const REDIS_TS_KEY = "mfxbook:sentiment:ts";
const REDIS_TTL = 15 * 60;
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export type MfxSource =
  | "module-cache"
  | "redis"
  | "auth"
  | "public-api"
  | "scrape-json"
  | "scrape-html"
  | "dukascopy"
  | "none";

export interface MfxResult {
  data: Record<string, number>;
  source: MfxSource;
  ts: number;
  stale: boolean;
  error?: string;
}

export interface MfxStatus {
  lastSource: MfxSource;
  lastFetchTs: number;
  cacheAgeMs: number;
  hasSession: boolean;
  sessionExpiresInMs: number | null;
  redisConfigured: boolean;
  pairsCount: number;
}

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

let mapCache: { data: Record<string, number>; ts: number } | null = null;
const MAP_TTL = 15 * 60 * 1000;

let mfxSession: { id: string; expiry: number } | null = null;

let lastMeta: { source: MfxSource; ts: number } = { source: "none", ts: 0 };

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

async function tryAuthFetch(): Promise<Record<string, number> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getMfxSession();
    if (!session) return null;
    try {
      const res  = await fetch(
        `https://www.myfxbook.com/api/get-community-outlook.json?session=${session}`,
        { cache: "no-store", signal: AbortSignal.timeout(10000) }
      );
      const data = await res.json();
      const sessionErr = data?.error && typeof data.message === "string" &&
        /session|login|auth/i.test(data.message);
      if (sessionErr && attempt === 0) {
        mfxSession = null;
        continue;
      }
      if (!data.error && data.symbols) {
        const parsed = parseSymbols(data.symbols);
        if (Object.keys(parsed).length > 0) return parsed;
      }
      if (data.error) mfxSession = null;
      return null;
    } catch {
      mfxSession = null;
      return null;
    }
  }
  return null;
}

export async function fetchMyfxbookMapWithMeta(): Promise<MfxResult> {
  const now = Date.now();

  if (mapCache && now - mapCache.ts < MAP_TTL) {
    return {
      data: mapCache.data,
      source: "module-cache",
      ts: mapCache.ts,
      stale: false,
    };
  }

  let redisFallback: MfxResult | null = null;
  try {
    const cached = await kv.get<Record<string, number>>(REDIS_KEY);
    const ts = (await kv.get<number>(REDIS_TS_KEY)) ?? 0;
    if (cached && Object.keys(cached).length > 0) {
      mapCache = { data: cached, ts: ts || now };
      const age = now - (ts || now);
      if (age < STALE_THRESHOLD_MS) {
        lastMeta = { source: "redis", ts: ts || now };
        return { data: cached, source: "redis", ts: ts || now, stale: false };
      }
      redisFallback = { data: cached, source: "redis", ts: ts || now, stale: true };
    }
  } catch { /* Redis indisponible */ }

  const authResult = await tryAuthFetch();
  if (authResult) {
    mapCache = { data: authResult, ts: now };
    lastMeta = { source: "auth", ts: now };
    kv.set(REDIS_KEY, authResult, { ex: REDIS_TTL }).catch(() => {});
    kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
    return { data: authResult, source: "auth", ts: now, stale: false };
  }

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
          mapCache = { data: result, ts: now };
          lastMeta = { source: "public-api", ts: now };
          kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
          kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
          return { data: result, source: "public-api", ts: now, stale: false };
        }
      }
    }
  } catch { /* continue */ }

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
            mapCache = { data: result, ts: now };
            lastMeta = { source: "scrape-json", ts: now };
            kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
            kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
            return { data: result, source: "scrape-json", ts: now, stale: false };
          }
        } catch { continue; }
      }

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
        mapCache = { data: result, ts: now };
        lastMeta = { source: "scrape-html", ts: now };
        kv.set(REDIS_KEY, result, { ex: REDIS_TTL }).catch(() => {});
        kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
        return { data: result, source: "scrape-html", ts: now, stale: false };
      }
    }
  } catch { /* silently fail */ }

  // ── Dukascopy SWFX fallback (public, no auth) ──────────────────────────────
  const DUKA_PAIRS = [
    "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
    "EURGBP","EURJPY","EURCHF","EURCAD","EURAUD","EURNZD",
    "GBPJPY","GBPCHF","GBPCAD","GBPAUD","GBPNZD",
    "AUDJPY","AUDCAD","AUDNZD","NZDJPY","CADJPY","CHFJPY",
    "XAUUSD","XAGUSD",
  ];
  try {
    const dukaResults = await Promise.allSettled(
      DUKA_PAIRS.map(sym =>
        fetch(`https://freeserv.dukascopy.com/2.0/?path=swfx/sentiment&instrument=${sym}&format=json`, {
          cache: "no-store",
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        })
        .then(r => r.ok ? r.json() : null)
        .then(d => ({ sym, longPct: d?.buyVolume != null ? Math.round(d.buyVolume * 100) : null }))
        .catch(() => ({ sym, longPct: null }))
      )
    );
    const dukaMap: Record<string, number> = {};
    for (const r of dukaResults) {
      if (r.status === "fulfilled" && r.value.longPct !== null) {
        dukaMap[mfxFormatPair(r.value.sym)] = r.value.longPct;
      }
    }
    if (Object.keys(dukaMap).length >= 5) {
      mapCache = { data: dukaMap, ts: now };
      lastMeta = { source: "dukascopy", ts: now };
      kv.set(REDIS_KEY, dukaMap, { ex: REDIS_TTL }).catch(() => {});
      kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
      return { data: dukaMap, source: "dukascopy", ts: now, stale: false };
    }
  } catch { /* continue */ }

  if (redisFallback) {
    lastMeta = { source: "redis", ts: redisFallback.ts };
    return { ...redisFallback, error: "all-sources-failed" };
  }

  return {
    data: {},
    source: "none",
    ts: now,
    stale: true,
    error: "all-sources-failed",
  };
}

export async function fetchMyfxbookMap(): Promise<Record<string, number>> {
  const result = await fetchMyfxbookMapWithMeta();
  return result.data;
}

export function setMyfxbookCache(data: Record<string, number>): void {
  if (Object.keys(data).length > 0) {
    const now = Date.now();
    mapCache = { data, ts: now };
    kv.set(REDIS_KEY, data, { ex: REDIS_TTL }).catch(() => {});
    kv.set(REDIS_TS_KEY, now, { ex: REDIS_TTL }).catch(() => {});
  }
}

export function getMyfxbookStatus(): MfxStatus {
  const now = Date.now();
  return {
    lastSource: lastMeta.source,
    lastFetchTs: lastMeta.ts,
    cacheAgeMs: mapCache ? now - mapCache.ts : -1,
    hasSession: !!mfxSession,
    sessionExpiresInMs: mfxSession ? Math.max(0, mfxSession.expiry - now) : null,
    redisConfigured: !!process.env.REDIS_URL,
    pairsCount: mapCache ? Object.keys(mapCache.data).length : 0,
  };
}
