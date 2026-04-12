// components/TelegramPanel.tsx
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

export interface TelegramSignalData {
  sigTime:     number;
  symbol:      string;
  tf:          string;
  type:        "buy" | "sell";
  score:       string;
  sensitivity: number;
  strategy:    string;
  entry:       string;
  tp1:         string;
  tp2:         string;
  tp3:         string;
  sl:          string;
  trend:       string;
  volume:      string;
  momentum:    string;
  volatility:  string;
  barsSince:   number;
}

export interface ServerWatchSymbol {
  yf:       string;
  label:    string;
  interval: string;
  range:    string;
  tfLabel:  string;
}

interface TgChatInfo { id: number; title: string; type: string; username?: string; }
interface ApiResp {
  ok?: boolean; error?: string; hint?: string; code?: number;
  messageId?: number; botName?: string; botUsername?: string;
  chats?: TgChatInfo[]; noUpdates?: boolean;
}
interface ServerConfigResp {
  configured?: boolean; enabled?: boolean; chatId?: string; tokenHint?: string;
  symbols?: ServerWatchSymbol[]; updatedAt?: number; error?: string;
}

const LS_TOKEN     = "elte_tg_token";
const LS_CHAT_ID   = "elte_tg_chatid";
const MAX_BARS     = 15;   // n'envoie pas si le signal a plus de 15 bougies

// ─── Constructeur de message côté client (miroir de buildMessage() API) ───────
function buildClientMessage(d: TelegramSignalData): string {
  const isBuy = d.type === "buy";
  const emoji = isBuy ? "🟢" : "🔴";
  const dir   = isBuy ? "BUY" : "SELL";
  const arrow = isBuy ? "📈" : "📉";
  const bs    = d.barsSince;
  return [
    `${emoji} SIGNAL ${dir} — ${d.score}`,
    `💱 ${d.symbol} · ${d.tf}`,
    `📊 Stratégie : ${d.strategy}  |  Sensibilité : ${d.sensitivity}`,
    ``,
    `──────────────────`,
    `📍 Entry : ${d.entry}`,
    `🎯 TP 1  : ${d.tp1}`,
    `🎯 TP 2  : ${d.tp2}`,
    `🎯 TP 3  : ${d.tp3}`,
    `🛑 Stop  : ${d.sl}`,
    `──────────────────`,
    `${arrow} Trend : ${d.trend}`,
    `📦 Volume : ${d.volume}`,
    `⚡ Momentum : ${d.momentum}`,
    `🌡 Volatilité : ${d.volatility}`,
    bs > 0
      ? `⏱ Signal il y a ${bs} bougie${bs > 1 ? "s" : ""}`
      : `⏱ Signal sur la bougie actuelle`,
    ``,
    `🔒 ELTE SMART · Privé · macrometrics`,
  ].join("\n");
}

