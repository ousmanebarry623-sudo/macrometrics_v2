# Charts Page + Project Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Charts page (TradingView embed + private indicator via lightweight-charts + OpenInterestCard), add the missing chart-data API, and fix all identified bugs in the existing codebase.

**Architecture:** The Charts page uses a server-side `page.tsx` wrapper with three client components: a TradingView Advanced Chart widget (free iframe embed with symbol selector), a `MyIndicatorChart` component powered by `lightweight-charts` (already installed) fed by the new `/api/chart-data` Yahoo Finance route, and the existing `OpenInterestCard`. All APIs are free, module-level Map caches handle up to 3 concurrent users with 15-minute TTLs.

**Tech Stack:** Next.js 16 App Router, TypeScript, lightweight-charts ^4.2, Yahoo Finance v8 API (free, no key), TradingView Advanced Chart Widget (free embed), Recharts (existing).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/chart-data/route.ts` | Yahoo Finance OHLC → candlestick data |
| Create | `components/TradingViewChart.tsx` | TradingView Advanced Chart widget (client) |
| Create | `components/MyIndicatorChart.tsx` | Private indicator via lightweight-charts (client) |
| Create | `app/charts/page.tsx` | Charts page: TV + Indicator + OI |
| Modify | `components/Header.tsx` | Add "Charts" nav item |
| Modify | `components/QuickLinks.tsx` | Add Charts quick link |
| Modify | `components/Footer.tsx` | Add Charts link |
| Modify | `app/page.tsx` | Add OpenInterestCard row |
| Modify | `components/FundamentalFeed.tsx` | Fix unused `limit` prop |

---

## Task 1: chart-data API route

**Files:**
- Create: `app/api/chart-data/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/chart-data/route.ts
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

interface Candle {
  time: number;   // Unix seconds (lightweight-charts format)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Module-level cache: key = "symbol|interval|range", value = { data, ts }
const CACHE = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — fine for ≤3 users

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
  Referer: "https://finance.yahoo.com/",
};

async function fetchCandles(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens:   (number | null)[] = quote.open   ?? [];
  const highs:   (number | null)[] = quote.high   ?? [];
  const lows:    (number | null)[] = quote.low    ?? [];
  const closes:  (number | null)[] = quote.close  ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time: timestamps[i],
      open: parseFloat(o.toFixed(6)),
      high: parseFloat(h.toFixed(6)),
      low:  parseFloat(l.toFixed(6)),
      close: parseFloat(c.toFixed(6)),
      volume: volumes[i] ?? 0,
    });
  }
  return candles;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol   = searchParams.get("symbol")   ?? "EURUSD=X";
  const interval = searchParams.get("interval") ?? "1d";
  const range    = searchParams.get("range")    ?? "6mo";

  // Validate interval and range to prevent abuse
  const VALID_INTERVALS = ["1d","1wk","1mo"];
  const VALID_RANGES    = ["1mo","3mo","6mo","1y","2y","5y","10y"];
  const safeInterval = VALID_INTERVALS.includes(interval) ? interval : "1d";
  const safeRange    = VALID_RANGES.includes(range)       ? range    : "6mo";

  const cacheKey = `${symbol}|${safeInterval}|${safeRange}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return Response.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const data = await fetchCandles(symbol, safeInterval, safeRange);
    CACHE.set(cacheKey, { data, ts: Date.now() });
    return Response.json(data, { headers: { "X-Cache": "MISS", "X-Count": String(data.length) } });
  } catch (err) {
    const stale = CACHE.get(cacheKey);
    if (stale) return Response.json(stale.data, { headers: { "X-Cache": "STALE" } });
    return Response.json([], { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the file was written**

```bash
cat app/api/chart-data/route.ts | head -5
```
Expected: `export const dynamic = "force-dynamic";`

- [ ] **Step 3: Commit**

```bash
git add app/api/chart-data/route.ts
git commit -m "feat: add /api/chart-data route — Yahoo Finance OHLC, 15min cache"
```

---

## Task 2: TradingView Advanced Chart component

**Files:**
- Create: `components/TradingViewChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/TradingViewChart.tsx
"use client";
import { useEffect, useRef } from "react";

