// app/api/telegram/route.ts — Envoi de signal via Telegram Bot API (server-side)
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

interface TelegramPayload {
  botToken:    string;
  chatId:      string;
  symbol?:     string;
  tf?:         string;
  type?:       "buy" | "sell";
  score?:      string;
  sensitivity?: number;
  strategy?:   string;
  entry?:      string;
  tp1?:        string;
  tp2?:        string;
  tp3?:        string;
  sl?:         string;
  trend?:      string;
  volume?:     string;
  momentum?:   string;
  volatility?: string;
  barsSince?:  number;
  // Signal PRO enrichment
  confidence?:  number;
  confLevel?:   "HIGH" | "MEDIUM" | "LOW";
  horizon?:     string;
  divergences?: string[];
  resume?:      string;
  testMode?:   boolean;
  rawText?:    string;
}

// Échapper les caractères spéciaux HTML pour Telegram HTML mode
// (Telegram accepte uniquement &lt; &gt; &amp; comme entités)
function esc(s: string | number | undefined): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMessage(p: TelegramPayload): string {
  if (p.testMode) {
    return [
      `✅ <b>Test de connexion réussi !</b>`,
      ``,
      `🤖 Bot connecté · Canal : <code>${esc(p.chatId)}</code>`,
      `📡 <i>ELTE SMART macrometrics</i>`,
    ].join("\n");
  }

  const isBuy = p.type === "buy";
  const dirEmoji  = isBuy ? "🟢" : "🔴";
  const dir       = isBuy ? "BUY" : "SELL";
  const trendIcon = isBuy ? "📈" : "📉";
  const bs        = p.barsSince ?? 0;

  // Confidence badge
  const confEmoji = p.confLevel === "HIGH" ? "🔥" : p.confLevel === "MEDIUM" ? "⚡" : "⚪";
  const confText  = p.confLevel === "HIGH" ? "FORTE" : p.confLevel === "MEDIUM" ? "MODÉRÉE" : "FAIBLE";
  const confLine  = p.confidence !== undefined
    ? `${confEmoji} Confiance : <b>${confText}</b> (${p.confidence}%)`
    : "";

  // Horizon line
  const horizonLine = p.horizon ? `⏳ Horizon : <b>${esc(p.horizon)}</b>` : "";

  // Divergences (max 3, abrégées)
  const divLines: string[] = [];
  if (p.divergences && p.divergences.length > 0) {
    divLines.push(`⚠️ <b>Divergences :</b>`);
    p.divergences.slice(0, 3).forEach(d => divLines.push(`  • ${esc(d)}`));
  }

  const lines: string[] = [
    `${dirEmoji} <b>SIGNAL ${dir} — ${esc(p.score)}</b>`,
    `💱 <b>${esc(p.symbol)}</b> · <b>${esc(p.tf)}</b>  |  Stratégie : ${esc(p.strategy)}`,
    confLine,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📍 Entry  : <code>${esc(p.entry)}</code>`,
    `🎯 TP 1   : <code>${esc(p.tp1)}</code>`,
    `🎯 TP 2   : <code>${esc(p.tp2)}</code>`,
    `🎯 TP 3   : <code>${esc(p.tp3)}</code>`,
    `🛑 Stop   : <code>${esc(p.sl)}</code>`,
    `━━━━━━━━━━━━━━━━━━`,
    `${trendIcon} Trend : <b>${esc(p.trend)}</b>  |  Volume : <b>${esc(p.volume)}</b>`,
    `⚡ Momentum : <b>${esc(p.momentum)}</b>  |  Volatilité : ${esc(p.volatility)}`,
    horizonLine,
    bs > 0
      ? `⏱ Signal il y a <b>${bs}</b> bougie${bs > 1 ? "s" : ""}`
      : `⏱ Signal sur la <b>bougie actuelle</b>`,
  ];

  if (divLines.length > 0) {
    lines.push(``, ...divLines);
  }

  if (p.resume) {
    lines.push(``, `📋 <i>${esc(p.resume)}</i>`);
  }

  lines.push(``, `🔒 <i>ELTE SMART · Privé · macrometrics</i>`);

  return lines.filter(l => l !== undefined && l !== null).join("\n");
}

async function sendToTelegram(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });

  console.log("[Telegram] Sending to", chatId, "— body length:", body.length);

  const res  = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const json = await res.json() as { ok: boolean; description?: string; error_code?: number; result?: { message_id: number } };
  console.log("[Telegram] Response:", JSON.stringify(json));

  return { httpOk: res.ok, tgJson: json };
}

// ─── POST : envoyer un signal (ou message test) ───────────────────────────────
export async function POST(req: NextRequest) {
  let body: TelegramPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { botToken, chatId } = body;
  if (!botToken || !chatId) {
    return Response.json({ error: "botToken et chatId sont requis" }, { status: 400 });
  }
  if (botToken.length < 20) {
    return Response.json({ error: "Token Telegram invalide (trop court)" }, { status: 400 });
  }

  try {
    const text = body.rawText ?? buildMessage(body);
    const { httpOk, tgJson } = await sendToTelegram(botToken, chatId, text);

    if (!httpOk || !tgJson.ok) {
      const errMsg = tgJson.description ?? "Erreur inconnue Telegram";
      const code   = tgJson.error_code ?? 0;

      // Messages d'erreur explicites pour les cas fréquents
      let hint = "";
      if (code === 401) hint = "Token invalide — vérifiez le token @BotFather";
      else if (code === 400 && errMsg.includes("chat not found")) hint = "Chat ID introuvable — le bot doit être ajouté au canal";
      else if (code === 403) hint = "Bot banni ou non admin du canal";
      else if (code === 400 && errMsg.includes("parse")) hint = "Erreur format HTML — signaler ce bug";

      return Response.json({ error: errMsg, code, hint }, { status: 400 });
    }

    return Response.json({ ok: true, messageId: tgJson.result?.message_id });
  } catch (err) {
    console.error("[Telegram] fetch error:", err);
    return Response.json({ error: `Erreur réseau : ${String(err)}` }, { status: 500 });
  }
}

// ─── types internes getUpdates ────────────────────────────────────────────────
interface TgChat { id: number; title?: string; username?: string; type: string; first_name?: string; }
interface TgUpdate { message?: { chat: TgChat }; channel_post?: { chat: TgChat }; my_chat_member?: { chat: TgChat }; }

// ─── GET : vérifier le token + récupérer les chats disponibles ───────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const botToken = searchParams.get("token") ?? "";
  if (!botToken || botToken.length < 20) {
    return Response.json({ error: "token requis" }, { status: 400 });
  }

  try {
    // 1. Vérifier le bot
    const meRes  = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meJson = await meRes.json() as { ok: boolean; result?: { username?: string; first_name?: string }; description?: string };
    if (!meJson.ok) return Response.json({ error: meJson.description ?? "Token invalide" }, { status: 400 });

    // 2. getUpdates (POST avec body JSON — le GET ne supporte pas allowed_updates JSON)
    // On appelle 2 fois : une fois avec offset=0 pour avoir l'historique complet,
    // une fois sans offset pour avoir les updates récents
    const updRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        limit:           100,
        allowed_updates: ["message", "channel_post", "my_chat_member", "chat_member"],
      }),
    });
    const updJson = await updRes.json() as { ok: boolean; result?: TgUpdate[] };

    const chatsMap = new Map<number, { id: number; title: string; type: string; username?: string }>();
    if (updJson.ok && updJson.result) {
      for (const upd of updJson.result) {
        const chat = upd.channel_post?.chat ?? upd.message?.chat ?? upd.my_chat_member?.chat;
        if (!chat) continue;
        const title = chat.title ?? chat.first_name ?? chat.username ?? String(chat.id);
        chatsMap.set(chat.id, {
          id:       chat.id,
          title,
          type:     chat.type,
          username: chat.username,
        });
      }
    }

    const chats = Array.from(chatsMap.values());
    console.log("[Telegram] getUpdates ok:", updJson.ok, "— updates:", updJson.result?.length ?? 0, "— chats found:", chats.length);

    return Response.json({
      ok:          true,
      botName:     meJson.result?.first_name,
      botUsername: meJson.result?.username,
      chats,
      noUpdates:   !updJson.ok || (updJson.result?.length ?? 0) === 0,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
