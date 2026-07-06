# Persistent Server-Side Signal Monitoring

**Date:** 2026-04-20  
**Status:** Approved  
**Branch:** feature/market-regime-detector

## Problem

When the user closes the browser or loses connection, the surveillance system stops working. Two root causes:

1. `vercel.json` is empty — Vercel never schedules the cron job automatically
2. `processSymbol()` sends the initial signal to Telegram but never registers a `ServerMonitor` in KV — so no 15-minute reminders are sent server-side for signals detected while the browser is closed

## Solution — Option A (minimal fix)

Fix both gaps without new infrastructure. The existing `processMonitors()` loop already handles reminders and retest detection correctly — it just never gets data to work with when the browser is closed.

## Architecture

```
[Vercel Cron — every 5 min]
        │
        ▼
GET /api/autosend/cron
        │
        ├─ processSymbol(sym)  ← each autosend symbol
        │       │  new signal detected → sendTelegram()
        │       └─ registerMonitor() → KV.set("signal_monitors")   ← NEW
        │
        └─ processMonitors()  ← always runs
                ├─ fetchLatestPrice(sym.yf)
                ├─ retest → buildRetestMsg → Telegram → remove from KV
                └─ 15 min elapsed → buildReminderMsg → Telegram → update lastReminderAt
```

## Changes

### 1. `vercel.json`

Add the cron schedule so Vercel automatically calls the handler every 5 minutes:

```json
{
  "crons": [
    {
      "path": "/api/autosend/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 2. `app/api/autosend/cron/route.ts` — new `registerMonitor()` function

Add a pure function that writes a `ServerMonitor` to KV after a signal is successfully sent:

```typescript
async function registerMonitor(
  sym: WatchedSymbol,
  cfg: AutosendConfig,
  kv: NonNullable<Awaited<ReturnType<typeof getKv>>>,
  type: "buy" | "sell",
  score: string,
  entry: number,
  tp1: number, tp2: number, tp3: number, sl: number,
  sigTime: number,
): Promise<void> {
  const monitors = await kv.get<ServerMonitor[]>("signal_monitors") ?? [];
  // Replace existing monitor for same pair+TF (one active monitor per pair)
  const filtered = monitors.filter(m => !(m.yf === sym.yf && m.tfLabel === sym.tfLabel));
  const now = Date.now();
  const monitor: ServerMonitor = {
    id: `${sym.yf}:${sym.tfLabel}:${sigTime}`,
    yf: sym.yf,
    label: sym.label,
    tfLabel: sym.tfLabel,
    type,
    entryPrice: entry,
    score,
    fEntry: fmtPrice(entry, sym.yf),
    fTp1:  fmtPrice(tp1, sym.yf),
    fTp2:  fmtPrice(tp2, sym.yf),
    fTp3:  fmtPrice(tp3, sym.yf),
    fSl:   fmtPrice(sl, sym.yf),
    sigTime,
    addedAt: now,
    lastReminderAt: now,  // first reminder in 15 min, not immediately
    reminderCount: 0,
    token: cfg.token,
    chatId: cfg.chatId,
  };
  await kv.set("signal_monitors", [...filtered, monitor]);
}
```

### 3. `processSymbol()` — call `registerMonitor()` after successful send

```typescript
const ok = await sendTelegram(cfg.token, cfg.chatId, text);
if (ok && kv) {
  await kv.set(kvKey, sig.time, { ex: 60 * 60 * 24 * 7 });
  await registerMonitor(sym, cfg, kv, sig.type, score, entry, tp1, tp2, tp3, sl, sig.time); // NEW
}
```

## Duplicate Prevention

- The cron calls `registerMonitor()` which replaces by `(yf, tfLabel)` — one active monitor per pair+TF
- `/api/monitor POST` (used by `SignalMonitorPanel` in the browser) also replaces by `(yf, tfLabel)`
- If the browser is open and both paths fire, the second write simply replaces the first — no duplicate reminders

## Invariants

- `lastReminderAt = now` on creation → first reminder exactly 15 min after signal, not immediately
- `reminderCount` starts at 0; incremented by `processMonitors()` on each reminder sent
- Monitor is removed from KV on retest detection — no further reminders
- No change to `processMonitors()`, `/api/monitor`, or `SignalMonitorPanel`

## Environment Variables Required

- `CRON_SECRET` — must be set in Vercel project settings; Vercel sends it automatically as `Authorization: Bearer <secret>`
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV credentials (already configured)

## Out of Scope

- Changing reminder interval (stays 15 min)
- Changing retest tolerance (stays ±0.15%)
- UI changes to SignalMonitorPanel
- Separate cron endpoint for monitors
