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

function getClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;

  if (!globalThis.__redis) {
    globalThis.__redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest:  3,
      connectTimeout:        8000,
      commandTimeout:        8000,
      lazyConnect:           false,
      // Désactiver TLS auto-detect si l'URL commence par rediss://
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });

    globalThis.__redis.on("error", (err: Error) => {
      console.error("[Redis] Erreur connexion:", err.message);
    });
  }

  return globalThis.__redis;
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
    }
  },
};

/** Vrai si REDIS_URL est configuré */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}
