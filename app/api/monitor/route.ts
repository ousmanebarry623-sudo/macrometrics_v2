// app/api/monitor/route.ts
// CRUD serveur pour la surveillance de signaux persistante côté Vercel KV.
// Le cron (autosend/cron) lit cette liste et envoie les rappels Telegram
// même quand le navigateur est fermé.
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

// ─── Type ─────────────────────────────────────────────────────────────────────
export interface ServerMonitor {
  id:             string;   // `${yf}:${tfLabel}:${sigTime}`
  yf:             string;   // ex: "EURUSD=X"
  label:          string;   // ex: "EUR/USD"
  tfLabel:        string;   // ex: "1H"
  type:           "buy" | "sell";
  entryPrice:     number;
  score:          string;   // ex: "B4"
  fEntry:         string;   // formatted entry price
  fTp1:           string;
  fTp2:           string;
  fTp3:           string;
  fSl:            string;
  sigTime:        number;
  addedAt:        number;
  lastReminderAt: number;
  reminderCount:  number;
  token:          string;   // Telegram bot token (stocké en KV)
  chatId:         string;
}

const KV_KEY = "signal_monitors";

// ─── Auth helper ──────────────────────────────────────────────────────────────
function checkAdmin(req: NextRequest): Response | null {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return Response.json({ error: "ADMIN_SECRET non configuré" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${adminSecret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

// ─── KV helper ────────────────────────────────────────────────────────────────
async function getKv() {
  const { kv, isRedisConfigured } = await import("@/lib/redis");
  if (!isRedisConfigured()) return null;
  return kv;
}

// ─── GET : liste des moniteurs actifs (sans token) ───────────────────────────
export async function GET() {
  const kv = await getKv();
  if (!kv) return Response.json({ error: "KV non configuré" }, { status: 503 });
  try {
    const monitors = await kv.get<ServerMonitor[]>(KV_KEY) ?? [];
    // Ne pas exposer le token Telegram dans la réponse
    const safe = monitors.map(({ token: _t, chatId: _c, ...m }) => m);
    return Response.json(safe);
  } catch (err) {
    return Response.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// ─── POST : ajouter / remplacer un moniteur ───────────────────────────────────
export async function POST(req: NextRequest) {
  const denied = checkAdmin(req);
  if (denied) return denied;
  const kv = await getKv();
  if (!kv) return Response.json({ error: "KV non configuré" }, { status: 503 });

  let body: Partial<ServerMonitor>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "JSON invalide" }, { status: 400 }); }

  if (!body.id || !body.yf || !body.token || !body.chatId) {
    return Response.json({ error: "Champs requis manquants: id, yf, token, chatId" }, { status: 400 });
  }

  const monitors = await kv.get<ServerMonitor[]>(KV_KEY) ?? [];
  // Remplacer si même paire + TF déjà en cours
  const filtered = monitors.filter(m => !(m.yf === body.yf && m.tfLabel === body.tfLabel));

  const now = Date.now();
  const newMonitor: ServerMonitor = {
    id:             body.id,
    yf:             body.yf,
    label:          body.label          ?? "",
    tfLabel:        body.tfLabel        ?? "",
    type:           body.type           ?? "buy",
    entryPrice:     body.entryPrice     ?? 0,
    score:          body.score          ?? "",
    fEntry:         body.fEntry         ?? "",
    fTp1:           body.fTp1           ?? "",
    fTp2:           body.fTp2           ?? "",
    fTp3:           body.fTp3           ?? "",
    fSl:            body.fSl            ?? "",
    sigTime:        body.sigTime        ?? now,
    addedAt:        now,
    lastReminderAt: now,   // pas de rappel immédiat, attendre 15 min
    reminderCount:  0,
    token:          body.token,
    chatId:         body.chatId,
  };

  filtered.push(newMonitor);
  await kv.set(KV_KEY, filtered);
  console.log(`[Monitor] Ajouté: ${newMonitor.id}`);
  return Response.json({ ok: true, id: newMonitor.id });
}

// ─── DELETE : supprimer un moniteur (ou tous) ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  const denied = checkAdmin(req);
  if (denied) return denied;
  const kv = await getKv();
  if (!kv) return Response.json({ error: "KV non configuré" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const monitors = await kv.get<ServerMonitor[]>(KV_KEY) ?? [];
    await kv.set(KV_KEY, monitors.filter(m => m.id !== id));
    console.log(`[Monitor] Supprimé: ${id}`);
  } else {
    // Tout effacer (ex: désactivation de la surveillance)
    await kv.set(KV_KEY, []);
    console.log("[Monitor] Tous les moniteurs supprimés");
  }

  return Response.json({ ok: true });
}