// ─── MODAL CONFIG TELEGRAM ───────────────────────────────────────────────────
function ConfigModal({ initToken, initChatId, onSave, onClose }: {
  initToken: string; initChatId: string;
  onSave: (t: string, c: string) => void; onClose: () => void;
}) {
  const [token,      setToken]      = useState(initToken);
  const [step,       setStep]       = useState<"idle"|"checking"|"done"|"err">("idle");
  const [botInfo,    setBotInfo]    = useState<{ name: string; username: string } | null>(null);
  const [chats,      setChats]      = useState<TgChatInfo[]>([]);
  const [selectedId, setSelectedId] = useState(initChatId);
  const [errMsg,     setErrMsg]     = useState("");
  const [testing,    setTesting]    = useState(false);
  const [testMsg,    setTestMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const handleVerify = useCallback(async () => {
    const t = token.trim();
    if (t.length < 20) { setErrMsg("Token trop court"); setStep("err"); return; }
    setStep("checking"); setErrMsg(""); setBotInfo(null); setChats([]); setTestMsg(null);
    try {
      const res  = await fetch(`/api/telegram?token=${encodeURIComponent(t)}`);
      const json = await res.json() as ApiResp;
      if (!json.ok) { setErrMsg(json.error ?? "Token invalide"); setStep("err"); return; }
      setBotInfo({ name: json.botName ?? "", username: json.botUsername ?? "" });
      const found = json.chats ?? [];
      setChats(found);
      if (found.length === 0) setSelectedId("");
      else if (found.length === 1) {
        const c0 = found[0];
        setSelectedId(c0.type === "private" ? String(c0.id) : (c0.username ? `@${c0.username}` : String(c0.id)));
      }
      setStep("done");
    } catch { setErrMsg("Erreur réseau"); setStep("err"); }
  }, [token]);

  const handleTest = useCallback(async () => {
    if (!selectedId) { setTestMsg({ ok: false, text: "Sélectionne d'abord un canal" }); return; }
    setTesting(true); setTestMsg(null);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim(), chatId: selectedId, testMode: true }),
      });
      const json = await res.json() as ApiResp;
      if (json.ok) setTestMsg({ ok: true, text: `✅ Message reçu ! (ID: ${json.messageId})` });
      else {
        const hint = json.hint ? ` → ${json.hint}` : "";
        setTestMsg({ ok: false, text: `❌ [${json.code}] ${json.error}${hint}` });
      }
    } catch { setTestMsg({ ok: false, text: "❌ Erreur réseau" }); }
    finally  { setTesting(false); }
  }, [token, selectedId]);

  const canSave = token.trim().length > 20 && selectedId.length > 1;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.82)", backdropFilter:"blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"#0c0c1c", border:"1px solid #1c1c38", borderRadius:14, width:"min(480px,96vw)", padding:26, display:"flex", flexDirection:"column", gap:16, boxShadow:"0 24px 64px rgba(0,0,0,.65)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:"#f1f5f9", margin:0 }}>📨 Configuration Telegram</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#94a3b8" }}>🤖 Bot Token <span style={{ fontWeight:400, color:"#334155" }}>(@BotFather → /newbot)</span></label>
          <div style={{ display:"flex", gap:6 }}>
            <input type="password" value={token} onChange={e => { setToken(e.target.value); setStep("idle"); setErrMsg(""); }}
              placeholder="7123456789:AAGxxxxxxxxxxxxxx..."
              style={{ flex:1, background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:8, color:"#e2e8f0", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"monospace" }} />
            <button onClick={handleVerify} disabled={step === "checking"}
              style={{ flexShrink:0, background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.35)", color:"#818cf8", borderRadius:8, padding:"0 16px", cursor:"pointer", fontSize:12, fontWeight:700, opacity: step === "checking" ? 0.5 : 1 }}>
              {step === "checking" ? "…" : "Vérifier"}
            </button>
          </div>
        </div>

        {step === "err" && (
          <div style={{ background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#f87171" }}>❌ {errMsg}</div>
        )}

        {step === "done" && (
          <>
            <div style={{ background:"rgba(34,197,94,.07)", border:"1px solid rgba(34,197,94,.2)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#22c55e" }}>
              ✅ Bot : <strong>@{botInfo?.username}</strong> ({botInfo?.name})
            </div>
            {chats.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>📋 Sélectionne le canal / groupe :</span>
                {chats.map(chat => {
                  const id       = chat.type === "private" ? String(chat.id) : (chat.username ? `@${chat.username}` : String(chat.id));
                  const selected = selectedId === id || selectedId === String(chat.id);
                  const em       = chat.type === "channel" ? "📣" : chat.type === "supergroup" || chat.type === "group" ? "👥" : "💬";
                  return (
                    <button key={chat.id} onClick={() => { setSelectedId(id); setTestMsg(null); }} style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      background: selected ? "rgba(34,197,94,.12)" : "#080814",
                      border:    `1px solid ${selected ? "rgba(34,197,94,.45)" : "#1c1c38"}`,
                      borderRadius:8, padding:"10px 14px", cursor:"pointer", gap:8 }}>
                      <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span>{em}</span>
                        <span style={{ fontSize:13, fontWeight:700, color: selected ? "#22c55e" : "#e2e8f0" }}>{chat.title}</span>
                        {chat.username && <span style={{ fontSize:10, color:"#475569" }}>@{chat.username}</span>}
                      </span>
                      {selected && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.3)", borderRadius:10, padding:"14px 16px", fontSize:12, lineHeight:1.9 }}>
                  <div style={{ fontWeight:700, color:"#818cf8", marginBottom:6 }}>💬 Option A — Chat personnel</div>
                  <div style={{ color:"#94a3b8" }}>
                    1. Ouvre <a href={`https://t.me/${botInfo?.username ?? ""}`} target="_blank" rel="noreferrer" style={{ color:"#818cf8", fontWeight:700 }}>t.me/@{botInfo?.username}</a><br />
                    2. Envoie <code style={{ background:"#1e1e3a", padding:"1px 6px", borderRadius:4 }}>/start</code><br />
                    3. Reviens ici → clique <strong style={{ color:"#818cf8" }}>Vérifier</strong>
                  </div>
                </div>
                <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.25)", borderRadius:10, padding:"14px 16px", fontSize:12, lineHeight:1.9 }}>
                  <div style={{ fontWeight:700, color:"#f59e0b", marginBottom:6 }}>📣 Option B — Canal</div>
                  <div style={{ color:"#94a3b8" }}>
                    1. Canal → Paramètres → <strong>Administrateurs</strong><br />
                    2. Ajoute <strong style={{ color:"#f59e0b" }}>@{botInfo?.username}</strong> → permission <strong>&quot;Envoyer des messages&quot;</strong><br />
                    3. Envoie un message dans le canal puis clique <strong style={{ color:"#f59e0b" }}>Vérifier</strong>
                  </div>
                </div>
              </div>
            )}
            {selectedId && (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={handleTest} disabled={testing} style={{
                  background:"rgba(34,197,94,.1)", border:"1px solid rgba(34,197,94,.3)",
                  color:"#22c55e", borderRadius:8, padding:"9px 0", cursor:"pointer", fontSize:12, fontWeight:700, opacity: testing ? 0.5 : 1 }}>
                  {testing ? "Envoi…" : "📤 Envoyer un message test"}
                </button>
                {testMsg && (
                  <div style={{ borderRadius:8, padding:"9px 14px", fontSize:12, wordBreak:"break-word",
                    background: testMsg.ok ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)",
                    border:    `1px solid ${testMsg.ok ? "rgba(34,197,94,.25)" : "rgba(239,68,68,.25)"}`,
                    color:      testMsg.ok ? "#22c55e" : "#f87171" }}>{testMsg.text}</div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4 }}>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid #1c1c38", color:"#475569", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12 }}>Annuler</button>
          <button onClick={() => { if (canSave) { onSave(token.trim(), selectedId); onClose(); } }} disabled={!canSave}
            style={{ background: canSave ? "rgba(37,99,235,.18)" : "#0d0d1a", border:`1px solid ${canSave ? "rgba(37,99,235,.45)" : "#1c1c38"}`, color: canSave ? "#60a5fa" : "#334155", borderRadius:8, padding:"8px 20px", cursor: canSave ? "pointer" : "not-allowed", fontSize:12, fontWeight:700 }}>
            💾 Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ÉDITEUR DE MESSAGE ─────────────────────────────────────────────────
function MessageEditorModal({ signal, token, chatId, onClose }: {
  signal: TelegramSignalData;
  token:  string;
  chatId: string;
  onClose: () => void;
}) {
  const [text,    setText]    = useState(() => buildClientMessage(signal));
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true); setResult(null);
    try {
      const res  = await fetch("/api/telegram", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ botToken: token, chatId, rawText: text }),
      });
      const json = await res.json() as ApiResp;
      if (json.ok) {
        setResult({ ok: true, msg: `✅ Envoyé ! (ID: ${json.messageId})` });
        setTimeout(onClose, 1500);
      } else {
        const hint = json.hint ? ` → ${json.hint}` : "";
        setResult({ ok: false, msg: `❌ [${json.code}] ${json.error}${hint}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: `❌ Erreur réseau : ${String(e)}` });
    } finally {
      setSending(false);
    }
  }, [text, token, chatId, onClose]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.85)", backdropFilter:"blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"#0c0c1c", border:"1px solid #1c1c38", borderRadius:14, width:"min(520px,96vw)", padding:22, display:"flex", flexDirection:"column", gap:14, boxShadow:"0 24px 64px rgba(0,0,0,.7)" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h2 style={{ fontSize:14, fontWeight:800, color:"#f1f5f9", margin:0 }}>✏️ Éditer le message Telegram</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:20 }}>✕</button>
        </div>

        <div style={{ fontSize:11, color:"#475569", background:"rgba(99,102,241,.06)", border:"1px solid rgba(99,102,241,.15)", borderRadius:8, padding:"8px 12px" }}>
          💡 Le message sera envoyé <strong style={{ color:"#818cf8" }}>tel quel</strong> (texte brut). Les emojis et le formatage Telegram sont conservés.
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          style={{
            background:"#080814", border:"1px solid #1c1c38", borderRadius:8,
            color:"#e2e8f0", fontSize:12, padding:"12px 14px", resize:"vertical",
            fontFamily:"monospace", lineHeight:1.7, minHeight:340, outline:"none",
          }}
        />

        <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={() => setText(buildClientMessage(signal))} style={{
            fontSize:11, padding:"5px 12px", borderRadius:6, cursor:"pointer",
            background:"transparent", border:"1px solid #1c1c38", color:"#475569",
          }}>↺ Réinitialiser</button>

          <div style={{ flex:1 }} />

          {result && (
            <span style={{ fontSize:11, fontWeight:700, color: result.ok ? "#22c55e" : "#f87171", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {result.msg}
            </span>
          )}

          <button onClick={onClose} style={{ fontSize:12, padding:"6px 14px", borderRadius:7, cursor:"pointer", background:"transparent", border:"1px solid #1c1c38", color:"#475569" }}>
            Annuler
          </button>
          <button onClick={handleSend} disabled={sending || !text.trim()} style={{
            fontSize:12, fontWeight:700, padding:"6px 18px", borderRadius:7, cursor: sending ? "wait" : "pointer",
            background:"rgba(34,197,94,.14)", border:"1px solid rgba(34,197,94,.4)", color:"#22c55e",
            opacity: sending ? 0.5 : 1,
          }}>
            {sending ? "Envoi…" : "📤 Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WIDGET PRINCIPAL ─────────────────────────────────────────────────────────
interface Props {
  signal:         TelegramSignalData | null;
  autoSend:       boolean;
  onAutoSent?:    (score: string) => void;
  watchedSymbol?: ServerWatchSymbol | null;
}

export default function TelegramPanel({ signal, autoSend, onAutoSent, watchedSymbol }: Props) {
  const [token,       setToken]      = useState("");
  const [chatId,      setChatId]     = useState("");
  const [ready,       setReady]      = useState(false);
  const [showConfig,  setShowConfig] = useState(false);
  const [showEditor,  setShowEditor] = useState(false);
  const [sending,     setSending]    = useState(false);
  const [status,      setStatus]     = useState<"idle"|"ok"|"err">("idle");
  const [errDetail,   setErrDetail]  = useState("");

  // Serveur auto-send
  const [serverStatus,  setServerStatus]  = useState<"idle"|"saving"|"ok"|"err">("idle");
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [serverErrMsg,  setServerErrMsg]  = useState("");
  const [kvAvailable,   setKvAvailable]   = useState<boolean | null>(null);

  const lastAutoSentRef = useRef<number>(0);
  const initializedRef  = useRef(false);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(LS_TOKEN)    ?? "");
      setChatId(localStorage.getItem(LS_CHAT_ID) ?? "");
    } catch { /* SSR */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/autosend/config")
      .then(r => r.json())
      .then((data: ServerConfigResp) => {
        if (data.error?.includes("KV non configuré")) {
          setKvAvailable(false);
        } else {
          setKvAvailable(true);
          setServerEnabled(data.enabled ?? false);
        }
      })
      .catch(() => setKvAvailable(false));
  }, [ready]);

  const handleSave = useCallback((t: string, c: string) => {
    setToken(t); setChatId(c);
    try { localStorage.setItem(LS_TOKEN, t); localStorage.setItem(LS_CHAT_ID, c); } catch { /* SSR */ }
  }, []);

  // ── Envoi d'un signal (brut ou structuré) ────────────────────────────────
  const sendSignal = useCallback(async (data: TelegramSignalData, manual = false) => {
    if (!token || !chatId) return;
    if (manual) setSending(true);
    try {
      const res  = await fetch("/api/telegram", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ botToken: token, chatId, ...data }),
      });
      const json = await res.json() as ApiResp;
      if (json.ok) {
        if (manual) { setStatus("ok"); setTimeout(() => setStatus("idle"), 5000); }
        else        { onAutoSent?.(data.score); }
      } else {
        const detail = [json.code ? `[${json.code}]` : "", json.error, json.hint].filter(Boolean).join(" — ");
        if (manual) { setErrDetail(detail); setStatus("err"); }
        else        { console.warn("[Telegram auto-send]", detail); }
      }
    } catch (e) {
      if (manual) { setErrDetail(`Réseau : ${String(e)}`); setStatus("err"); }
    } finally {
      if (manual) setSending(false);
    }
  }, [token, chatId, onAutoSent]);

  // ── Auto-send navigateur : filtre barsSince < MAX_BARS ───────────────────
  useEffect(() => {
    if (!ready || !autoSend || !signal || !token || !chatId) return;
    if (!initializedRef.current) {
      initializedRef.current  = true;
      lastAutoSentRef.current = signal.sigTime;
      return;
    }
    if (signal.sigTime === lastAutoSentRef.current) return;
    lastAutoSentRef.current = signal.sigTime;
    // Ne pas envoyer si signal trop ancien (> MAX_BARS bougies)
    if (signal.barsSince > MAX_BARS) {
      console.log(`[Telegram auto] Signal ignoré : ${signal.barsSince} bougies > ${MAX_BARS}`);
      return;
    }
    sendSignal(signal, false);
  }, [signal?.sigTime, autoSend, ready, token, chatId, sendSignal]); // eslint-disable-line

  // ── Activer/désactiver cron serveur ──────────────────────────────────────
  const handleServerToggle = useCallback(async (enable: boolean) => {
    if (!token || !chatId) { setServerErrMsg("Configure d'abord le bot ⚙"); setServerStatus("err"); return; }
    if (!watchedSymbol)    { setServerErrMsg("Attends qu'un signal soit visible"); setServerStatus("err"); return; }
    setServerStatus("saving"); setServerErrMsg("");
    try {
      const res  = await fetch("/api/autosend/config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: enable, token, chatId, symbols: [watchedSymbol] }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; hint?: string };
      if (json.ok) { setServerEnabled(enable); setServerStatus("ok"); setTimeout(() => setServerStatus("idle"), 3000); }
      else         { setServerErrMsg(json.hint ?? json.error ?? "Erreur serveur"); setServerStatus("err"); }
    } catch (e) { setServerErrMsg(String(e)); setServerStatus("err"); }
  }, [token, chatId, watchedSymbol]);

  const isConfigured = ready && token.length > 20 && chatId.length > 1;
  const isBuy        = signal?.type === "buy";
  const tooOld       = signal ? signal.barsSince > MAX_BARS : false;
  const serverActive = serverEnabled === true;

  return (
    <>
      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>

        {/* ── Ligne principale ─────────────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10, padding:"6px 10px" }}>
          <span style={{ width:7, height:7, borderRadius:"50%", display:"inline-block", flexShrink:0,
            background: isConfigured ? "#22c55e" : "#ef4444",
            boxShadow:  isConfigured ? "0 0 6px #22c55e70" : "none" }} />
          <span style={{ fontSize:11, fontWeight:700, color:"#475569" }}>📨</span>

          {isConfigured && autoSend && (
            <span style={{ fontSize:9, fontWeight:700, color:"#22c55e", background:"rgba(34,197,94,.1)", border:"1px solid rgba(34,197,94,.25)", borderRadius:4, padding:"1px 6px" }}>AUTO</span>
          )}

          {!isConfigured ? (
            <button onClick={() => setShowConfig(true)} style={{ fontSize:10, color:"#475569", background:"transparent", border:"1px solid #1c1c38", borderRadius:5, padding:"2px 8px", cursor:"pointer" }}>
              Configurer Telegram
            </button>
          ) : (
            <>
              <span style={{ fontSize:10, color:"#22c55e30", fontFamily:"monospace", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{chatId}</span>

              {signal ? (
                tooOld ? (
                  /* Signal trop ancien → bouton désactivé avec explication */
                  <span title={`Signal à ${signal.barsSince} bougies — limite ${MAX_BARS}`} style={{
                    fontSize:10, color:"#475569", background:"rgba(71,85,105,.08)", border:"1px solid #1c1c38",
                    borderRadius:6, padding:"4px 10px", cursor:"help",
                  }}>
                    ⏱ Signal ancien ({signal.barsSince} bougies)
                  </span>
                ) : (
                  /* Signal récent → boutons envoyer + éditer */
                  <>
                    <button onClick={() => sendSignal(signal, true)} disabled={sending} style={{
                      fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, cursor: sending ? "wait" : "pointer",
                      background: isBuy ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
                      border:    `1px solid ${isBuy ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)"}`,
                      color:      isBuy ? "#22c55e" : "#ef4444", opacity: sending ? 0.5 : 1 }}>
                      {sending ? "Envoi…" : `📤 ${signal.score}`}
                    </button>
                    <button onClick={() => setShowEditor(true)} title="Modifier le message avant envoi" style={{
                      fontSize:11, padding:"4px 9px", borderRadius:6, cursor:"pointer",
                      background:"rgba(99,102,241,.1)", border:"1px solid rgba(99,102,241,.3)", color:"#818cf8",
                    }}>✏️</button>
                  </>
                )
              ) : (
                <span style={{ fontSize:10, color:"#1e293b" }}>Attente signal…</span>
              )}
            </>
          )}

          <button onClick={() => { setStatus("idle"); setShowConfig(true); }} style={{ fontSize:11, padding:"3px 8px", borderRadius:5, cursor:"pointer", background:"transparent", border:"1px solid #1c1c38", color:"#334155" }}>⚙</button>
          {status === "ok" && <span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>✓ Envoyé !</span>}
          {status === "err" && <span title={errDetail} style={{ fontSize:11, color:"#f87171", fontWeight:700, cursor:"help", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✗ {errDetail || "Erreur"}</span>}
        </div>

        {/* ── Ligne serveur (cron Vercel) ─────────────────────────────── */}
        {ready && (
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", background:"#080814", border:"1px solid #151530", borderRadius:8, padding:"5px 10px" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", display:"inline-block", flexShrink:0,
              background:  serverActive ? "#818cf8" : "#1e293b",
              boxShadow:   serverActive ? "0 0 5px #818cf860" : "none" }} />
            <span style={{ fontSize:10, fontWeight:700, color:"#334155" }}>📡 Serveur</span>

            {kvAvailable === null && <span style={{ fontSize:10, color:"#334155" }}>…</span>}

            {kvAvailable === true && (
              <>
                {serverEnabled !== null && (
                  <span style={{ fontSize:10, color: serverActive ? "#818cf8" : "#334155", fontWeight:700 }}>
                    {serverActive ? "ACTIF" : "inactif"}
                  </span>
                )}
                {serverActive && watchedSymbol && (
                  <span style={{ fontSize:9, color:"#334155", fontFamily:"monospace" }}>
                    {watchedSymbol.label} · {watchedSymbol.tfLabel}
                  </span>
                )}
                {!serverActive ? (
                  <button onClick={() => handleServerToggle(true)} disabled={serverStatus === "saving" || !isConfigured}
                    title={!isConfigured ? "Configure d'abord le bot Telegram" : "Activer (navigateur fermé, cron toutes les 5 min)"}
                    style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:5, cursor: !isConfigured ? "not-allowed" : "pointer",
                      background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.3)",
                      color: isConfigured ? "#818cf8" : "#334155", opacity: serverStatus === "saving" ? 0.5 : 1 }}>
                    {serverStatus === "saving" ? "…" : "⚡ Activer"}
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleServerToggle(false)} disabled={serverStatus === "saving"}
                      style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:5, cursor:"pointer",
                        background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", color:"#f87171", opacity: serverStatus === "saving" ? 0.5 : 1 }}>
                      {serverStatus === "saving" ? "…" : "⏹ Désactiver"}
                    </button>
                    {watchedSymbol && (
                      <button onClick={() => handleServerToggle(true)} disabled={serverStatus === "saving"} title={`Surveiller ${watchedSymbol.label} ${watchedSymbol.tfLabel}`}
                        style={{ fontSize:9, padding:"2px 7px", borderRadius:5, cursor:"pointer", background:"transparent", border:"1px solid #1c1c38", color:"#334155" }}>
                        🔄 Màj
                      </button>
                    )}
                  </>
                )}
                {serverStatus === "ok"  && <span style={{ fontSize:10, color:"#22c55e", fontWeight:700 }}>✓ Sauvegardé</span>}
                {serverStatus === "err" && <span title={serverErrMsg} style={{ fontSize:10, color:"#f87171", fontWeight:700, cursor:"help" }}>✗ {serverErrMsg}</span>}
              </>
            )}
            {kvAvailable === false && (
              <span style={{ fontSize:9, color:"#334155" }}>(Vercel KV requis — <a href="https://vercel.com/docs/storage/vercel-kv/quickstart" target="_blank" rel="noreferrer" style={{ color:"#475569", textDecoration:"underline" }}>setup</a>)</span>
            )}
          </div>
        )}
      </div>

      {showConfig && <ConfigModal initToken={token} initChatId={chatId} onSave={handleSave} onClose={() => setShowConfig(false)} />}
      {showEditor && signal && isConfigured && (
        <MessageEditorModal signal={signal} token={token} chatId={chatId} onClose={() => setShowEditor(false)} />
      )}
    </>
  );
}
