// components/SignalMonitorPanel.tsx
// Surveillance continue d'un signal Telegram avec rappels toutes les 15 min.
// Côté serveur : les moniteurs sont persistés dans Vercel KV et traités par
// le cron toutes les 5 min → surveillance active même navigateur fermé.
// Côté client  : fallback localStorage + interval de vérification locale.
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { TelegramSignalData } from "./TelegramPanel";
import { TV_SYMBOLS } from "./TradingViewChart";
import { SIGNAL_TFS } from "./SignalChart";

const LS_TOKEN           = "elte_tg_token";
const LS_CHAT_ID         = "elte_tg_chatid";
const LS_MONITOR_PAIRS   = "elte_monitor_pairs";
const LS_MONITOR_TFS     = "elte_monitor_tfs";
const LS_ACTIVE_MONITORS = "elte_active_monitors";

const REMINDER_MS   = 15 * 60 * 1000; // 15 minutes
const CHECK_TICK_MS =  1 * 60 * 1000; // vérification client toutes les 1 min
const RETEST_TOL    = 0.0015;          // 0.15% tolérance retest

interface ActiveMonitor {
  id:            string;
  pair:          string;
  tv:            string;   // ex: "FX:EURUSD" — pour TradingView prix live
  yf:            string;
  tf:            string;
  yfInterval:    string;
  type:          "buy" | "sell";
  entryPrice:    number;
  score:         string;
  sigData:       TelegramSignalData;
  startedAt:     number;
  lastSentAt:    number;
  reminderCount: number;
  serverSynced?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Prix en temps réel via TradingView Scanner (tvSymbol = "FX:EURUSD")
async function fetchCurrentPriceTV(tvSymbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `/api/tv-price?symbol=${encodeURIComponent(tvSymbol)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json() as { price?: number };
    return json.price ?? null;
  } catch {
    return null;
  }
}

// Fallback Yahoo Finance si TradingView indisponible
async function fetchCurrentPriceYF(yfSymbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `/api/chart-data?symbol=${encodeURIComponent(yfSymbol)}&interval=1m&range=1d`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const candles: { close: number }[] = await res.json();
    if (!Array.isArray(candles) || candles.length === 0) return null;
    return candles[candles.length - 1]?.close ?? null;
  } catch {
    return null;
  }
}

// Essaie TradingView d'abord, puis Yahoo Finance en fallback
async function fetchCurrentPrice(tvSymbol: string, yfSymbol: string): Promise<number | null> {
  const tv = await fetchCurrentPriceTV(tvSymbol);
  if (tv !== null) return tv;
  return fetchCurrentPriceYF(yfSymbol);
}

function hasRetested(type: "buy" | "sell", entry: number, current: number): boolean {
  if (type === "buy")  return current <= entry * (1 + RETEST_TOL);
  return current >= entry * (1 - RETEST_TOL);
}

function fmtPrice(v: number, yf: string) {
  return yf.includes("JPY") || yf.includes("JPY=X") ? v.toFixed(3) : v.toFixed(5);
}

function formatElapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`;
}

async function sendTg(token: string, chatId: string, text: string): Promise<void> {
  try {
    await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token, chatId, rawText: text }),
    });
  } catch { /* silently ignore */ }
}

// ── Enregistrement serveur ─────────────────────────────────────────────────────

