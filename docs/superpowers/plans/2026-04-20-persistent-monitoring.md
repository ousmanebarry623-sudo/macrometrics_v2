# Persistent Server-Side Signal Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make signal surveillance continue on the server even when the user closes the browser, by scheduling the cron job in `vercel.json` and auto-registering a `ServerMonitor` in KV each time the cron sends a new signal.

**Architecture:** Two targeted edits — `vercel.json` gets the Vercel cron schedule, and `processSymbol()` in the cron route gets a new `registerMonitor()` helper called after a successful Telegram send. `processMonitors()` already handles reminders and retest detection and requires no changes.

**Tech Stack:** Next.js App Router, Vercel Cron, Vercel KV (Redis via `@vercel/kv`)

---

## File Map

| File | Change |
|------|--------|
| `vercel.json` | Add `"crons"` array with `*/5 * * * *` schedule for `/api/autosend/cron` |
| `app/api/autosend/cron/route.ts` | Add `registerMonitor()` function; call it in `processSymbol()` after successful send |

---

### Task 1: Schedule the cron in `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Replace contents of `vercel.json`**

Current file is `{}`. Replace with:

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

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "require('./vercel.json'); console.log('valid')"
```

Expected output: `valid`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(cron): schedule /api/autosend/cron every 5 min in vercel.json"
```

---

### Task 2: Add `registerMonitor()` to the cron route

**Files:**
- Modify: `app/api/autosend/cron/route.ts`

The `ServerMonitor` type is already imported from `@/app/api/monitor/route`. The `fmtPrice` helper already exists in the file at line 78.

- [ ] **Step 1: Add the `registerMonitor()` function**

Insert this function after the `fetchLatestPrice()` function (after line 206), before `hasRetested()`:

```typescript
// ─── Enregistrer un moniteur persistant après envoi du signal ────────────────
async function registerMonitor(
  sym: WatchedSymbol,
  cfg: AutosendConfig,
  kv: NonNullable<Awaited<ReturnType<typeof getKv>>>,
  type: "buy" | "sell",
  score: string,
  entry: number,
  tp1: number,
  tp2: number,
  tp3: number,
  sl: number,
  sigTime: number,
): Promise<void> {
  const monitors = await kv.get<ServerMonitor[]>("signal_monitors") ?? [];
  // Une seule surveillance active par paire+TF — remplace si déjà présente
  const filtered = monitors.filter(
    m => !(m.yf === sym.yf && m.tfLabel === sym.tfLabel),
  );
  const now = Date.now();
  const monitor: ServerMonitor = {
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
    lastReminderAt: now,   // premier rappel dans 15 min, pas immédiatement
    reminderCount:  0,
    token:          cfg.token,
    chatId:         cfg.chatId,
  };
  await kv.set("signal_monitors", [...filtered, monitor]);
  console.log(`[Cron] Monitor enregistré : ${monitor.id}`);
}
```

- [ ] **Step 2: Call `registerMonitor()` inside `processSymbol()` after the successful send**

Find this block in `processSymbol()` (around line 194):

```typescript
  const ok = await sendTelegram(cfg.token, cfg.chatId, text);
  if (ok && kv) {
    await kv.set(kvKey, sig.time, { ex: 60 * 60 * 24 * 7 }); // TTL 7 jours
  }
```

Replace with:

```typescript
  const ok = await sendTelegram(cfg.token, cfg.chatId, text);
  if (ok && kv) {
    await kv.set(kvKey, sig.time, { ex: 60 * 60 * 24 * 7 }); // TTL 7 jours
    await registerMonitor(sym, cfg, kv, sig.type, score, entry, tp1, tp2, tp3, sl, sig.time);
  }
```

- [ ] **Step 3: Verify TypeScript compiles without new errors**

```bash
npx tsc --noEmit 2>&1 | grep -v "fear-greed"
```

Expected: no output (the only pre-existing error is the `fear-greed` module, which is unrelated).

- [ ] **Step 4: Commit**

```bash
git add app/api/autosend/cron/route.ts
git commit -m "feat(cron): register ServerMonitor in KV after signal send — enables server-side reminders when browser is closed"
```

---

### Task 3: Push and deploy

- [ ] **Step 1: Push the branch**

```bash
git push origin feature/market-regime-detector
```

- [ ] **Step 2: Verify cron appears in Vercel dashboard**

After the deploy completes, go to **Vercel Dashboard → Project → Settings → Cron Jobs**. You should see:

```
Path:     /api/autosend/cron
Schedule: */5 * * * *
```

If it does not appear, confirm the deploy picked up `vercel.json` by checking the deployment logs.

- [ ] **Step 3: Manually trigger the cron to verify**

In Vercel Dashboard → Cron Jobs, click **Run Now** on the cron entry. Check the function logs for output like:

```
[Cron] Résultats: { ... }
[Cron/Monitors] checked=N reminders=N retests=N
```

If you see `[Cron] Monitor enregistré : EURUSD=X:15M:...` in the logs after a signal fires, the feature is working end-to-end.

---

## Self-Review

**Spec coverage:**
- ✅ `vercel.json` cron schedule → Task 1
- ✅ `registerMonitor()` function → Task 2 Step 1
- ✅ Called in `processSymbol()` after successful send → Task 2 Step 2
- ✅ `lastReminderAt = now` (first reminder in 15 min) → Task 2 Step 1
- ✅ Duplicate prevention (filter by yf+tfLabel) → Task 2 Step 1
- ✅ Deploy + verification → Task 3

**Placeholder scan:** No TBDs, no vague steps, all code shown in full.

**Type consistency:** `ServerMonitor` fields match the type defined in `app/api/monitor/route.ts` exactly (id, yf, label, tfLabel, type, entryPrice, score, fEntry, fTp1, fTp2, fTp3, fSl, sigTime, addedAt, lastReminderAt, reminderCount, token, chatId).
