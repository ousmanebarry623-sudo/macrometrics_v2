// components/SignalChart.tsx — ELTE SMART chart complet
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  createChart, ColorType, LineStyle,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import { computeElte, DEFAULT_PARAMS, type ElteParams, type Candle, type Signal } from "@/lib/elte-compute";

const IndicatorSettings = dynamic(() => import("@/components/IndicatorSettings"), { ssr: false });

interface LWPoint  { time: Time; value: number; }
interface LWCandle { time: Time; open: number; high: number; low: number; close: number; }

export const SIGNAL_TFS = [
  { label:"1M",  tvInterval:"1",   yfInterval:"1m",  yfRange:"5d"   },
  { label:"5M",  tvInterval:"5",   yfInterval:"5m",  yfRange:"60d"  },
  { label:"15M", tvInterval:"15",  yfInterval:"15m", yfRange:"60d"  },
  { label:"30M", tvInterval:"30",  yfInterval:"30m", yfRange:"60d"  },
  { label:"1H",  tvInterval:"60",  yfInterval:"60m", yfRange:"200d" },
  { label:"4H",  tvInterval:"240", yfInterval:"60m", yfRange:"200d" },
  { label:"D",   tvInterval:"D",   yfInterval:"1d",  yfRange:"2y"   },
  { label:"W",   tvInterval:"W",   yfInterval:"1wk", yfRange:"5y"   },
  { label:"M",   tvInterval:"M",   yfInterval:"1mo", yfRange:"10y"  },
];

function fmtPrice(v: number, sym: string) {
  return sym.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
}

interface Props {
  yfSymbol: string;
  label:    string;
  tfIdx:    number;
  onResult: (sig: Signal | null, barsSince: number, params: ElteParams) => void;
}