async function registerMonitorServer(
  m: ActiveMonitor,
  token: string,
  chatId: string,
): Promise<boolean> {
  try {
    const sigTime = m.sigData.sigTime ?? 0;
    const id      = `${m.yf}:${m.tf}:${sigTime}`;
    const body = {
      id,
      yf:         m.yf,
      label:      m.pair,
      tfLabel:    m.tf,
      type:       m.type,
      entryPrice: m.entryPrice,
      score:      m.score,
      fEntry:     m.sigData.entry,
      fTp1:       m.sigData.tp1,
      fTp2:       m.sigData.tp2,
      fTp3:       m.sigData.tp3,
      fSl:        m.sigData.sl,
      sigTime,
      token,
      chatId,
    };
    const res = await fetch("/api/monitor", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteMonitorServer(id: string): Promise<void> {
  try {
    await fetch(`/api/monitor?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch { /* ignore */ }
}

async function clearAllMonitorsServer(): Promise<void> {
  try {
    await fetch("/api/monitor", { method: "DELETE" });
  } catch { /* ignore */ }
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildReminder(m: ActiveMonitor, n: number): string {
  const dir     = m.type === "buy" ? "BUY" : "SELL";
  const elapsed = Math.round((Date.now() - m.startedAt) / 60000);
  return [
    `🔔 RAPPEL #${n} — SIGNAL ${dir} · ${m.score}`,
    `💱 ${m.pair} · ${m.tf}`,
    `──────────────────`,
    `📍 Entry  : ${m.sigData.entry}  (pas encore retesté)`,
    `🎯 TP 1   : ${m.sigData.tp1}`,
    `🎯 TP 2   : ${m.sigData.tp2}`,
    `🎯 TP 3   : ${m.sigData.tp3}`,
    `🛑 Stop   : ${m.sigData.sl}`,
    `──────────────────`,
    `⏱ Signal actif depuis ${elapsed} min`,
    ``,
    `🔒 ELTE SMART · macrometrics`,
  ].join("\n");
}

function buildRetest(m: ActiveMonitor, currentPriceStr: string): string {
  const dir     = m.type === "buy" ? "BUY" : "SELL";
  const elapsed = Math.round((Date.now() - m.startedAt) / 60000);
  return [
    `✅ RETEST ENTRÉE — ${dir} · ${m.score}`,
    `💱 ${m.pair} · ${m.tf}`,
    ``,
    `📍 Entry         : ${m.sigData.entry}`,
    `📊 Prix actuel   : ${currentPriceStr}  ← retest détecté`,
    ``,
    `⏱ Signal actif pendant ${elapsed} min · ${m.reminderCount} rappel${m.reminderCount > 1 ? "s" : ""} envoyé${m.reminderCount > 1 ? "s" : ""}`,
    `⏹ Surveillance terminée automatiquement.`,
    ``,
    `🔒 ELTE SMART · macrometrics`,
  ].join("\n");
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  currentSignal:  TelegramSignalData | null;
  currentTv:      string;   // ex: "FX:EURUSD"
  currentYf:      string;
  currentLabel:   string;
  currentTfLabel: string;
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function SignalMonitorPanel({
  currentSignal, currentTv, currentYf, currentLabel, currentTfLabel,
}: Props) {
  const [ready,          setReady]          = useState(false);
  const [enabled,        setEnabled]        = useState(false);
  const [monitoredPairs, setMonitoredPairs] = useState<string[]>([]);
  const [monitoredTFs,   setMonitoredTFs]   = useState<string[]>([]);
  const [activeMonitors, setActiveMonitors] = useState<ActiveMonitor[]>([]);
  const [showConfig,     setShowConfig]     = useState(false);
  const [serverOk,       setServerOk]       = useState<boolean | null>(null); // null = inconnu
  const [, tick]                            = useState(0);

  const tokenRef          = useRef("");
  const chatIdRef         = useRef("");
  const activeMonitorsRef = useRef<ActiveMonitor[]>([]);
  const lastSigTimeRef    = useRef<number>(0);

  // Sync ref ← state
  useEffect(() => { activeMonitorsRef.current = activeMonitors; }, [activeMonitors]);

  // ── Init depuis localStorage + sync serveur ──────────────────────────────
  useEffect(() => {
    try {
      tokenRef.current  = localStorage.getItem(LS_TOKEN)   ?? "";
      chatIdRef.current = localStorage.getItem(LS_CHAT_ID) ?? "";
      const pairs = localStorage.getItem(LS_MONITOR_PAIRS);
      const tfs   = localStorage.getItem(LS_MONITOR_TFS);
      const ams   = localStorage.getItem(LS_ACTIVE_MONITORS);
      if (pairs) setMonitoredPairs(JSON.parse(pairs));
      if (tfs)   setMonitoredTFs(JSON.parse(tfs));
      if (ams)   setActiveMonitors(JSON.parse(ams));
    } catch { /* SSR / parse error */ }

    // Vérifier si KV serveur est disponible
    fetch("/api/monitor")
      .then(r => setServerOk(r.ok && r.status !== 503))
      .catch(() => setServerOk(false));

    setReady(true);
  }, []);

  // ── Persist config ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_MONITOR_PAIRS, JSON.stringify(monitoredPairs)); } catch { /* ignore */ }
  }, [monitoredPairs, ready]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_MONITOR_TFS, JSON.stringify(monitoredTFs)); } catch { /* ignore */ }
  }, [monitoredTFs, ready]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LS_ACTIVE_MONITORS, JSON.stringify(activeMonitors)); } catch { /* ignore */ }
  }, [activeMonitors, ready]);

  // ── Toggle activation ────────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      if (!next) {
        // Désactivation : effacer tous les moniteurs côté serveur
        clearAllMonitorsServer();
      }
      return next;
    });
  }, []);

  // ── Retirer un moniteur (bouton ×) ───────────────────────────────────────
  const removeMonitor = useCallback((id: string) => {
    // Supprimer côté serveur (le serverId est yf:tf:sigTime, on retrouve depuis l'id client)
    const m = activeMonitorsRef.current.find(x => x.id === id);
    if (m) {
      const serverId = `${m.yf}:${m.tf}:${m.sigData.sigTime ?? 0}`;
      deleteMonitorServer(serverId);
    }
    setActiveMonitors(prev => prev.filter(x => x.id !== id));
  }, []);

  // ── Détection nouveau signal → ajout au moniteur ─────────────────────────
  useEffect(() => {
    if (!ready || !enabled || !currentSignal) return;
    if (currentSignal.sigTime === lastSigTimeRef.current) return;
    lastSigTimeRef.current = currentSignal.sigTime;

    if (!monitoredPairs.includes(currentLabel)) return;
    if (!monitoredTFs.includes(currentTfLabel)) return;

    const entryPrice = parseFloat(currentSignal.entry);
    if (isNaN(entryPrice)) return;

    const tfInfo = SIGNAL_TFS.find(t => t.label === currentTfLabel);
    const id     = `${currentLabel}_${currentTfLabel}_${currentSignal.sigTime}`;

    const newMonitor: ActiveMonitor = {
      id, pair: currentLabel, tv: currentTv, yf: currentYf, tf: currentTfLabel,
      yfInterval: tfInfo?.yfInterval ?? "15m",
      type: currentSignal.type, entryPrice,
      score: currentSignal.score, sigData: currentSignal,
      startedAt: Date.now(), lastSentAt: Date.now(), reminderCount: 0,
      serverSynced: false,
    };

    // Enregistrer côté serveur (persistance)
    registerMonitorServer(newMonitor, tokenRef.current, chatIdRef.current)
      .then(ok => {
        setActiveMonitors(prev =>
          prev.map(m => m.id === id ? { ...m, serverSynced: ok } : m)
        );
      });

    setActiveMonitors(prev => [
      ...prev.filter(m => !(m.pair === currentLabel && m.tf === currentTfLabel)),
      newMonitor,
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignal?.sigTime, enabled, ready]);

  // ── Vérification client toutes les minutes (fallback si serveur indispo) ──
  const checkMonitors = useCallback(async () => {
    const token  = tokenRef.current;
    const chatId = chatIdRef.current;
    if (!token || !chatId) return;

    const monitors = activeMonitorsRef.current;
    if (monitors.length === 0) return;

    const now       = Date.now();
    const toRemove: string[] = [];
    const updates:  Record<string, Partial<ActiveMonitor>> = {};

    for (const m of monitors) {
      if (now - m.lastSentAt < REMINDER_MS) continue;

      const current = await fetchCurrentPrice(m.tv ?? m.yf, m.yf);
      if (current === null) continue;

      if (hasRetested(m.type, m.entryPrice, current)) {
        // Si serveur sync, le serveur gère l'envoi — éviter doublons
        if (!m.serverSynced) {
          await sendTg(token, chatId, buildRetest(m, fmtPrice(current, m.yf)));
        }
        toRemove.push(m.id);
        // Supprimer côté serveur aussi
        const serverId = `${m.yf}:${m.tf}:${m.sigData.sigTime ?? 0}`;
        deleteMonitorServer(serverId);
      } else if (!m.serverSynced) {
        // Uniquement si le serveur ne gère pas ce moniteur
        const n = m.reminderCount + 1;
        await sendTg(token, chatId, buildReminder(m, n));
        updates[m.id] = { lastSentAt: now, reminderCount: n };
      }
    }

    if (toRemove.length > 0 || Object.keys(updates).length > 0) {
      setActiveMonitors(prev =>
        prev
          .filter(m => !toRemove.includes(m.id))
          .map(m => updates[m.id] ? { ...m, ...updates[m.id] } : m)
      );
    }
  }, []);

  // ── Interval client ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(checkMonitors, CHECK_TICK_MS);
    return () => clearInterval(id);
  }, [enabled, checkMonitors]);

  // ── Ticker affichage ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── UI helpers ───────────────────────────────────────────────────────────
  const isConfigured   = ready && tokenRef.current.length > 20 && chatIdRef.current.length > 1;
  const allPairLabels  = TV_SYMBOLS.map(s => s.label);
  const allTFLabels    = SIGNAL_TFS.map(t => t.label);
  const pairIsMonitored = monitoredPairs.includes(currentLabel);
  const tfIsMonitored   = monitoredTFs.includes(currentTfLabel);

  return (
    <div style={{
      background: "#10101e",
      border: `1px solid ${enabled ? "rgba(99,102,241,0.35)" : "#1c1c38"}`,
      borderRadius: 10, padding: "11px 14px",
    }}>
      {/* ── En-tête toggle ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

        {/* Toggle */}
        <button onClick={handleToggle} style={{
          display: "flex", alignItems: "center", gap: 7,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>
          <div style={{
            width: 32, height: 17, borderRadius: 999,
            background: enabled ? "rgba(99,102,241,0.28)" : "#1c1c38",
            border: `1px solid ${enabled ? "rgba(99,102,241,0.55)" : "#2a2a50"}`,
            position: "relative", flexShrink: 0,
          }}>
            <div style={{
              position: "absolute", top: 2, left: enabled ? 14 : 2,
              width: 11, height: 11, borderRadius: "50%",
              background: enabled ? "#818cf8" : "#475569",
              transition: "left 0.2s",
            }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: enabled ? "#818cf8" : "#475569" }}>
            📡 Surveillance Signal
          </span>
        </button>

        <span style={{ fontSize: 9, color: "#334155" }}>⏱ rappel / 15 min</span>

        {/* Badge serveur */}
        {enabled && serverOk !== null && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            color:      serverOk ? "#22c55e" : "#f59e0b",
            background: serverOk ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
            border:    `1px solid ${serverOk ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
            borderRadius: 5, padding: "1px 6px",
          }}>
            {serverOk ? "☁ Serveur" : "💻 Local"}
          </span>
        )}

        {/* Badges actifs */}
        {enabled && activeMonitors.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#f0c84a",
            background: "rgba(240,200,74,0.1)", border: "1px solid rgba(240,200,74,0.25)",
            borderRadius: 5, padding: "1px 7px",
          }}>
            {activeMonitors.length} actif{activeMonitors.length > 1 ? "s" : ""}
          </span>
        )}

        {/* Bouton config */}
        {enabled && (
          <button onClick={() => setShowConfig(c => !c)} style={{
            marginLeft: "auto", fontSize: 10, padding: "2px 9px", borderRadius: 5, cursor: "pointer",
            background: showConfig ? "rgba(99,102,241,0.15)" : "transparent",
            border: `1px solid ${showConfig ? "rgba(99,102,241,0.4)" : "#1c1c38"}`,
            color: showConfig ? "#818cf8" : "#475569",
          }}>⚙ Config</button>
        )}
      </div>

      {/* ── Corps (visible seulement si activé) ────────────────────────── */}
      {enabled && (
        <div style={{ marginTop: 10 }}>

          {/* Avertissement pas configuré */}
          {!isConfigured && (
            <div style={{
              fontSize: 11, color: "#f87171",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6, padding: "8px 10px", marginBottom: 10,
            }}>
              ⚠️ Configure d&apos;abord le bot Telegram (⚙ Telegram ci-dessus) pour activer la surveillance.
            </div>
          )}

          {/* ── Panel de config ──────────────────────────────────────── */}
          {showConfig && (
            <div style={{
              background: "#0d0d1a", border: "1px solid #1c1c38",
              borderRadius: 8, padding: "12px 14px", marginBottom: 10,
            }}>
              {/* Paires */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Paires surveillées
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                {monitoredPairs.map(p => (
                  <span key={p} style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                    background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.35)",
                    color: "#818cf8", display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {p}
                    <button onClick={() => setMonitoredPairs(prev => prev.filter(x => x !== p))}
                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>
                      ×
                    </button>
                  </span>
                ))}
                <select value="" onChange={e => {
                  const v = e.target.value;
                  if (v && !monitoredPairs.includes(v)) setMonitoredPairs(prev => [...prev, v]);
                }} style={{
                  fontSize: 10, background: "#10101e", border: "1px solid #2a2a50",
                  borderRadius: 5, color: "#64748b", padding: "3px 6px", cursor: "pointer",
                }}>
                  <option value="">+ Ajouter paire</option>
                  {allPairLabels.filter(p => !monitoredPairs.includes(p)).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {!pairIsMonitored && (
                  <button onClick={() => setMonitoredPairs(prev => [...prev, currentLabel])} style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 5, cursor: "pointer",
                    background: "rgba(240,200,74,0.08)", border: "1px solid rgba(240,200,74,0.25)",
                    color: "#f0c84a",
                  }}>
                    + {currentLabel} (actuel)
                  </button>
                )}
              </div>

              {/* Timeframes */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Timeframes
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {allTFLabels.map(tf => {
                  const active = monitoredTFs.includes(tf);
                  return (
                    <button key={tf} onClick={() =>
                      setMonitoredTFs(prev => active ? prev.filter(x => x !== tf) : [...prev, tf])
                    } style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 5, cursor: "pointer",
                      background: active ? "rgba(99,102,241,0.15)" : "transparent",
                      border: `1px solid ${active ? "rgba(99,102,241,0.45)" : "#1c1c38"}`,
                      color: active ? "#818cf8" : "#475569",
                    }}>
                      {tf}
                    </button>
                  );
                })}
                {!tfIsMonitored && (
                  <button onClick={() => setMonitoredTFs(prev => [...prev, currentTfLabel])} style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 5, cursor: "pointer",
                    background: "rgba(240,200,74,0.08)", border: "1px solid rgba(240,200,74,0.25)",
                    color: "#f0c84a",
                  }}>
                    + {currentTfLabel} (actuel)
                  </button>
                )}
              </div>

              {/* Info mode */}
              <div style={{
                marginTop: 12, fontSize: 10, color: "#334155",
                background: "#080814", border: "1px solid #1c1c38",
                borderRadius: 6, padding: "8px 10px", lineHeight: 1.7,
              }}>
                <span style={{ color: "#475569", fontWeight: 700 }}>Condition d&apos;arrêt :</span> retest du prix d&apos;entrée (±0.15%)<br />
                <span style={{ color: "#475569", fontWeight: 700 }}>Fréquence :</span> rappel toutes les 15 min · vérification toutes les 5 min (cron)<br />
                {serverOk
                  ? <><span style={{ color: "#22c55e", fontWeight: 700 }}>☁ Mode Serveur :</span> surveillance active même si vous fermez le site</>
                  : <><span style={{ color: "#f59e0b", fontWeight: 700 }}>💻 Mode Local :</span> surveillance active uniquement si cette page reste ouverte (KV non configuré)</>
                }
              </div>
            </div>
          )}

          {/* ── Moniteurs actifs ─────────────────────────────────────── */}
          {activeMonitors.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeMonitors.map(m => {
                const isBuy         = m.type === "buy";
                const elapsed       = Date.now() - m.startedAt;
                const sinceLastSend = Date.now() - m.lastSentAt;
                const nextSendMs    = Math.max(0, REMINDER_MS - sinceLastSend);
                const nextMin       = Math.ceil(nextSendMs / 60000);
                return (
                  <div key={m.id} style={{
                    background: "#080814",
                    border: `1px solid ${isBuy ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"}`,
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 800,
                          color: isBuy ? "#22c55e" : "#ef4444",
                          fontFamily: "JetBrains Mono, monospace",
                        }}>
                          {isBuy ? "↑" : "↓"} {m.score}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{m.pair}</span>
                        <span style={{
                          fontSize: 9, color: "#475569", background: "#0d0d1a",
                          padding: "1px 5px", borderRadius: 4, border: "1px solid #1c1c38",
                        }}>{m.tf}</span>
                        {m.serverSynced && (
                          <span style={{ fontSize: 9, color: "#22c55e" }} title="Persisté sur le serveur">☁</span>
                        )}
                      </div>
                      <button onClick={() => removeMonitor(m.id)}
                        style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 3, columnGap: 12, fontSize: 10, color: "#64748b" }}>
                      <span>Entry : <strong style={{ color: "#94a3b8", fontFamily: "monospace" }}>{m.sigData.entry}</strong></span>
                      <span>Depuis : <strong style={{ color: "#94a3b8" }}>{formatElapsed(elapsed)}</strong></span>
                      <span>Rappels : <strong style={{ color: "#818cf8" }}>{m.reminderCount}</strong></span>
                      <span>Prochain : <strong style={{ color: nextMin <= 2 ? "#f0c84a" : "#64748b" }}>
                        {m.serverSynced ? "~cron 5m" : `${nextMin} min`}
                      </strong></span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 9, color: "#1e293b" }}>
                      ⟳ Arrêt auto au retest · TP1 {m.sigData.tp1} · Stop {m.sigData.sl}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#334155", textAlign: "center", padding: "8px 0" }}>
              {!isConfigured
                ? "Configure le bot Telegram pour commencer"
                : monitoredPairs.length === 0 || monitoredTFs.length === 0
                  ? "⚙ Ajoute des paires et timeframes dans Config"
                  : `En attente d'un signal sur ${monitoredPairs.join(", ")} · ${monitoredTFs.join(", ")}`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}
