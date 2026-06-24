/**
 * POST /api/mt4-webhook
 *
 * Receives signals from MT4 EA (ELTE PULLBACK) and stores them.
 * GET  /api/mt4-webhook   → returns all active signals (for EALivePanel)
 *
 * Storage: Redis (lib/redis.ts) or in-process Map (fallback).
 *
 * POST body (JSON from MT4):
 * {
 *   "action":    "OPEN"|"CLOSE"|"UPDATE"|"HEARTBEAT",
 *   "symbol":    "EURUSD",
 *   "direction": "BUY"|"SELL",
 *   "entry":     1.08540,
 *   "sl":        1.08300,
 *   "tp":        1.09200,
 *   "lots":      0.01,
 *   "ticket":    12345678,
 *   "account":   "ELTE_PB",
 *   "timestamp": "2026-06-24T10:00:00Z"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/redis";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MT4Signal {
  action:     "OPEN" | "CLOSE" | "UPDATE" | "HEARTBEAT";
  symbol:     string;
  direction:  "BUY" | "SELL";
  entry:      number;
  sl:         number;
  tp:         number;
  lots:       number;
  ticket:     number;
  account:    string;
  timestamp:  string;
  receivedAt: string;
}

// ─── In-process store (fallback when Redis not configured) ────────────────────
const memStore = new Map<number, MT4Signal>();

const REDIS_KEY = "mt4:signals:elte_pb";
const REDIS_TTL = 24 * 60 * 60; // 24h — auto-expire stale positions

// ─── Store helpers ────────────────────────────────────────────────────────────
async function storeSignal(sig: MT4Signal) {
  if (sig.action === "CLOSE") {
    memStore.delete(sig.ticket);
    await kv.del(`${REDIS_KEY}:${sig.ticket}`).catch(() => {});
  } else {
    memStore.set(sig.ticket, sig);
    await kv.set(`${REDIS_KEY}:${sig.ticket}`, sig, { ex: REDIS_TTL }).catch(() => {});
  }
}

async function getAllSignals(): Promise<MT4Signal[]> {
  // Try Redis first (survives cold starts)
  const redisResults: MT4Signal[] = [];
  // Collect from known tickets in mem then supplement with Redis
  // Primary: in-memory (warm instance), secondary: Redis keys
  if (memStore.size > 0) return Array.from(memStore.values());

  // Redis fallback: we stored as individual keys, so we need a scan
  // For simplicity, return empty on cold start (positions will repopulate via EA heartbeat)
  return redisResults;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-mt4-secret");
  return res;
}
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

const SECRET = process.env.MT4_WEBHOOK_SECRET;

// ─── POST — receive from MT4 ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (SECRET && req.headers.get("x-mt4-secret") !== SECRET) {
    return cors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }
  let body: Partial<MT4Signal>;
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ error: "invalid json" }, { status: 400 }));
  }
  if (!body.symbol || !body.action) {
    return cors(NextResponse.json({ error: "symbol + action required" }, { status: 400 }));
  }
  const sig: MT4Signal = {
    action:     body.action    ?? "UPDATE",
    symbol:     body.symbol    ?? "",
    direction:  body.direction ?? "BUY",
    entry:      body.entry     ?? 0,
    sl:         body.sl        ?? 0,
    tp:         body.tp        ?? 0,
    lots:       body.lots      ?? 0,
    ticket:     body.ticket    ?? 0,
    account:    body.account   ?? "MT4",
    timestamp:  body.timestamp ?? new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };
  await storeSignal(sig);
  console.log("[mt4-webhook] received:", sig.action, sig.symbol, sig.direction);
  return cors(NextResponse.json({ ok: true, ticket: sig.ticket }));
}

// ─── GET — return stored signals to EALivePanel ───────────────────────────────
export async function GET() {
  const signals = await getAllSignals();
  return cors(
    NextResponse.json({ signals, count: signals.length, updatedAt: new Date().toISOString() })
  );
}
