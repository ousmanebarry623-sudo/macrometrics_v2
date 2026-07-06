"use client";

/**
 * EALivePanel — displays live MT4 EA (ELTE PULLBACK) signals on the MacroMetrics site.
 * Polls /api/mt4-webhook every 30s for fresh data.
 * Add <EALivePanel /> to /analysis page or layout.
 */

import { useEffect, useState } from "react";

interface MT4Signal {
  action:    string;
  symbol:    string;
  direction: "BUY" | "SELL";
  entry:     number;
  sl:        number;
  tp:        number;
  lots:      number;
  ticket:    number;
  account:   string;
  timestamp: string;
}

const POLL_MS = 30_000;

export default function EALivePanel() {
  const [signals,   setSignals]   = useState<MT4Signal[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  async function fetchSignals() {
    try {
      const res  = await fetch("/api/mt4-webhook");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSignals(data.signals ?? []);
      setUpdatedAt(data.updatedAt ?? "");
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSignals();
    const id = setInterval(fetchSignals, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const rr = (sig: MT4Signal) => {
    const risk   = Math.abs(sig.entry - sig.sl);
    const reward = Math.abs(sig.tp   - sig.entry);
    return risk > 0 ? (reward / risk).toFixed(1) : "—";
  };

  return (
    <section style={{
      background: "#0c101a",
      border: "1px solid #2a2f45",
      borderRadius: 8,
      padding: "16px 20px",
      marginTop: 24,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 13,
      color: "#cdd0e0",
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14, color:"#fff", letterSpacing:1 }}>
          ⚡ ELTE PULLBACK — Signaux Live
        </span>
        <span style={{ fontSize:11, color:"#556" }}>
          {loading
            ? "Chargement…"
            : error
            ? `⚠ ${error}`
            : `↻ ${updatedAt ? new Date(updatedAt).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }) : "—"}`}
        </span>
      </div>

      {/* No signals */}
      {!loading && signals.length === 0 && (
        <div style={{ color:"#475569", textAlign:"center", padding:"20px 0", fontSize:12 }}>
          Aucune position ouverte
        </div>
      )}

      {/* Signal rows */}
      {signals.map((sig) => {
        const isBuy    = sig.direction === "BUY";
        const dirColor = isBuy ? "#27a69a" : "#b22222";
        return (
          <div key={sig.ticket} style={{
            display:"grid",
            gridTemplateColumns:"90px 60px 110px 110px 110px 55px",
            gap:8,
            padding:"8px 0",
            borderBottom:"1px solid #1e2335",
            alignItems:"center",
          }}>
            <span style={{ color:"#fff", fontWeight:700 }}>{sig.symbol}</span>
            <span style={{
              color:dirColor, fontWeight:700,
              background:`${dirColor}22`,
              padding:"2px 6px", borderRadius:4, textAlign:"center",
            }}>
              {sig.direction}
            </span>
            <span><span style={{ color:"#888" }}>E </span>{sig.entry.toFixed(5)}</span>
            <span><span style={{ color:"#b22222" }}>SL </span>{sig.sl.toFixed(5)}</span>
            <span><span style={{ color:"#27a69a" }}>TP </span>{sig.tp.toFixed(5)}</span>
            <span style={{ color:"#888" }}>1:{rr(sig)}</span>
          </div>
        );
      })}

      {/* Footer */}
      {signals.length > 0 && (
        <div style={{ marginTop:8, fontSize:11, color:"#334155" }}>
          {signals.length} position{signals.length > 1 ? "s" : ""} · refresh auto 30s
        </div>
      )}
    </section>
  );
}
