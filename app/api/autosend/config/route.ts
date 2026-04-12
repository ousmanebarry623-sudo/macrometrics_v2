// app/api/autosend/config/route.ts
// Sauvegarde / lecture de la configuration d'envoi automatique côté serveur.
// Nécessite Vercel KV (variable d'env KV_REST_API_URL + KV_REST_API_TOKEN).
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WatchedSymbol {
  yf:       string;   // ex: "EURUSD=X"
  label:    string;   // ex: "EUR/USD"
  interval: string;   // ex: "60m"
  range:    string;   // ex: "200d"
  tfLabel:  string;   // ex: "1H"
}

export interface AutosendConfig {
  enabled:   boolean;
  token:     string;
  chatId:    string;
  symbols:   WatchedSymbol[];
  updatedAt: number;
}

const KV_KEY = "autosend_config";

// ─── Helper Redis ─────────────────────────────────────────────────────────────
async function getKv() {
  const { kv, isRedisConfigured } = await import("@/lib/redis");
  if (!isRedisConfigured()) return null;
  return kv;
}

// ─── GET : lire la config actuelle ───────────────────────────────────────────
export async function GET() {
  const kv = await getKv();
  if (!kv) {
    return Response.json(
      { error: "Redis non configuré", hint: "Ajoutez REDIS_URL dans vos variables d'environnement Vercel" },
      { status: 503 },
    );
  }
  try {
    const cfg = await kv.get<AutosendConfig>(KV_KEY);
    if (!cfg) return Response.json({ configured: false });
    // Masquer le token dans la réponse (ne renvoyer que les 8 premiers chars)
    return Response.json({
      configured: true,
      enabled:    cfg.enabled,
      chatId:     cfg.chatId,
      tokenHint:  cfg.token.slice(0, 8) + "…",
      symbols:    cfg.symbols,
      updatedAt:  cfg.updatedAt,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST : sauvegarder / mettre à jour la config ────────────────────────────
export async function POST(req: NextRequest) {
  const kv = await getKv();
  if (!kv) {
    return Response.json(
      { error: "Redis non configuré", hint: "Ajoutez REDIS_URL dans vos variables d'environnement Vercel" },
      { status: 503 },
    );
  }
  let body: Partial<AutosendConfig>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "JSON invalide" }, { status: 400 }); }

  if (!body.token || !body.chatId) {
    return Response.json({ error: "token et chatId sont requis" }, { status: 400 });
  }
  if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
    return Response.json({ error: "Au moins un symbole requis" }, { status: 400 });
  }

  const cfg: AutosendConfig = {
    enabled:   body.enabled ?? true,
    token:     body.token,
    chatId:    body.chatId,
    symbols:   body.symbols,
    updatedAt: Date.now(),
  };

  await kv.set(KV_KEY, cfg);
  return Response.json({ ok: true, updatedAt: cfg.updatedAt });
}

// ─── DELETE : désactiver / supprimer la config ────────────────────────────────
export async function DELETE() {
  const kv = await getKv();
  if (!kv) return Response.json({ error: "Redis non configuré" }, { status: 503 });
  await kv.del(KV_KEY);
  return Response.json({ ok: true });
}
