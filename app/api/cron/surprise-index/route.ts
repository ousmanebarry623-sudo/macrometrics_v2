/**
 * /api/cron/surprise-index — Vercel Cron: toutes les 6h
 * Recompute surprise index → stocke Redis.
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/redis";

const REDIS_KEY = "macro:surprise:v1";
const TTL_SECONDS = 6 * 3600;

function parseNumeric(val: string | null | undefined): number | null {
  if (!val || val === "") return null;
  const n = parseFloat(val.replace(/[%MBKmb\s,]/g, ""));
  return isNaN(n) ? null : n;
}

const INDICATOR_WEIGHT: Record<string, number> = {
  "Non-Farm Payrolls": 5, "Unemployment Rate": 4, "Initial Jobless Claims": 2,
  "ADP Employment Change": 2, "CPI": 5, "Core CPI": 5, "PPI": 3,
  "Core PCE": 5, "PCE Price Index": 4, "GDP": 5, "Retail Sales": 4,
  "Industrial Production": 3, "Manufacturing PMI": 3, "Services PMI": 3,
  "ISM Manufacturing PMI": 4, "ISM Services PMI": 4, "Interest Rate Decision": 5,
  "Trade Balance": 3, "Current Account": 3,
};
function getW(title: string): number {
  for (const [k, v] of Object.entries(INDICATOR_WEIGHT)) { if (title.includes(k)) return v; }
  return 1;
}
function stdDev(vals: number[]): number {
  if (vals.length < 2) return 1;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length) || 1;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://macrometrics-v2.vercel.app";
    const res = await fetch(`${baseUrl}/api/forex-calendar`, { cache: "no-store" });
    if (!res.ok) throw new Error(`calendar fetch ${res.status}`);
    const events = await res.json() as Array<{ currency: string; title: string; impact: string; timestamp: number; actual: string; forecast: string; parisDate: string }>;

    const now = Date.now();
    const c60 = now - 60 * 86400000, c30 = now - 30 * 86400000, c90 = now - 90 * 86400000;
    const released = events.filter(e => e.timestamp <= now && e.timestamp >= c90 && e.actual !== "" && e.forecast !== "" && parseNumeric(e.actual) !== null && parseNumeric(e.forecast) !== null);

    const byCur: Record<string, typeof released> = {};
    for (const e of released) { if (!byCur[e.currency]) byCur[e.currency] = []; byCur[e.currency].push(e); }

    const CURS = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"];
    const currencies: Record<string, unknown> = {};
    for (const cur of CURS) {
      const e60 = (byCur[cur] || []).filter(e => e.timestamp >= c60);
      const e30 = e60.filter(e => e.timestamp >= c30);
      const ePrev = e60.filter(e => e.timestamp < c30);
      if (e60.length === 0) { currencies[cur] = { currency: cur, score: 0, direction: "neutral", strength: "weak", eventCount: 0, topEvents: [], trend: "stable", updatedAt: new Date().toISOString() }; continue; }
      const surps = e60.map(e => parseNumeric(e.actual)! - parseNumeric(e.forecast)!);
      const sd = stdDev(surps);
      function sc(evs: typeof released): number {
        if (!evs.length) return 0;
        let tw = 0, ws = 0;
        for (const e of evs) { const a = parseNumeric(e.actual), f = parseNumeric(e.forecast); if (a===null||f===null) continue; const n=(a-f)/sd; const iw=e.impact==="High"?3:e.impact==="Medium"?1:0.5; const w=iw*getW(e.title); ws+=n*w; tw+=w; }
        return tw===0?0:Math.round(Math.tanh(ws/tw)*100);
      }
      const s60=sc(e60), s30=sc(e30), sP=sc(ePrev);
      const top=e60.map(e=>{const a=parseNumeric(e.actual)!,f=parseNumeric(e.forecast)!,s=a-f;return{title:e.title,date:e.parisDate,actual:a,forecast:f,surprise:s,surpriseNorm:Math.round((s/sd)*100)/100};}).sort((a,b)=>Math.abs(b.surpriseNorm)-Math.abs(a.surpriseNorm)).slice(0,3);
      currencies[cur]={currency:cur,score:s60,direction:s60>10?"bullish":s60<-10?"bearish":"neutral",strength:Math.abs(s60)>=50?"strong":Math.abs(s60)>=20?"moderate":"weak",eventCount:e60.length,topEvents:top,trend:s30>sP+15?"improving":s30<sP-15?"deteriorating":"stable",updatedAt:new Date().toISOString()};
    }
    const data = { currencies, generatedAt: new Date().toISOString(), windowDays: 60, totalEvents: released.length };
    await kv.set(REDIS_KEY, data, { ex: TTL_SECONDS });
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString(), currencies: Object.keys(currencies).length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
