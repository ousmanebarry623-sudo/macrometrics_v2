/**
 * /api/cron/real-yield — Vercel Cron: 1x/jour à 8h
 * Refresh real yield → Redis.
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/redis";

const REDIS_KEY = "macro:real-yield:v1";
const TTL_SECONDS = 25 * 3600;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://macrometrics-v2.vercel.app";
    await kv.del(REDIS_KEY); // forcer recalcul
    const res = await fetch(`${baseUrl}/api/real-yield`, { cache: "no-store" });
    if (!res.ok) throw new Error(`real-yield ${res.status}`);
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