export default function SignalChart({ yfSymbol, label, tfIdx, onResult }: Props) {
  const tf = SIGNAL_TFS[tfIdx];

  const chartRef  = useRef<HTMLDivElement>(null);
  const hvRef     = useRef<HTMLDivElement>(null);
  const chartApi  = useRef<IChartApi | null>(null);
  const hvApi     = useRef<IChartApi | null>(null);
  const csRef     = useRef<ISeriesApi<"Candlestick", Time> | null>(null);

  const [candles,     setCandles]     = useState<Candle[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [params,      setParams]      = useState<ElteParams>(DEFAULT_PARAMS);
  const [showSettings,setShowSettings]= useState(false);
  const [countdown,   setCountdown]   = useState(300);
  const [refreshing,  setRefreshing]  = useState(false);

  // Fetch + auto-refresh toutes les 5 minutes (sans skeleton sur les refreshes silencieux)
  const REFRESH_SEC = 300; // 5 minutes
  useEffect(() => {
    let mounted = true;
    let tick    = REFRESH_SEC;

    const doFetch = (initial: boolean) => {
      if (initial) { setLoading(true); setError(false); setCandles([]); }
      else         { setRefreshing(true); }

      fetch(`/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=${tf.yfInterval}&range=${tf.yfRange}`)
        .then(r => r.json())
        .then((d: Candle[]) => {
          if (!mounted) return;
          setCandles(d);
          if (initial) setLoading(false);
          setRefreshing(false);
          tick = REFRESH_SEC; setCountdown(REFRESH_SEC);
        })
        .catch(() => {
          if (!mounted) return;
          if (initial) { setError(true); setLoading(false); }
          setRefreshing(false);
        });
    };

    doFetch(true);
    const refreshId   = setInterval(() => doFetch(false), REFRESH_SEC * 1000);
    const countdownId = setInterval(() => {
      tick = tick <= 1 ? REFRESH_SEC : tick - 1;
      if (mounted) setCountdown(tick);
    }, 1_000);

    return () => {
      mounted = false;
      clearInterval(refreshId);
      clearInterval(countdownId);
    };
  }, [yfSymbol, tf.yfInterval, tf.yfRange]);

  // Build chart
  const buildChart = useCallback(() => {
    if (!chartRef.current || loading || error || !candles.length) return;
    if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; }
    if (hvApi.current)    { hvApi.current.remove();    hvApi.current    = null; }

    const result = computeElte(candles, params);
    const lastSig  = result.signals.length > 0 ? result.signals[result.signals.length - 1] : null;
    const sigIdx   = lastSig ? candles.findIndex(c => c.time === lastSig.time) : -1;
    const barsSince = sigIdx >= 0 ? candles.length - 1 - sigIdx : 0;
    onResult(lastSig, barsSince, params);

    // ── Graphique principal ──────────────────────────────────────────────────
    const chart = createChart(chartRef.current, {
      width:  chartRef.current.clientWidth,
      height: 600,
      layout: { background: { type: ColorType.Solid, color: "#060610" }, textColor: "#94a3b8" },
      grid:   { vertLines: { color: "#0d0d1d" }, horzLines: { color: "#0d0d1d" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1c1c38", scaleMargins: { top: 0.05, bottom: 0.15 } },
      timeScale: { borderColor: "#1c1c38", timeVisible: true, secondsVisible: false },
    });
    chartApi.current = chart;

    // ── Trend Cloud (zone colorée) ───────────────────────────────────────────
    if (params.showTrendCloud && result.trendCloud.length > 0) {
      const tcBull = chart.addLineSeries({ color: "rgba(34,197,94,0.25)",  lineWidth: 1, title: "TC↑", lastValueVisible: false, priceLineVisible: false });
      const tcBear = chart.addLineSeries({ color: "rgba(239,68,68,0.25)",  lineWidth: 1, title: "TC↓", lastValueVisible: false, priceLineVisible: false });
      const bullPts: LWPoint[] = [], bearPts: LWPoint[] = [];
      for (const p of result.trendCloud) {
        if (p.bull) bullPts.push({ time: p.time as Time, value: p.value });
        else        bearPts.push({ time: p.time as Time, value: p.value });
      }
      tcBull.setData(bullPts); tcBear.setData(bearPts);
    }

    // ── EMA 250, EMA 150 (derrière les bougies) ──────────────────────────────
    if (params.showEma250)
      chart.addLineSeries({ color: "#f97316", lineWidth: 1, title: "EMA 250", lastValueVisible: false, priceLineVisible: false })
           .setData(result.ema250.map(p => ({ time: p.time as Time, value: p.value })));
    if (params.showEma150)
      chart.addLineSeries({ color: "#a855f7", lineWidth: 1, title: "EMA 150", lastValueVisible: false, priceLineVisible: false })
           .setData(result.ema150.map(p => ({ time: p.time as Time, value: p.value })));

    // ── Bougies ──────────────────────────────────────────────────────────────
    const cs = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    csRef.current = cs;
    cs.setData(candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close } as LWCandle)));

    // ── EMA 200 ──────────────────────────────────────────────────────────────
    if (params.showEma200)
      chart.addLineSeries({ color: "#3b82f6", lineWidth: 1, title: "EMA 200", lastValueVisible: false, priceLineVisible: false })
           .setData(result.ema200.map(p => ({ time: p.time as Time, value: p.value })));

    // ── HMA 55 ───────────────────────────────────────────────────────────────
    if (params.showHma55 && result.hma55.length > 0)
      chart.addLineSeries({ color: "#86efac", lineWidth: 1, title: "HMA 55", lastValueVisible: false, priceLineVisible: false })
           .setData(result.hma55.map(p => ({ time: p.time as Time, value: p.value })));

    // ── Trend Scalper EMAs (HA open) ─────────────────────────────────────────
    if (params.strategy === "Trend scalper") {
      chart.addLineSeries({ color: "#22c55e", lineWidth: 1, title: "HA EMA 5",  lastValueVisible: false, priceLineVisible: false }).setData(result.tsEma5.map( p => ({ time: p.time as Time, value: p.value })));
      chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, title: "HA EMA 9",  lastValueVisible: false, priceLineVisible: false }).setData(result.tsEma9.map( p => ({ time: p.time as Time, value: p.value })));
      chart.addLineSeries({ color: "#ef4444", lineWidth: 1, title: "HA EMA 21", lastValueVisible: false, priceLineVisible: false }).setData(result.tsEma21.map(p => ({ time: p.time as Time, value: p.value })));
    }

    // ── Supertrend ────────────────────────────────────────────────────────────
    chart.addLineSeries({ color: "#22c55e", lineWidth: 2, title: "ST↑", lastValueVisible: false, priceLineVisible: false })
         .setData(result.stBull.map(p => ({ time: p.time as Time, value: p.value })));
    chart.addLineSeries({ color: "#ef4444", lineWidth: 2, title: "ST↓", lastValueVisible: false, priceLineVisible: false })
         .setData(result.stBear.map(p => ({ time: p.time as Time, value: p.value })));

    // ── Trailing Stop ─────────────────────────────────────────────────────────
    if (params.trailingSL && result.trailStop.length > 0)
      chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "Trailing SL", lastValueVisible: false, priceLineVisible: false })
           .setData(result.trailStop.map(p => ({ time: p.time as Time, value: p.value })));

    // ── Marqueurs : TOUS les signaux avec score B{sens}/S{sens} ─────────────
    if (params.showSignals && params.strategy !== "Trend scalper" && result.signals.length > 0) {
      cs.setMarkers(result.signals.map((sig, idx) => {
        const isLast = idx === result.signals.length - 1;
        const sensLabel = Number.isInteger(sig.sens)
          ? String(sig.sens)
          : sig.sens.toFixed(1).replace(/\.0$/, "");
        return {
          time:     sig.time as Time,
          position: sig.type === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color:    sig.type === "buy" ? "#22c55e" : "#ef4444",
          shape:    sig.type === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text:     `${sig.type === "buy" ? "B" : "S"}${sensLabel}`,
          size:     isLast ? 2 : 1,
        };
      }));
    }

    // ── Niveaux TP / Entry / Stop sur le dernier signal ──────────────────────
    if (lastSig && params.showSignals) {
      const risk = Math.abs(lastSig.close - lastSig.st);
      const dir  = lastSig.type === "buy" ? 1 : -1;
      const entry = lastSig.close;
      const sl    = entry - dir * risk;
      const tp1   = entry + dir * params.multTP1 * risk;
      const tp2   = entry + dir * params.multTP2 * risk;
      const tp3   = entry + dir * params.multTP3 * risk;

      const levels: { price: number; color: string; title: string; style: LineStyle; width: 1|2 }[] = [
        { price: tp3,   color: "#22c55e", title: `TP 3 : ${fmtPrice(tp3,  yfSymbol)}`, style: LineStyle.Dashed, width: 1 },
        { price: tp2,   color: "#4ade80", title: `TP 2 : ${fmtPrice(tp2,  yfSymbol)}`, style: LineStyle.Dashed, width: 1 },
        { price: tp1,   color: "#86efac", title: `TP 1 : ${fmtPrice(tp1,  yfSymbol)}`, style: LineStyle.Dashed, width: 1 },
        { price: entry, color: "#f59e0b", title: `Entry : ${fmtPrice(entry,yfSymbol)}`, style: LineStyle.Solid,  width: 1 },
        { price: sl,    color: "#ef4444", title: `Stop : ${fmtPrice(sl,   yfSymbol)}`, style: LineStyle.Dashed, width: 1 },
      ];
      for (const { price, color, title, style, width } of levels) {
        cs.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title });
      }

      // Zone TP (fond vert semi-transparent)
      const zoneData = candles.slice(-150).map(c => ({ time: c.time as Time, value: dir === 1 ? tp3 : tp1 }));
      if (zoneData.length > 0) {
        chart.addAreaSeries({
          topColor: "rgba(34,197,94,0.07)", bottomColor: "rgba(34,197,94,0.01)",
          lineColor: "transparent", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }).setData(zoneData);
        const slZoneData = candles.slice(-150).map(c => ({ time: c.time as Time, value: dir === 1 ? entry : tp3 }));
        chart.addAreaSeries({
          topColor: "rgba(239,68,68,0.07)", bottomColor: "rgba(239,68,68,0.01)",
          lineColor: "transparent", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }).setData(slZoneData);
      }
    }

    // ── Volume ────────────────────────────────────────────────────────────────
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    vol.setData(candles.map(c => ({
      time: c.time as Time, value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
    })));

    chart.timeScale().fitContent();

    // ── Sous-graphique Hv ─────────────────────────────────────────────────────
    if (params.showVolPanel && hvRef.current && result.hvSeries.length > 0) {
      const hvc = createChart(hvRef.current, {
        width: hvRef.current.clientWidth, height: 100,
        layout: { background: { type: ColorType.Solid, color: "#060610" }, textColor: "#64748b" },
        grid:   { vertLines: { color: "#0d0d1d" }, horzLines: { color: "#0d0d1d" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1c1c38" },
        timeScale: { borderColor: "#1c1c38", timeVisible: true },
      });
      hvApi.current = hvc;
      hvc.addLineSeries({ color: "#7c3aed", lineWidth: 1, title: "Hv" })
         .setData(result.hvSeries.map(p => ({ time: p.time as Time, value: p.value })));
      if (result.avgHvSeries.length > 0)
        hvc.addLineSeries({ color: "#ffffff50", lineWidth: 1, title: "avgHv" })
           .setData(result.avgHvSeries.map(p => ({ time: p.time as Time, value: p.value })));
      hvc.timeScale().fitContent();
    }

    const obs = new ResizeObserver(() => {
      if (chartRef.current && chartApi.current) chartApi.current.applyOptions({ width: chartRef.current.clientWidth });
      if (hvRef.current   && hvApi.current)    hvApi.current.applyOptions({ width: hvRef.current.clientWidth });
    });
    obs.observe(chartRef.current);
    return () => {
      obs.disconnect();
      if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; }
      if (hvApi.current)    { hvApi.current.remove();    hvApi.current    = null; }
    };
  }, [candles, loading, error, params, yfSymbol, onResult]);

  useEffect(() => { const c = buildChart(); return c; }, [buildChart]);

  // Badge modèle + stratégie actifs
  const stratColor: Record<string, string> = { Normal: "#22c55e", Confirmed: "#f59e0b", "Trend scalper": "#818cf8" };

  return (
    <div style={{ flex: 1, minWidth: 0, background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* ── Barre du chart ───────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1c1c38", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{label} · <span style={{ color: "#818cf8" }}>{tf.label}</span></span>
          {/* Badges paramètres actifs */}
          <span style={{ fontSize: 10, color: "#64748b", background: "#0d1117", border: "1px solid #1c1c38", borderRadius: 4, padding: "1px 6px" }}>
            {params.volModel} p{params.period} · ATR {params.atrLen}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, background: "transparent", border: `1px solid ${stratColor[params.strategy]}30`, borderRadius: 4, padding: "1px 6px", color: stratColor[params.strategy] }}>
            {params.strategy}
          </span>
          {!params.autoSens && (
            <span style={{ fontSize: 10, color: "#f0c84a", background: "#0d1117", border: "1px solid rgba(240,200,74,.2)", borderRadius: 4, padding: "1px 6px" }}>
              Sens {params.manualSens.toFixed(1)}
            </span>
          )}
          {[params.consFilter && "ADX", params.smartFilter && "EMA200", params.highVolFilter && "Vol", params.trendCloudFilter && "TC"]
            .filter(Boolean).map(f => (
              <span key={f as string} style={{ fontSize: 9, color: "#475569", background: "#0d1117", border: "1px solid #1c1c38", borderRadius: 4, padding: "1px 5px" }}>{f as string}</span>
            ))}
        </div>
        {/* Countdown refresh */}
        <span style={{ fontSize: 10, color: refreshing ? "#818cf8" : "#1e293b", fontFamily: "monospace", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 4 }}>
          {refreshing
            ? <><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>↻</span> Actualisation…</>
            : <>🔄 {countdown >= 60 ? `${Math.floor(countdown / 60)}m${countdown % 60 > 0 ? `${countdown % 60}s` : ""}` : `${countdown}s`}</>}
        </span>
        <button onClick={() => setShowSettings(true)} title="Paramètres" style={{
          background: "transparent", border: "1px solid #1c1c38", color: "#475569",
          borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 14,
        }}>⚙ Paramètres</button>
      </div>

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      {loading && <div className="skeleton" style={{ flex: 1, height: 600 }} />}
      {error   && <div style={{ height: 600, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 13 }}>Données indisponibles</div>}
      {!loading && !error && <div ref={chartRef} style={{ height: 600 }} />}
      {!loading && !error && params.showVolPanel && (
        <div style={{ borderTop: "1px solid #1c1c38" }}>
          <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 600, padding: "4px 14px 2px" }}>
            Volatilité Hv ({params.volModel}) · Period {params.period}
          </div>
          <div ref={hvRef} style={{ height: 100 }} />
        </div>
      )}

      {/* ── Légende ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #1c1c38", display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10, color: "#475569", alignItems: "center" }}>
        {[
          ...(params.showEma250  ? [{ c:"#f97316", l:"EMA 250" }] : []),
          ...(params.showEma150  ? [{ c:"#a855f7", l:"EMA 150" }] : []),
          ...(params.showEma200  ? [{ c:"#3b82f6", l:"EMA 200" }] : []),
          ...(params.showHma55   ? [{ c:"#86efac", l:"HMA 55"  }] : []),
          { c:"#22c55e", l:"ST↑" }, { c:"#ef4444", l:"ST↓" },
          ...(params.trailingSL  ? [{ c:"#f59e0b", l:"Trailing SL" }] : []),
          ...(params.showTrendCloud ? [{ c:"rgba(34,197,94,.4)", l:"Trend Cloud" }] : []),
        ].map(({ c, l }) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 3, background: c, borderRadius: 2, display: "inline-block" }} />{l}
          </span>
        ))}
        <span style={{ color: "#22c55e" }}>▲ B{"{sens}"}</span>
        <span style={{ color: "#ef4444" }}>▼ S{"{sens}"}</span>
        <span style={{ marginLeft: "auto", color: "#1e293b" }}>🔒 ELTE SMART · Privé</span>
      </div>

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      {showSettings && (
        <IndicatorSettings
          params={params}
          onChange={p => { setParams(p); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
