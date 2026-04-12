export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";

const TV_URL  = "https://economic-calendar.tradingview.com/events";
const COUNTRIES = "US,EU,GB,JP,CA,AU,CH,NZ,CN";
const TTL     = 90 * 1000; // 90 secondes seulement

interface TVEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  importance: number;
  date: string;
  actual: string | number | null;
  previous: string | number | null;
  forecast: string | number | null;
  actualRaw: number | null;
  previousRaw: number | null;
  forecastRaw: number | null;
  indicator: string;
  unit?: string;
  scale?: string;
}

export interface CalEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: "High" | "Medium" | "Low";
  parisDate: string;
  parisTime: string;
  timestamp: number;
  actual: string;
  previous: string;
  forecast: string;
  indicator: string;
  unit: string;
}

function impactLabel(n: number): "High" | "Medium" | "Low" {
  if (n >= 1)  return "High";
  if (n === 0) return "Medium";
  return "Low";
}

function fmtVal(raw: number | null, display: string | number | null, unit: string, scale: string): string {
  if (raw === null && (display === null || display === "")) return "";
  const base = raw !== null ? raw : display;
  if (base === null) return "";
  let n = Number(base);
  if (isNaN(n)) return String(display ?? "");
  // Apply scale
  if (scale === "B") n = n / 1_000_000_000;
  else if (scale === "M") n = n / 1_000_000;
  else if (scale === "K") n = n / 1_000;
  // Format
  const s = n % 1 === 0 ? String(n) : n.toFixed(Math.abs(n) < 1 ? 2 : 1);
  return unit ? `${s}${unit}` : s;
}

// Module-level cache
let cacheData: CalEvent[] | null = null;
let cacheTTL  = 0;

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!force && cacheData && Date.now() < cacheTTL) {
    return NextResponse.json(cacheData, {
      headers: { "X-Cache": "HIT", "X-Cache-Age": String(Math.round((cacheTTL - Date.now()) / 1000)) + "s" },
    });
  }

  try {
    // Plage : dimanche de cette semaine → +14 jours
    const now   = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 14);
    end.setUTCHours(23, 59, 59, 999);

    const url = `${TV_URL}?from=${start.toISOString()}&to=${end.toISOString()}&countries=${COUNTRIES}`;

    const res = await fetch(url, {
      cache: "no-store",          // ← pas de cache HTTP Next.js
      headers: {
        "Origin":     "https://www.tradingview.com",
        "Referer":    "https://www.tradingview.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      },
    });

    if (!res.ok) throw new Error(`TV API ${res.status}`);

    const json = await res.json();
    const raw: TVEvent[] = json.result ?? [];

    const events: CalEvent[] = raw.map(ev => {
      const d         = new Date(ev.date);
      const parisDate = d.toLocaleDateString("en-CA",  { timeZone: "Europe/Paris" });
      const parisTime = d.toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false,
      });

      const unit  = ev.unit  ?? "";
      const scale = ev.scale ?? "";

      return {
        id:        ev.id,
        title:     ev.title,
        country:   ev.country,
        currency:  ev.currency,
        impact:    impactLabel(ev.importance),
        parisDate,
        parisTime,
        timestamp: d.getTime(),
        actual:    fmtVal(ev.actualRaw,   ev.actual,   unit, scale),
        previous:  fmtVal(ev.previousRaw, ev.previous, unit, scale),
        forecast:  fmtVal(ev.forecastRaw, ev.forecast, unit, scale),
        indicator: ev.indicator,
        unit,
      };
    });

    events.sort((a, b) => a.timestamp - b.timestamp);

    cacheData = events;
    cacheTTL  = Date.now() + TTL;

    return NextResponse.json(events, {
      headers: { "X-Cache": "MISS", "X-Total": String(events.length) },
    });
  } catch (err) {
    console.error("forex-calendar error:", err);
    // Renvoie le cache expiré plutôt qu'une erreur si disponible
    if (cacheData) return NextResponse.json(cacheData, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
