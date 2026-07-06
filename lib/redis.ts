// lib/redis.ts
// Wrapper Redis compatible avec l'API @vercel/kv (get/set/del + TTL).
// Utilise ioredis avec REDIS_URL — fonctionne avec Vercel Redis (Upstash TCP).
import Redis from "ioredis";

// ─── Singleton serverless ─────────────────────────────────────────────────────
// Vercel garde les fonctions "warm" entre les requêtes — on réutilise la connexion.
declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createClient(): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    // Échec rapide : une commande qui traîne > 3s est abandonnée au lieu de
    // bloquer la lambda 8s (les timeouts "Command timed out" venaient de là).
    maxRetriesPerRequest:  1,
    connectTimeout:        5000,
    commandTimeout:        3000,
    keepAlive:             5000,
    lazyConnect:           false,
    enableAutoPipelining:  true,
    // Reconnexion si la socket a été gelée/coupée entre deux invocations.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    reconnectOnError: (err) => {
      // Upstash coupe les connexions inactives ; on force la reco sur READONLY/ECONNRESET.
      return /READONLY|ECONNRESET|EPIPE/.test(err.message);
    },
    tls: process.env.REDIS_URL!.startsWith("rediss://") ? {} : undefined,
  });

  client.on("error", (err: Error) => {
    console.error("[Redis] Erreur connexion:", err.message);
  });

  return client;
}

function getClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!globalThis.__redis || globalThis.__redis.status === "end") {
    globalThis.__redis = createClient();
  }
  return globalThis.__redis;
}

/** Sur timeout de commande, la connexion est probablement morte (socket gelée
 *  par le runtime serverless) : on la détruit pour forcer une reco propre. */
function handleCommandError(err: unknown): void {
  if (err instanceof Error && /timed out/i.test(err.message) && globalThis.__redis) {
    globalThis.__redis.disconnect();
    globalThis.__redis = undefined;
  }
}

// ─── Interface compatible @vercel/kv ─────────────────────────────────────────
export const kv = {
  /** Lire une valeur (JSON désérialisé) */
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getClient();
      if (!client) return null;
      const val = await client.get(key);
      if (val === null || val === undefined) return null;
      return JSON.parse(val) as T;
    } catch (err) {
      console.error(`[Redis] get(${key}):`, err);
      handleCommandError(err);
      return null;
    }
  },

  /** Écrire une valeur (JSON sérialisé), avec TTL optionnel en secondes */
  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    try {
      const client = getClient();
      if (!client) return;
      const str = JSON.stringify(value);
      if (opts?.ex) {
        await client.set(key, str, "EX", opts.ex);
      } else {
        await client.set(key, str);
      }
    } catch (err) {
      console.error(`[Redis] set(${key}):`, err);
      handleCommandError(err);
    }
  },

  /** Supprimer une clé */
  async del(key: string): Promise<void> {
    try {
      const client = getClient();
      if (!client) return;
      await client.del(key);
    } catch (err) {
      console.error(`[Redis] del(${key}):`, err);
      handleCommandError(err);
    }
  },
};

/** Vrai si REDIS_URL est configuré */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}
