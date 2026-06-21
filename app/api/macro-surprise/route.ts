/**
 * /api/macro-surprise — Economic Surprise Index
 *
 * Score de surprise macro par devise sur 60 jours glissants.
 * actual_raw - forecast_raw → normalisé par std-dev → pondéré impact+indicateur → tanh → -100/+100
 * Cache Redis TTL 6h.
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";

const REDIS_KEY = "macro:surprise:v1";
const TTL_SECONDS = 6 * 3600;
const WINDOW_DAYS = 60;

const INDICATOR_WEIGHT: Record<string, number> = {
  "Non-Farm Payrolls": 5, "Unemployment Rate": 4, "Initial Jobless Claims": 2,
  "ADP Employment Change": 2, "CPI": 5, "Core CPI": 5, "PPI": 3,
  "Core PCE": 5, "PCE Price Index": 4, "GDP": 5, "Retail Sales": 4,
  "Industrial Production": 3, "Manufacturing PMI": 3, "Services PMI": 3,
  "ISM Manufacturing PMI": 4, "ISM Services PMI": 4, "Interest Rate Decision": 5,
  "Trade Balance": 3, "Current Account": 3,
};

function getIndicatorWeight(title: string): number {
  for (const [key, w] of Object.entries(INDICATOR_WEIGHT)) {
    if (title.includes(key)) return w;
  }
  return 1;
}

function parseNumeric(val: string | null | undefined): number | null {
  if (!val || val === "") return null;
  const cleaned = val.replace(/[%MBKmb\s,]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

export interface SurpriseScore {
  currency: string;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  strength: "strong" | "moderate" | "weak";
  eventCount: number;
  topEvents: Array<{ title: string; date: string; actual: number; forecast: number; surprise: number; surpriseNorm: number }>;
  trend: "improving" | "deteriorating" | "stable";
  updatedAt: string;
}

export interface MacroSurpriseData {
  currencies: Record<string, SurpriseScore>;
  generatedAt: string;
  windowDays: number;
  totalEvents: number;
}

async function computeSurpriseIndex(): Promise<MacroSurpriseData> {
  const BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://macrometrics-v2.vercel.app";

  const res = await fetch(`${BASE_URL}/api/forex-calendar`, { cache: "no-store" });
  if (!res.ok) throw new Error(`forex-calendar ${res.status}`);

  const events = await res.json() as Array<{
    currency: string; title: string; impact: string;
    timestamp: number; actual: string; forecast: string;
    previous: string; parisDate: string;
  }>;

  const now = Date.now();
  const cutoff60 = now - WINDOW_DAYS * 86400000;
  const cutoff30 = now - 30 * 86400000;
  const cutoff90 = now - 90 * 86400000;

  const released = events.filter(ev =>
    ev.timestamp <= now && ev.timestamp >= cutoff90 &&
    ev.actual !== "" && ev.forecast !== "" &&
    parseNumeric(ev.actual) !== null && parseNumeric(ev.forecast) !== null
  );

  const byCurrency: Record<string, typeof released> = {};
  for (const ev of released) {
    if (!byCurrency[ev.currency]) byCurrency[ev.currency] = [];
    byCurrency[ev.currency].push(ev);
  }

  const MAIN_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"];
  const currencies: Record<string, SurpriseScore> = {};

  for (const cur of MAIN_CURRENCIES) {
    const evs60 = (byCurrency[cur] || []).filter(e => e.timestamp >= cutoff60);
    const evs30 = evs60.filter(e => e.timestamp >= cutoff30);
    const evs30prev = evs60.filter(e => e.timestamp < cutoff30);

    if (evs60.length === 0) {
      currencies[cur] = { currency: cur, score: 0, direction: "neutral", strength: "weak", eventCount: 0, topEvents: [], trend: "stable", updatedAt: new Date().toISOString() };
      continue;
    }

    const allSurprises = evs60.map(e => parseNumeric(e.actual)! - parseNumeric(e.forecast)!);
    const sd = stdDev(allSurprises);

    function scoreEvents(evList: typeof released): number {
      if (evList.length === 0) return 0;
      let totalWeight = 0, weightedSum = 0;
      for (const e of evList) {
        const a = parseNumeric(e.actual), f = parseNumeric(e.forecast);
        if (a === null || f === null) continue;
        const surprise = a - f;
        const normalized = surprise / sd;
        const impactW = e.impact === "High" ? 3 : e.impact === "Medium" ? 1 : 0.5;
        const indicatorW = getIndicatorWeight(e.title);
        const weight = impactW * indicatorW;
        weightedSum += normalized * weight;
        totalWeight += weight;
      }
      if (totalWeight === 0) return 0;
      return Math.round(Math.tanh(weightedSum / totalWeight) * 100);
    }

    const score60 = scoreEvents(evs60);
    const score30 = scoreEvents(evs30);
    const scorePrev = scoreEvents(evs30prev);

    const topEvents = evs60
      .map(e => {
        const a = parseNumeric(e.actual)!, f = parseNumeric(e.forecast)!;
        const surprise = a - f;
        return { title: e.title, date: e.parisDate, actual: a, forecast: f, surprise, surpriseNorm: Math.round((surprise / sd) * 100) / 100 };
      })
      .sort((a, b) => Math.abs(b.surpriseNorm) - Math.abs(a.surpriseNorm))
      .slice(0, 3);

    currencies[cur] = {
      currency: cur,
      score: score60,
      direction: score60 > 10 ? "bullish" : score60 < -10 ? "bearish" : "neutral",
      strength: Math.abs(score60) >= 50 ? "strong" : Math.abs(score60) >= 20 ? "moderate" : "weak",
      eventCount: evs60.length,
      topEvents,
      trend: score30 > scorePrev + 15 ? "improving" : score30 < scorePrev - 15 ? "deteriorating" : "stable",
      updatedAt: new Date().toISOString(),
    };
  }

  return { currencies, generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, totalEvents: released.length };
}

export async function GET() {
  try {
    const cached = await kv.get<MacroSurpriseData>(REDIS_KEY);
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "public, s-maxage=3600" } });
    const data = await computeSurpriseIndex();
    await kv.set(REDIS_KEY, data, { ex: TTL_SECONDS });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[macro-surprise] error:", err);
    return NextResponse.json({ error: "Surprise index failed", detail: String(err) }, { status: 500 });
  }
}
