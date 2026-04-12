// components/LivePriceTicker.tsx
// Affiche le prix en temps réel via l'API TradingView Scanner.
// Rafraîchissement toutes les 3 secondes — icône pulsante si realtime.
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { TvPriceResult } from "@/app/api/tv-price/route";

const REFRESH_MS = 3000; // 3 secondes

interface Props {
  tvSymbol:   string;   // ex: "FX:EURUSD"
  label:      string;   // ex: "EUR/USD"
  entryPrice?: number | null; // si signal actif, affiche la distance
  signalType?: "buy" | "sell" | null;
}

function fmtPrice(v: number, sym: string): string {
  return sym.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
}

function fmtChange(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

export default function LivePriceTicker({ tvSymbol, label, entryPrice, signalType }: Props) {
  const [data,    setData]    = useState<TvPriceResult | null>(null);
  const [error,   setError]   = useState(false);
  const [flash,   setFlash]   = useState<"up" | "down" | null>(null);
  const prevPrice = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tv-price?symbol=${encodeURIComponent(tvSymbol)}`,
        { cache: "no-store" },
      );
      if (!res.ok) { setError(true); return; }
      const json: TvPriceResult = await res.json();
      if (!mountedRef.current) return;

      // Flash vert/rouge si changement de prix
      if (prevPrice.current !== null && json.price !== prevPrice.current) {
        setFlash(json.price > prevPrice.current ? "up" : "down");
        setTimeout(() => setFlash(null), 600);
      }
      prevPrice.current = json.price;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }, [tvSymbol]);

  // Fetch initial + interval
  useEffect(() => {
    mountedRef.current = true;
    setData(null);
    setError(false);
    prevPrice.current = null;
    fetchPrice();
    const id = setInterval(fetchPrice, REFRESH_MS);
    return () => { clearInterval(id); mountedRef.current = false; };
  }, [fetchPrice]);

  // ── Distance de l'entry ─────────────────────────────────────────────────────
  const entryDist = (() => {
    if (!data || !entryPrice || !signalType) return null;
    const diff = data.price - entryPrice;
    const pct  = (diff / entryPrice) * 100;
    // BUY : bon si > entry (vert), mauvais si < entry (rouge)
    // SELL : bon si < entry (vert), mauvais si > entry (rouge)
    const positive = signalType === "buy" ? diff > 0 : diff < 0;
    return { diff, pct, positive };
  })();

  // ── Couleur du % change ──────────────────────────────────────────────────────
  const changeColor = !data ? "#475569" : data.change >= 0 ? "#22c55e" : "#ef4444";

  // ── Mode de données ─────────────────────────────────────────────────────────
  const isRealtime = data?.updateMode === "realtime";

  if (error && !data) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "#10101e", border: "1px solid #1c1c38",
        borderRadius: 8, padding: "6px 12px",
        fontSize: 11, color: "#475569",
      }}>
        📡 {label} — prix indisponible
      </div>
    );
  }

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      background: "#0d0d1a",
      border: `1px solid ${flash === "up" ? "rgba(34,197,94,0.4)" : flash === "down" ? "rgba(239,68,68,0.4)" : "#1c1c38"}`,
      borderRadius: 9, padding: "6px 14px",
      transition: "border-color 0.3s",
    }}>

      {/* Indicateur realtime */}
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: isRealtime ? "#22c55e" : "#f59e0b",
          boxShadow:  isRealtime ? "0 0 6px #22c55e" : "none",
          animation:  isRealtime ? "pulse 1.5s infinite" : "none",
          display: "inline-block",
        }} />
        <span style={{ fontSize: 9, color: isRealtime ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
          {isRealtime ? "LIVE" : "~15m"}
        </span>
      </span>

      {/* Symbole */}
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{label}</span>

      {/* Prix */}
      <span style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 15, fontWeight: 800,
        color: flash === "up" ? "#22c55e" : flash === "down" ? "#ef4444" : "#f1f5f9",
        transition: "color 0.3s",
        minWidth: 80, display: "inline-block",
      }}>
        {data ? fmtPrice(data.price, tvSymbol) : "——"}
      </span>

      {/* % change journalier */}
      {data && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: changeColor,
          background: data.change >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${data.change >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          borderRadius: 5, padding: "1px 6px",
        }}>
          {fmtChange(data.change)}
        </span>
      )}

      {/* Distance entry (si signal actif) */}
      {entryDist && data && (
        <>
          <span style={{ fontSize: 9, color: "#1e293b" }}>|</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: entryDist.positive ? "#22c55e" : "#ef4444",
          }}>
            {signalType === "buy" ? "📈" : "📉"}
            {entryDist.diff >= 0 ? "+" : ""}
            {fmtPrice(entryDist.diff, tvSymbol)}
            {" "}
            <span style={{ opacity: 0.7 }}>
              ({entryDist.pct >= 0 ? "+" : ""}{entryDist.pct.toFixed(3)}%)
            </span>
          </span>
          <span style={{ fontSize: 9, color: "#334155" }}>
            vs entry {fmtPrice(entryPrice!, tvSymbol)}
          </span>
        </>
      )}

      {/* H/L du jour */}
      {data && (
        <span style={{ fontSize: 9, color: "#334155", display: "flex", gap: 4 }}>
          <span>H <strong style={{ color: "#22c55e" }}>{fmtPrice(data.high, tvSymbol)}</strong></span>
          <span>L <strong style={{ color: "#ef4444" }}>{fmtPrice(data.low,  tvSymbol)}</strong></span>
        </span>
      )}
    </div>
  );
}