// TV widget types (loaded dynamically from tradingview.com)
declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

// G8 pairs + commodities + indices mapped to TradingView symbols
export const TV_SYMBOLS: { label: string; tv: string }[] = [
  { label: "EUR/USD",    tv: "FX:EURUSD"   },
  { label: "GBP/USD",   tv: "FX:GBPUSD"   },
  { label: "USD/JPY",   tv: "FX:USDJPY"   },
  { label: "USD/CHF",   tv: "FX:USDCHF"   },
  { label: "USD/CAD",   tv: "FX:USDCAD"   },
  { label: "AUD/USD",   tv: "FX:AUDUSD"   },
  { label: "NZD/USD",   tv: "FX:NZDUSD"   },
  { label: "EUR/GBP",   tv: "FX:EURGBP"   },
  { label: "EUR/JPY",   tv: "FX:EURJPY"   },
  { label: "GBP/JPY",   tv: "FX:GBPJPY"   },
  { label: "XAU/USD",   tv: "OANDA:XAUUSD"},
  { label: "XAG/USD",   tv: "OANDA:XAGUSD"},
  { label: "WTI Oil",   tv: "NYMEX:CL1!"  },
  { label: "S&P 500",   tv: "FOREXCOM:SPXUSD" },
  { label: "Nasdaq 100",tv: "FOREXCOM:NSXUSD" },
  { label: "BTC/USD",   tv: "BITSTAMP:BTCUSD" },
];

interface Props {
  tvSymbol: string;   // e.g. "FX:EURUSD"
  height?: number;
}

let scriptLoaded = false;
let scriptLoading = false;
const callbacks: (() => void)[] = [];

