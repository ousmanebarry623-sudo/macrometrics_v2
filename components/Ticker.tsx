"use client";
import { useEffect, useState } from "react";

interface Item { label: string; price: number; changePct: number; }

export default function Ticker() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const load = () => fetch("/api/market-data").then(r => r.json()).then(setItems).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div style={{ background: "#0d0d1a", borderBottom: "1px solid #1c1c38", height: 34, overflow: "hidden", display: "flex", alignItems: "center" }}>
      <div className="ticker-inner">
        {doubled.map((item, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 20px", fontSize: 11.5, borderRight: "1px solid #1c1c38", height: 34, whiteSpace: "nowrap" }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: "#f1f5f9", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
              {item.price > 0 ? item.price.toFixed(item.price > 100 ? 2 : 5) : "—"}
            </span>
            {item.changePct !== 0 && (
              <span style={{ color: item.changePct >= 0 ? "#22c55e" : "#ef4444", fontSize: 10.5 }}>
                {item.changePct >= 0 ? "▲" : "▼"}{Math.abs(item.changePct).toFixed(2)}%
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
