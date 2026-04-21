export const dynamic = "force-dynamic";

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  summary?: string;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
  "Cache-Control":   "no-cache",
  Pragma:            "no-cache",
};

// ─── FILTRE CRITIQUE : rejette tout article > MAX_AGE_DAYS ───────────────────
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS   = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function isRecent(pubDate: string): boolean {
  if (!pubDate) return false;
  const dt = new Date(pubDate).getTime();
  if (isNaN(dt)) return false;
  return Date.now() - dt <= MAX_AGE_MS;
}

async function parseRSS(url: string, source: string, category: string, limit = 8): Promise<Article[]> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      cache:   "no-store",
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes("<item>") && !text.includes("<entry>")) return [];

    const items: Article[] = [];

    // RSS standard <item>
    for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const xml = match[1];
      const title = xml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim() ?? "";
      const link =
        xml.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
        ?? xml.match(/<link[^>]+href="([^"]+)"/)?.[1]?.trim()
        ?? xml.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/)?.[1]?.trim()
        ?? xml.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim()
        ?? "#";
      const pubDate = xml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
      const desc = xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]
        ?.replace(/<[^>]+>/g, "").trim().slice(0, 200) ?? "";
      if (title && title.length > 3) {
        items.push({ title, link, pubDate, source, category, summary: desc });
      }
      if (items.length >= limit) break;
    }

    // Atom <entry> (Google News)
    if (items.length === 0) {
      for (const match of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const xml = match[1];
        const title = xml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim() ?? "";
        const link  = xml.match(/<link[^>]+href="([^"]+)"/)?.[1]?.trim()
          ?? xml.match(/<id>([^<]+)<\/id>/)?.[1]?.trim() ?? "#";
        const pubDate = xml.match(/<published>(.*?)<\/published>/)?.[1]?.trim()
          ?? xml.match(/<updated>(.*?)<\/updated>/)?.[1]?.trim() ?? "";
        const desc = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]
          ?.replace(/<[^>]+>/g, "").trim().slice(0, 200) ?? "";
        if (title && title.length > 3) {
          items.push({ title, link, pubDate, source, category, summary: desc });
        }
        if (items.length >= limit) break;
      }
    }

    return items;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const feeds = await Promise.allSettled([
      // ── ForexLive — fiable, toujours récent ───────────────────────────────
      parseRSS(
        "https://www.forexlive.com/feed/news",
        "ForexLive", "Forex", 15
      ),
      // ── Reuters Business News ─────────────────────────────────────────────
      parseRSS(
        "https://feeds.reuters.com/reuters/businessNews",
        "Reuters", "Markets", 10
      ),
      // ── Reuters via Google News (fallback) ───────────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=reuters+forex+central+bank+interest+rate+dollar&ceid=US:en&when=3d",
        "Reuters", "Markets", 8
      ),
      // ── Fed / BCE / BoJ — Google News (3j) ───────────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=Fed+ECB+BoJ+central+bank+interest+rates+forex&ceid=US:en&when=3d",
        "Google News", "Markets", 12
      ),
      // ── Dollar / Euro / Gold — Google News (3j) ──────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=dollar+euro+yen+gold+XAU+monetary+policy+inflation&ceid=US:en&when=3d",
        "Google News", "Markets", 10
      ),
      // ── Forex paires majeures — Google News (3j) ─────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=EUR+USD+GBP+JPY+forex+currency+trading+analysis&ceid=US:en&when=3d",
        "Google News", "Forex", 10
      ),
      // ── FXStreet via Google News ──────────────────────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=site:fxstreet.com+forex+analysis&ceid=US:en&when=3d",
        "FXStreet", "Forex", 10
      ),
    ]);

    const allItems: Article[] = [];
    const seen = new Set<string>();

    for (const result of feeds) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        // ── FILTRE SERVEUR : rejeter tout article > 7 jours ──────────────────
        if (!isRecent(item.pubDate)) continue;

        const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        allItems.push(item);
      }
    }

    allItems.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    return Response.json(allItems.slice(0, 60));
  } catch {
    return Response.json([]);
  }
}