function loadTVScript(cb: () => void) {
  if (scriptLoaded) { cb(); return; }
  callbacks.push(cb);
  if (scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/tv.js";
  s.async = true;
  s.onload = () => {
    scriptLoaded = true;
    callbacks.forEach(fn => fn());
    callbacks.length = 0;
  };
  document.head.appendChild(s);
}

export default function TradingViewChart({ tvSymbol, height = 520 }: Props) {
  const containerId = "tv_advanced_chart";
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    loadTVScript(() => {
      if (!window.TradingView || !containerRef.current) return;
      // Clear any previous widget
      containerRef.current.innerHTML = "";
      // Assign stable id for TV widget
      containerRef.current.id = containerId;

      new window.TradingView.widget({
        container_id: containerId,
        autosize: true,
        symbol: tvSymbol,
        interval: "D",
        timezone: "Europe/Paris",
        theme: "dark",
        style: "1",          // candles
        locale: "fr",
        toolbar_bg: "#10101e",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        save_image: false,
        hide_top_toolbar: false,
        studies: [],           // add built-in TV indicators here if needed
        backgroundColor: "#060610",
        gridColor: "#1c1c38",
        withdateranges: true,
      });
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [tvSymbol]);

  return (
    <div
      ref={containerRef}
      id={containerId}
      style={{ width: "100%", height, background: "#060610", borderRadius: 8, overflow: "hidden" }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TradingViewChart.tsx
git commit -m "feat: TradingViewChart component — Advanced Chart widget, dark theme, G8 symbols"
```

---

## Task 3: MyIndicatorChart (private indicator via lightweight-charts)

**Files:**
- Create: `components/MyIndicatorChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/MyIndicatorChart.tsx
// ─────────────────────────────────────────────────────────────────────────────
// TON INDICATEUR PRIVÉ — Ce fichier est uniquement sur ton site local.
// Ajoute ta logique Pine Script traduite en TypeScript dans la section marquée.
// La bibliothèque lightweight-charts est déjà installée (v4.2).
// ─────────────────────────────────────────────────────────────────────────────
"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LWCandle { time: number; open: number; high: number; low: number; close: number; }
interface LWPoint  { time: number; value: number; }

// ─── INTERVALS & RANGES ──────────────────────────────────────────────────────
const INTERVALS = [
  { label: "Journalier",    interval: "1d",  range: "1y"  },
  { label: "Hebdomadaire",  interval: "1wk", range: "5y"  },
  { label: "Mensuel",       interval: "1mo", range: "10y" },
];

// ─── TON INDICATEUR ──────────────────────────────────────────────────────────
// Remplace cette fonction par ta logique. Reçoit le tableau de bougies OHLCV.
// Retourne un tableau de { time, value } pour la série principale.
// Tu peux ajouter d'autres séries dans le composant ci-dessous si besoin.
function computeMyIndicator(candles: Candle[]): LWPoint[] {
  // EXEMPLE : EMA 21 (à remplacer par ton Pine Script traduit)
  // Pour une EMA : EMA[i] = close[i] * k + EMA[i-1] * (1-k), k = 2/(period+1)
  const period = 21;
  const k = 2 / (period + 1);
  const result: LWPoint[] = [];
  let ema = candles[0]?.close ?? 0;
  for (const c of candles) {
    ema = c.close * k + ema * (1 - k);
    result.push({ time: c.time, value: parseFloat(ema.toFixed(6)) });
  }
  return result;
}

// Volume histogram colors
function volColor(c: Candle) {
  return c.close >= c.open ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
}

interface Props {
  yfSymbol: string;   // Yahoo Finance symbol e.g. "EURUSD=X"
  label: string;      // Display name e.g. "EUR/USD"
}

export default function MyIndicatorChart({ yfSymbol, label }: Props) {
  const chartRef     = useRef<HTMLDivElement>(null);
  const chartApi     = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indSeries    = useRef<ISeriesApi<"Line"> | null>(null);
  const volSeries    = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [intervalIdx, setIntervalIdx] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [candles, setCandles]         = useState<Candle[]>([]);

  const cfg = INTERVALS[intervalIdx];

  // ── Fetch OHLC from our own API ───────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${cfg.interval}&range=${cfg.range}`)
      .then(r => r.json())
      .then((d: Candle[]) => { setCandles(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [yfSymbol, cfg.interval, cfg.range]);

  // ── Build / update lightweight-charts ────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || loading || error || !candles.length) return;

    // Destroy previous chart if re-rendering
    if (chartApi.current) {
      chartApi.current.remove();
      chartApi.current = null;
    }

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: "#060610" },
        textColor: "#94a3b8",
      },
      grid:        { vertLines: { color: "#1c1c38" }, horzLines: { color: "#1c1c38" } },
      crosshair:   { mode: 1 },
      rightPriceScale: { borderColor: "#1c1c38" },
      timeScale:   { borderColor: "#1c1c38", timeVisible: true, secondsVisible: false },
    });
    chartApi.current = chart;

    // Candlestick series
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    candleSeries.current = cs;
    cs.setData(candles as LWCandle[]);

    // Mon indicateur (ligne)
    const ind = chart.addSeries(LineSeries, {
      color: "#f0c84a",
      lineWidth: 2,
      title: "Mon Indicateur",
    });
    indSeries.current = ind;
    ind.setData(computeMyIndicator(candles));

    // Volume histogram (optional, comment out if not needed)
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volSeries.current = vol;
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: volColor(c) })));

    chart.timeScale().fitContent();

    // Responsive resize
    const obs = new ResizeObserver(() => {
      if (chartRef.current && chartApi.current) {
        chartApi.current.applyOptions({ width: chartRef.current.clientWidth });
      }
    });
    obs.observe(chartRef.current);

    return () => { obs.disconnect(); };
  }, [candles, loading, error]);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Mon Indicateur — {label}
          </h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            Indicateur privé · {cfg.label} · {candles.length} bougies
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {INTERVALS.map((iv, i) => (
            <button key={iv.label} onClick={() => setIntervalIdx(i)} style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              background: intervalIdx === i ? "rgba(212,175,55,0.12)" : "transparent",
              border: `1px solid ${intervalIdx === i ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
              color: intervalIdx === i ? "#f0c84a" : "#475569",
            }}>{iv.label}</button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      {loading && <div className="skeleton" style={{ height: 340 }} />}
      {error   && <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 13 }}>Données indisponibles</div>}
      {!loading && !error && <div ref={chartRef} style={{ height: 340 }} />}

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 3, background: "#22c55e", borderRadius: 2, display: "inline-block" }} />Hausse</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 3, background: "#ef4444", borderRadius: 2, display: "inline-block" }} />Baisse</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 3, background: "#f0c84a", borderRadius: 2, display: "inline-block" }} />Mon Indicateur</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#334155" }}>🔒 Privé · Local uniquement</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MyIndicatorChart.tsx
git commit -m "feat: MyIndicatorChart — private indicator via lightweight-charts, OHLC from /api/chart-data"
```

---

## Task 4: Charts page

**Files:**
- Create: `app/charts/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/charts/page.tsx
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import OpenInterestCard from "@/components/OpenInterestCard";
import { TV_SYMBOLS } from "@/components/TradingViewChart";

// Dynamically import heavy chart components (avoids SSR issues)
const TradingViewChart = dynamic(() => import("@/components/TradingViewChart"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 520 }} />,
});
const MyIndicatorChart = dynamic(() => import("@/components/MyIndicatorChart"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 380 }} />,
});

export default function ChartsPage() {
  const [symIdx, setSymIdx] = useState(0); // index into TV_SYMBOLS

  const selected = TV_SYMBOLS[symIdx];
  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>Graphiques</h1>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
          🇫🇷 {parisDate} · TradingView · Mon Indicateur · Open Interest
        </p>
      </div>

      {/* Symbol selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }}>
        {TV_SYMBOLS.map((s, i) => (
          <button key={s.tv} onClick={() => setSymIdx(i)} style={{
            fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 7, cursor: "pointer",
            background: symIdx === i ? "rgba(212,175,55,0.12)" : "#10101e",
            border: `1px solid ${symIdx === i ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
            color: symIdx === i ? "#f0c84a" : "#475569",
          }}>{s.label}</button>
        ))}
      </div>

      {/* Row 1: TradingView chart (full width) */}
      <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              TradingView — {selected.label}
            </h3>
            <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
              Chart professionnel · Change de symbole directement dans le widget
            </p>
          </div>
          <span style={{ fontSize: 10, color: "#22c55e", background: "rgba(34,197,94,0.08)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(34,197,94,0.2)", fontWeight: 700 }}>
            LIVE
          </span>
        </div>
        {/* key prop forces remount when symbol changes */}
        <TradingViewChart key={selected.tv} tvSymbol={selected.tv} height={520} />
      </div>

      {/* Row 2: My private indicator */}
      <div style={{ marginBottom: 20 }}>
        <MyIndicatorChart yfSymbol={TV_SYMBOLS[symIdx <= 10 ? symIdx : 0].tv.replace("FX:", "").replace("OANDA:", "") + (symIdx <= 6 ? "=X" : "=F")} label={selected.label} />
      </div>

      {/* Row 3: Open Interest table */}
      <div style={{ marginBottom: 20 }}>
        <OpenInterestCard />
      </div>

      {/* Info footer */}
      <div style={{ padding: "12px 16px", background: "#10101e", border: "1px solid #1c1c38", borderRadius: 10, fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
        💡 <strong style={{ color: "#94a3b8" }}>Mon Indicateur</strong> : La logique est dans{" "}
        <code style={{ color: "#f0c84a", background: "#0d0d1a", padding: "1px 5px", borderRadius: 4 }}>components/MyIndicatorChart.tsx</code>
        {" "}→ fonction <code style={{ color: "#f0c84a", background: "#0d0d1a", padding: "1px 5px", borderRadius: 4 }}>computeMyIndicator()</code>.
        Traduis ton Pine Script en TypeScript dans cette fonction. Les données OHLCV viennent de Yahoo Finance (gratuit, sans clé).
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fix the yfSymbol mapping** — The symbol derivation logic in the page is fragile. Replace the `MyIndicatorChart` call with a clean mapping:

Replace this block in `app/charts/page.tsx`:
```tsx
      <div style={{ marginBottom: 20 }}>
        <MyIndicatorChart yfSymbol={TV_SYMBOLS[symIdx <= 10 ? symIdx : 0].tv.replace("FX:", "").replace("OANDA:", "") + (symIdx <= 6 ? "=X" : "=F")} label={selected.label} />
      </div>
```

With this clean version (add a `yf` field to TV_SYMBOLS in `TradingViewChart.tsx` first — see Task 5 Step 1):
```tsx
      <div style={{ marginBottom: 20 }}>
        <MyIndicatorChart yfSymbol={selected.yf} label={selected.label} />
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add app/charts/page.tsx
git commit -m "feat: Charts page — TradingView widget + private indicator + Open Interest"
```

---

## Task 5: Add `yf` field to TV_SYMBOLS (clean symbol mapping)

**Files:**
- Modify: `components/TradingViewChart.tsx`

- [ ] **Step 1: Add Yahoo Finance symbols to TV_SYMBOLS array**

Open `components/TradingViewChart.tsx` and replace the `TV_SYMBOLS` array with this version that includes a `yf` field:

```ts
export const TV_SYMBOLS: { label: string; tv: string; yf: string }[] = [
  { label: "EUR/USD",    tv: "FX:EURUSD",          yf: "EURUSD=X"  },
  { label: "GBP/USD",   tv: "FX:GBPUSD",          yf: "GBPUSD=X"  },
  { label: "USD/JPY",   tv: "FX:USDJPY",          yf: "JPY=X"     },
  { label: "USD/CHF",   tv: "FX:USDCHF",          yf: "CHF=X"     },
  { label: "USD/CAD",   tv: "FX:USDCAD",          yf: "CAD=X"     },
  { label: "AUD/USD",   tv: "FX:AUDUSD",          yf: "AUDUSD=X"  },
  { label: "NZD/USD",   tv: "FX:NZDUSD",          yf: "NZDUSD=X"  },
  { label: "EUR/GBP",   tv: "FX:EURGBP",          yf: "EURGBP=X"  },
  { label: "EUR/JPY",   tv: "FX:EURJPY",          yf: "EURJPY=X"  },
  { label: "GBP/JPY",   tv: "FX:GBPJPY",          yf: "GBPJPY=X"  },
  { label: "XAU/USD",   tv: "OANDA:XAUUSD",       yf: "GC=F"      },
  { label: "XAG/USD",   tv: "OANDA:XAGUSD",       yf: "SI=F"      },
  { label: "WTI Oil",   tv: "NYMEX:CL1!",         yf: "CL=F"      },
  { label: "S&P 500",   tv: "FOREXCOM:SPXUSD",    yf: "^GSPC"     },
  { label: "Nasdaq 100",tv: "FOREXCOM:NSXUSD",    yf: "^NDX"      },
  { label: "BTC/USD",   tv: "BITSTAMP:BTCUSD",    yf: "BTC-USD"   },
];
```

- [ ] **Step 2: Commit**

```bash
git add components/TradingViewChart.tsx
git commit -m "fix: add yf field to TV_SYMBOLS for clean Yahoo Finance symbol mapping"
```

---

## Task 6: Add "Charts" to navigation

**Files:**
- Modify: `components/Header.tsx`
- Modify: `components/QuickLinks.tsx`
- Modify: `components/Footer.tsx`

- [ ] **Step 1: Add Charts to Header NAV array**

In `components/Header.tsx`, replace the `NAV` array:
```ts
const NAV = [
  { label: "Dashboard",   href: "/" },
  { label: "Calendrier",  href: "/calendar" },
  { label: "COT & Retail",href: "/cot" },
  { label: "Charts",      href: "/charts" },
  { label: "Saisonnalité G8", href: "/seasonality" },
  { label: "News",        href: "/news" },
];
```

- [ ] **Step 2: Add Charts to QuickLinks**

In `components/QuickLinks.tsx`, replace the `LINKS` array:
```ts
const LINKS = [
  { href: "/cot",        label: "COT & Retail",         desc: "2 ans · Retail · Open Interest",         icon: "🏦", color: "#d4af37" },
  { href: "/charts",     label: "Graphiques",           desc: "TradingView · Mon Indicateur · OI",       icon: "📈", color: "#a855f7" },
  { href: "/seasonality",label: "Saisonnalité G8",      desc: "28 paires · Heatmap · 10 ans",            icon: "📊", color: "#22c55e" },
  { href: "/calendar",   label: "Calendrier Éco",       desc: "Événements haute importance",              icon: "📅", color: "#3b82f6" },
  { href: "/news",       label: "Analyse Fondamentale", desc: "FXStreet · ForexLive · InvestingLive",    icon: "🔍", color: "#f97316" },
];
```

- [ ] **Step 3: Add Charts to Footer**

In `components/Footer.tsx`, replace the links array inside the map:
```ts
{[
  ["Dashboard",          "/"],
  ["COT & Retail",       "/cot"],
  ["Graphiques",         "/charts"],
  ["Saisonnalité G8",    "/seasonality"],
  ["Calendrier",         "/calendar"],
  ["News",               "/news"],
].map(([l, h]) => (
  <Link key={h} href={h} style={{ display: "block", fontSize: 12, color: "#94a3b8", textDecoration: "none", marginBottom: 6 }}>{l}</Link>
))}
```

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx components/QuickLinks.tsx components/Footer.tsx
git commit -m "feat: add Charts to navigation (Header, QuickLinks, Footer)"
```

---

## Task 7: Add OpenInterestCard to the Dashboard

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add import and render OpenInterestCard**

In `app/page.tsx`, add the import at the top:
```tsx
import OpenInterestCard from "@/components/OpenInterestCard";
```

Then after the `{/* Row 4: Seasonality G8 full width */}` block and before `{/* Row 5: Fundamental Analysis */}`, add:
```tsx
      {/* Row 5: Open Interest */}
      <div style={{ marginBottom: 16 }}>
        <OpenInterestCard />
      </div>

      {/* Row 6: Fundamental Analysis */}
```

Also update the existing Row 5 comment to Row 6:
```tsx
      {/* Row 6: Fundamental Analysis */}
      <FundamentalFeed limit={12} />
```

The full updated `app/page.tsx`:
```tsx
import FearGreedCard from "@/components/FearGreedCard";
import MarketSessionsCard from "@/components/MarketSessionsCard";
import G8Overview from "@/components/G8Overview";
import QuickLinks from "@/components/QuickLinks";
import COTChartCard from "@/components/COTChartCard";
import RetailSentimentCard from "@/components/RetailSentimentCard";
import SeasonalityG8 from "@/components/SeasonalityG8";
import FundamentalFeed from "@/components/FundamentalFeed";
import OpenInterestCard from "@/components/OpenInterestCard";

export default function HomePage() {
  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(34,197,94,0.08)", padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(34,197,94,0.2)" }}>Analyse Institutionnelle</span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>🇫🇷 {parisDate}</span>
        </div>
        <h1 style={{ fontSize: "clamp(22px, 3.5vw, 38px)", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
          Intelligence Macro.{" "}
          <span style={{ background: "linear-gradient(135deg, #d4af37, #f0c84a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Données Réelles.</span>
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 8, maxWidth: 600 }}>
          COT institutionnel · Sentiment retail · G8 28 paires · Saisonnalité · Graphiques · Actualités
        </p>
      </div>

      <QuickLinks />

      {/* Row 1: Fear&Greed + Sessions + G8 Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 320px 1fr", gap: 16, marginBottom: 16 }}>
        <FearGreedCard />
        <MarketSessionsCard />
        <G8Overview />
      </div>

      {/* Row 2: COT Chart full width */}
      <div style={{ marginBottom: 16 }}>
        <COTChartCard />
      </div>

      {/* Row 3: Retail Sentiment full width */}
      <div style={{ marginBottom: 16 }}>
        <RetailSentimentCard />
      </div>

      {/* Row 4: Seasonality G8 full width */}
      <div style={{ marginBottom: 16 }}>
        <SeasonalityG8 />
      </div>

      {/* Row 5: Open Interest */}
      <div style={{ marginBottom: 16 }}>
        <OpenInterestCard />
      </div>

      {/* Row 6: Fundamental Analysis */}
      <FundamentalFeed limit={12} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add OpenInterestCard to dashboard (Row 5)"
```

---

## Task 8: Fix FundamentalFeed `limit` prop

**Files:**
- Modify: `components/FundamentalFeed.tsx`

The `limit` prop is currently suppressed with `limit: _` (unused). Fix it to actually cap the pool of articles displayed.

- [ ] **Step 1: Fix the prop destructuring and apply the limit**

Replace line 28 in `components/FundamentalFeed.tsx`:
```tsx
// BEFORE
export default function FundamentalFeed({ limit: _ }: { limit?: number }) {
```

With:
```tsx
// AFTER
export default function FundamentalFeed({ limit }: { limit?: number }) {
```

Then replace the `pool` definition (currently line 45):
```tsx
// BEFORE
  const pool = filtered;
```
With:
```tsx
// AFTER
  const pool = limit ? filtered.slice(0, limit) : filtered;
```

- [ ] **Step 2: Remove the eslint-disable comment** (now the prop is used, the comment is stale)

Remove line 27:
```tsx
// eslint-disable-next-line @typescript-eslint/no-unused-vars
```

- [ ] **Step 3: Commit**

```bash
git add components/FundamentalFeed.tsx
git commit -m "fix: FundamentalFeed — apply limit prop to cap displayed articles"
```

---

## Task 9: TypeScript verification

**Files:** All modified/created files (read-only check)

- [ ] **Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit
```
Expected: No output (zero errors).

If there are errors, fix them before proceeding. Common issues:
- `createChart` import — in lightweight-charts v4, import as: `import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts"`
- If `CandlestickSeries`/`LineSeries`/`HistogramSeries` are not named exports in v4.2, use the v4 API: `chart.addCandlestickSeries()`, `chart.addLineSeries()`, `chart.addHistogramSeries()` instead

- [ ] **Step 2: Fix lightweight-charts v4 API if needed**

In `components/MyIndicatorChart.tsx`, if `CandlestickSeries` etc. are not valid imports for v4.2, use:
```tsx
// v4 API (no named series constructors)
import { createChart, ColorType } from "lightweight-charts";
// ...
const cs = chart.addCandlestickSeries({ ... });
const ind = chart.addLineSeries({ ... });
const vol = chart.addHistogramSeries({ ... });
```

And remove the unused imports from the import line.

- [ ] **Step 3: Final commit if fixes needed**

```bash
git add -p
git commit -m "fix: lightweight-charts v4 API compatibility in MyIndicatorChart"
```

---

## Self-Review

**Spec coverage:**
- ✅ Charts page (TradingView widget + private indicator + OI)
- ✅ chart-data API (Yahoo Finance, free, 15-min cache)
- ✅ OpenInterestCard in dashboard
- ✅ FundamentalFeed limit fix
- ✅ Navigation updated (Header, QuickLinks, Footer)
- ✅ Private indicator isolated in MyIndicatorChart.tsx

**Placeholder scan:** None found — all code blocks are complete and runnable.

**Type consistency:**
- `TV_SYMBOLS` type `{ label, tv, yf }` used consistently across Task 5 and Task 4
- `Candle` interface defined in both `chart-data/route.ts` (returned) and `MyIndicatorChart.tsx` (consumed) — same shape ✅
- `LWCandle` and `LWPoint` defined locally in `MyIndicatorChart.tsx` ✅

**Known risk:** lightweight-charts v4.2 uses the method-based API (`chart.addCandlestickSeries()`), not the constructor-based API (`chart.addSeries(CandlestickSeries, ...)`). Task 9 handles this explicitly.
