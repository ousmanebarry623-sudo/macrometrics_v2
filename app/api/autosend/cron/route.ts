// app/api/autosend/cron/route.ts
// Exécuté automatiquement par Vercel Cron toutes les 5 minutes.
// 1. Lit la config autosend dans KV, détecte les nouveaux signaux, envoie sur Telegram.
// 2. Traite les moniteurs de signaux persistants (rappels 15 min + détection retest).
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";
import { computeDash, aggregateCandles, type Candle } from "@/lib/dash-compute";
import type { AutosendConfig, WatchedSymbol } from "@/app/api/autosend/config/route";
import type { ServerMonitor } from "@/app/api/monitor/route";

// ─── KV helper ───────────────────────────────────────────────────────────────
async function getKv() {
  const { kv, isRedisConfigured } = await import("@/lib/redis");
  if (!isRedisConfigured()) return null;
  return kv;
}

// ─── Telegram HTML escape ────────────────────────────────────────────────────
function esc(s: string | number | undefined): string {
  if (s === undefined || s === null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Fetch candles depuis Yahoo Finance ─────────────────────────────────────
async function fetchCandles(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
      Referer: "https://finance.yahoo.com/",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens:   (number|null)[] = quote.open   ?? [];
  const highs:   (number|null)[] = quote.high   ?? [];
  const lows:    (number|null)[] = quote.low    ?? [];
  const closes:  (number|null)[] = quote.close  ?? [];
  const volumes: (number|null)[] = quote.volume ?? [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
    if (o==null||h==null||l==null||c==null) continue;
    candles.push({
      time: timestamps[i],
      open: parseFloat(o.toFixed(6)), high: parseFloat(h.toFixed(6)),
      low:  parseFloat(l.toFixed(6)), close: parseFloat(c.toFixed(6)),
      volume: volumes[i] ?? 0,
    });
  }
  return candles;
}

// ─── Déterminer le facteur d'agrégation à partir du label de TF ─────────────
// Mapping label → (interval source, range, factor)
// Doit correspondre exactement à SIGNAL_TFS dans SignalChart.tsx
const TF_MAP: Record<string, { interval: string; range: string; factor: number }> = {
  "1M":  { interval: "1m",  range: "5d",    factor: 1  },
  "5M":  { interval: "5m",  range: "60d",   factor: 1  },
  "15M": { interval: "15m", range: "60d",   factor: 1  },
  "30M": { interval: "30m", range: "60d",   factor: 1  },
  "1H":  { interval: "60m", range: "200d",  factor: 1  },
  "4H":  { interval: "60m", range: "200d",  factor: 4  },
  "D":   { interval: "1d",  range: "2y",    factor: 1  },
  "W":   { interval: "1wk", range: "5y",    factor: 1  },
  "M":   { interval: "1mo", range: "10y",   factor: 1  },
};

// ─── Formatter le prix ────────────────────────────────────────────────────────
function fmtPrice(v: number, sym: string): string {
  return sym.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
}

// ─── Construire le message Telegram ──────────────────────────────────────────
function buildMessage(
  sym: WatchedSymbol,
  type: "buy"|"sell",
  score: string,
  sens: number,
  entry: number,
  tp1: number, tp2: number, tp3: number, sl: number,
  dash: ReturnType<typeof computeDash>,
  barsSince: number,
): string {
  const isBuy  = type === "buy";
  const emoji  = isBuy ? "🟢" : "🔴";
  const dir    = isBuy ? "BUY" : "SELL";
  const arrow  = isBuy ? "📈" : "📉";
  const bs     = barsSince;

  return [
    `${emoji} <b>SIGNAL ${dir} — ${esc(score)}</b>`,
    `💱 <b>${esc(sym.label)}</b> · ${esc(sym.tfLabel)}`,
    `📊 Stratégie : <b>Normal</b>  |  Sensibilité : <b>${esc(sens)}</b>`,
    ``,
    `──────────────────`,
    `📍 Entry : <code>${esc(fmtPrice(entry, sym.yf))}</code>`,
    `🎯 TP 1  : <code>${esc(fmtPrice(tp1, sym.yf))}</code>`,
    `🎯 TP 2  : <code>${esc(fmtPrice(tp2, sym.yf))}</code>`,
    `🎯 TP 3  : <code>${esc(fmtPrice(tp3, sym.yf))}</code>`,
    `🛑 Stop  : <code>${esc(fmtPrice(sl, sym.yf))}</code>`,
    `──────────────────`,
    `${arrow} Trend : <b>${esc(dash?.trend ?? "—")}</b>`,
    `📦 Volume : <b>${esc(dash?.volume ?? "—")}</b>`,
    `⚡ Momentum : <b>${esc(dash?.momentum ?? "—")}</b>`,
    `🌡 Volatilité : ${esc(dash?.volatility ?? "—")}`,
    bs > 0
      ? `⏱ Signal il y a <b>${bs}</b> bougie${bs > 1 ? "s" : ""}`
      : `⏱ Signal sur la <b>bougie actuelle</b>`,
    ``,
    `🤖 <i>Auto-envoi ELTE SMART · macrometrics</i>`,
  ].join("\n");
}

// ─── Envoyer un message Telegram ─────────────────────────────────────────────
async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const json = await res.json() as { ok: boolean; description?: string };
  console.log("[Cron] Telegram send:", json.ok, json.description ?? "");
  return json.ok;
}

// ─── Construire un moniteur (sans écriture KV) ────────────────────────────────
function buildMonitor(
  sym: WatchedSymbol,
  cfg: AutosendConfig,
  type: "buy" | "sell",
  score: string,
  entry: number,
  tp1: number,
  tp2: number,
  tp3: number,
  sl: number,
  sigTime: number,
): ServerMonitor {
  const now = Date.now();
  return {
    id:             `${sym.yf}:${sym.tfLabel}:${sigTime}`,
    yf:             sym.yf,
    label:          sym.label,
    tfLabel:        sym.tfLabel,
    type,
    entryPrice:     entry,
    score,
    fEntry:         fmtPrice(entry, sym.yf),
    fTp1:           fmtPrice(tp1,   sym.yf),
    fTp2:           fmtPrice(tp2,   sym.yf),
    fTp3:           fmtPrice(tp3,   sym.yf),
    fSl:            fmtPrice(sl,    sym.yf),
    sigTime,
    addedAt:        now,
    lastReminderAt: now,
    reminderCount:  0,
    token:          cfg.token,
    chatId:         cfg.chatId,
  };
}

// ─── Traiter un symbole : fetch + compute + envoi si nouveau signal ───────────
async function processSymbol(
  sym: WatchedSymbol,
  cfg: AutosendConfig,
  kv: Awaited<ReturnType<typeof getKv>>,
): Promise<{ sent: boolean; score: string | null; reason: string; newMonitor: ServerMonitor | null }> {
  // Résoudre l'interval/range/factor depuis le label TF
  const tfInfo = TF_MAP[sym.tfLabel] ?? { interval: sym.interval, range: sym.range, factor: 1 };

  // Fetch candles
  let candles = await fetchCandles(sym.yf, tfInfo.interval, tfInfo.range);
  if (candles.length < 20) return { sent: false, score: null, reason: "pas assez de données", newMonitor: null };

  // Agréger si besoin (ex: 60m → 4H)
  if (tfInfo.factor > 1) {
    candles = aggregateCandles(candles, tfInfo.factor);
  }

  // Calculer le dashboard
  const dash = computeDash(candles);
  if (!dash || !dash.lastSignal) return { sent: false, score: null, reason: "aucun signal trouvé", newMonitor: null };

  const sig = dash.lastSignal;

  // Ignorer les signaux trop anciens (> 3 bougies) — évite d'envoyer des signaux historiques
  if (dash.barsSince > 3) {
    return { sent: false, score: null, reason: `signal trop ancien (${dash.barsSince} bougies)`, newMonitor: null };
  }

  // Vérifier si ce signal a déjà été envoyé
  const kvKey = `autosend_lastsig:${sym.yf}:${sym.tfLabel}`;
  const lastSentTime = kv ? await kv.get<number>(kvKey) : null;

  if (lastSentTime !== null && lastSentTime >= sig.time) {
    return { sent: false, score: null, reason: `déjà envoyé (sigTime=${sig.time})`, newMonitor: null };
  }

  // Calculer les niveaux TP/SL
  const risk = Math.abs(sig.close - sig.st);
  const dir  = sig.type === "buy" ? 1 : -1;
  const entry = sig.close;
  const tp1   = entry + dir * 1 * risk;
  const tp2   = entry + dir * 2 * risk;
  const tp3   = entry + dir * 3 * risk;
  const sl    = entry - dir * risk;

  const sensLabel = Number.isInteger(sig.sens)
    ? String(sig.sens)
    : sig.sens.toFixed(1).replace(/\.0$/, "");
  const score = `${sig.type === "buy" ? "B" : "S"}${sensLabel}`;

  const text = buildMessage(
    sym, sig.type, score, sig.sens,
    entry, tp1, tp2, tp3, sl,
    dash, dash.barsSince,
  );

  // Envoyer le message
  const ok = await sendTelegram(cfg.token, cfg.chatId, text);
  if (ok && kv) {
    await kv.set(kvKey, sig.time, { ex: 60 * 60 * 24 * 7 }); // TTL 7 jours
  }
  const newMonitor = ok ? buildMonitor(sym, cfg, sig.type, score, entry, tp1, tp2, tp3, sl, sig.time) : null;
  return { sent: ok, score, reason: ok ? "envoyé" : "erreur Telegram", newMonitor };
}

// ─── Récupérer le dernier prix Yahoo Finance ──────────────────────────────────
async function fetchLatestPrice(symbol: string): Promise<number | null> {
  const candles = await fetchCandles(symbol, "1m", "1d");
  if (candles.length === 0) return null;
  return candles[candles.length - 1].close;
}


// ─── Détection de retest ──────────────────────────────────────────────────────
const RETEST_TOL = 0.0015; // ±0.15%
function hasRetested(type: "buy" | "sell", entry: number, current: number): boolean {
  if (type === "buy")  return current <= entry * (1 + RETEST_TOL);
  return current >= entry * (1 - RETEST_TOL);
}

// ─── Messages pour les moniteurs ──────────────────────────────────────────────
function buildReminderMsg(m: ServerMonitor, n: number): string {
  const dir     = m.type === "buy" ? "BUY" : "SELL";
  const elapsed = Math.round((Date.now() - m.addedAt) / 60000);
  return [
    `🔔 RAPPEL #${n} — SIGNAL ${dir} · ${esc(m.score)}`,
    `💱 ${esc(m.label)} · ${esc(m.tfLabel)}`,
    `──────────────────`,
    `📍 Entry  : <code>${esc(m.fEntry)}</code>  (pas encore retesté)`,
    `🎯 TP 1   : <code>${esc(m.fTp1)}</code>`,
    `🎯 TP 2   : <code>${esc(m.fTp2)}</code>`,
    `🎯 TP 3   : <code>${esc(m.fTp3)}</code>`,
    `🛑 Stop   : <code>${esc(m.fSl)}</code>`,
    `──────────────────`,
    `⏱ Signal actif depuis ${elapsed} min`,
    ``,
    `🔒 <i>ELTE SMART · macrometrics</i>`,
  ].join("\n");
}

function buildRetestMsg(m: ServerMonitor, currentPriceStr: string): string {
  const dir     = m.type === "buy" ? "BUY" : "SELL";
  const elapsed = Math.round((Date.now() - m.addedAt) / 60000);
  const n       = m.reminderCount;
  return [
    `✅ RETEST ENTRÉE — ${dir} · ${esc(m.score)}`,
    `💱 ${esc(m.label)} · ${esc(m.tfLabel)}`,
    ``,
    `📍 Entry         : <code>${esc(m.fEntry)}</code>`,
    `📊 Prix actuel   : <code>${esc(currentPriceStr)}</code>  ← retest détecté`,
    ``,
    `⏱ Signal actif pendant ${elapsed} min · ${n} rappel${n !== 1 ? "s" : ""} envoyé${n !== 1 ? "s" : ""}`,
    `⏹ Surveillance terminée automatiquement.`,
    ``,
    `🔒 <i>ELTE SMART · macrometrics</i>`,
  ].join("\n");
}

// ─── Traiter tous les moniteurs persistants ───────────────────────────────────
async function processMonitors(
  monitors: ServerMonitor[],
): Promise<{ remaining: ServerMonitor[]; reminders: number; retests: number }> {
  if (monitors.length === 0) return { remaining: monitors, reminders: 0, retests: 0 };

  const REMINDER_MS = 15 * 60 * 1000;
  const now         = Date.now();
  let reminders = 0, retests = 0;

  const toRemove: string[] = [];
  const remaining: ServerMonitor[] = [];

  for (const m of monitors) {
    // Pas encore 15 min depuis le dernier envoi
    if (now - m.lastReminderAt < REMINDER_MS) {
      remaining.push(m);
      continue;
    }

    const current = await fetchLatestPrice(m.yf);
    if (current === null) {
      // Impossible de récupérer le prix → conserver, réessayer plus tard
      remaining.push(m);
      continue;
    }

    const priceStr = m.yf.includes("JPY") ? current.toFixed(3) : current.toFixed(5);

    if (hasRetested(m.type, m.entryPrice, current)) {
      await sendTelegram(m.token, m.chatId, buildRetestMsg(m, priceStr));
      toRemove.push(m.id);
      retests++;
    } else {
      const n = m.reminderCount + 1;
      await sendTelegram(m.token, m.chatId, buildReminderMsg(m, n));
      remaining.push({ ...m, lastReminderAt: now, reminderCount: n });
      reminders++;
    }
  }

  // Retourner la liste mise à jour (sans les moniteurs terminés par retest)
  const updated = remaining.filter(m => !toRemove.includes(m.id));
  return { remaining: updated, reminders, retests };
}

// ─── HANDLER CRON ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Sécurité : Vercel envoie un header CRON_SECRET automatiquement
  // En prod, vérifier que la requête vient bien de Vercel
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kv = await getKv();
  if (!kv) {
    return Response.json({ error: "KV non configuré" }, { status: 503 });
  }

  // Charger la config
  const cfg = await kv.get<AutosendConfig>("autosend_config");
  if (!cfg) return Response.json({ skipped: true, reason: "aucune config" });
  if (!cfg.enabled) return Response.json({ skipped: true, reason: "auto-send désactivé" });
  if (!cfg.token || !cfg.chatId) return Response.json({ skipped: true, reason: "token/chatId manquant" });
  if (!cfg.symbols || cfg.symbols.length === 0) return Response.json({ skipped: true, reason: "aucun symbole configuré" });

  // Load monitors once
  let monitors = await kv.get<ServerMonitor[]>("signal_monitors") ?? [];

  // Traiter chaque symbole autosend
  const results: Record<string, { sent: boolean; score: string | null; reason: string }> = {};
  const newMonitors: ServerMonitor[] = [];
  for (const sym of cfg.symbols) {
    try {
      const r = await processSymbol(sym, cfg, kv);
      results[`${sym.label}-${sym.tfLabel}`] = { sent: r.sent, score: r.score, reason: r.reason };
      if (r.newMonitor) {
        // Dedup: remove existing monitor for same pair+TF, add new one
        monitors = monitors.filter(m => !(m.yf === r.newMonitor!.yf && m.tfLabel === r.newMonitor!.tfLabel));
        newMonitors.push(r.newMonitor);
        console.log(`[Cron] Monitor enregistré : ${r.newMonitor.id}`);
      }
    } catch (err) {
      results[`${sym.label}-${sym.tfLabel}`] = { sent: false, score: null, reason: String(err) };
    }
  }

  // Merge new monitors in
  monitors = [...monitors, ...newMonitors];

  // Traiter les moniteurs persistants (rappels + retest) — retourne la liste mise à jour
  let monitorStats = { checked: monitors.length, reminders: 0, retests: 0 };
  let remaining = monitors;
  try {
    const processed = await processMonitors(monitors);
    remaining = processed.remaining;
    monitorStats = { checked: monitors.length, reminders: processed.reminders, retests: processed.retests };
  } catch (err) {
    console.error("[Cron/Monitors] Erreur:", err);
  }

  // Single write to KV
  await kv.set("signal_monitors", remaining, { ex: 60 * 60 * 24 * 30 });
  console.log(`[Cron/Monitors] checked=${monitorStats.checked} reminders=${monitorStats.reminders} retests=${monitorStats.retests}`);

  console.log("[Cron] Résultats:", JSON.stringify(results));
  return Response.json({ ok: true, results, monitors: monitorStats, ts: Date.now() });
}
