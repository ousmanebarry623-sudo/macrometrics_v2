import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";

export const dynamic = "force-dynamic";

const REDIS_KEY = "macro:brief:v1";
const WRITE_KEY = "mm_brief_2026";

// GET /api/macro-brief — retourne le dernier brief généré
export async function GET() {
  try {
    const brief = await kv.get(REDIS_KEY);
    if (!brief) {
      return NextResponse.json({ error: "Aucun brief disponible — workflow n8n pas encore exécuté" }, { status: 404 });
    }
    return NextResponse.json(brief);
  } catch {
    return NextResponse.json({ error: "Erreur Redis" }, { status: 500 });
  }
}

// POST /api/macro-brief — stocke le brief depuis n8n
// Body: { key: "mm_brief_2026", brief: { ... } }
export async function POST(req: Request) {
  try {
    const body = await req.json() as { key?: string; brief?: unknown };
    if (body.key !== WRITE_KEY) {
      return NextResponse.json({ error: "Clé invalide" }, { status: 401 });
    }
    if (!body.brief || typeof body.brief !== "object") {
      return NextResponse.json({ error: "Brief manquant" }, { status: 400 });
    }
    await kv.set(REDIS_KEY, body.brief);
    return NextResponse.json({ ok: true, storedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
