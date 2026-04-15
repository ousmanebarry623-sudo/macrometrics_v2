export const dynamic = "force-dynamic";

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  summary?: string;
}

// ─── Headers imitant un vrai navigateur ──────────────────────────────────────
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
  "Cache-Control":   "no-cache",
  Pragma:            "no-cache",
};

async function parseRSS(url: string, source: string, category: string, limit = 8): Promise<Article[]> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      cache:   "no-store",
      signal:  AbortSignal.timeout(8000), // timeout 8s par source
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

    // Atom <entry> (Google News, etc.)
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
    // Sources fiables depuis les IPs Vercel
    // FXStreet direct bloqué → proxy Google News | Reuters déprécié → Google News Markets
    const feeds = await Promise.allSettled([
      // ── ForexLive — fiable depuis Vercel ─────────────────────────────────
      parseRSS(
        "https://www.forexlive.com/feed/news",
        "ForexLive", "Forex", 12
      ),
      // ── FXStreet — direct bloqué, proxy Google News ───────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=fxstreet+forex+currency+analysis&hl=en&gl=US&ceid=US:en",
        "FXStreet", "Forex", 10
      ),
      // ── InvestingLive — essai direct Investing.com ────────────────────────
      parseRSS(
        "https://www.investing.com/rss/news_285.rss",
        "InvestingLive", "Forex", 10
      ),
      // ── InvestingLive fallback — Google News si investing.com bloqué ──────
      parseRSS(
        "https://news.google.com/rss/search?q=investing+forex+currency+economic+analysis&hl=en&gl=US&ceid=US:en",
        "InvestingLive", "Forex", 10
      ),
      // ── Markets — Google News macro/banques centrales ─────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=forex+market+economy+Fed+ECB+interest+rates+inflation&hl=en&gl=US&ceid=US:en",
        "Google News", "Markets", 12
      ),
      // ── Markets fallback — actualités macro supplémentaires ───────────────
      parseRSS(
        "https://news.google.com/rss/search?q=central+bank+monetary+policy+dollar+euro+yen&hl=en&gl=US&ceid=US:en",
        "Google News", "Markets", 8
      ),
      // ── Forex général ─────────────────────────────────────────────────────
      parseRSS(
        "https://news.google.com/rss/search?q=EUR+USD+GBP+JPY+forex+currency+trading&hl=en&gl=US&ceid=US:en",
        "Google News", "Forex", 10
      ),
    ]);

    const allItems: Article[] = [];
    const seen = new Set<string>();

    for (const result of feeds) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        // Dédoublonner par titre normalisé
        const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        allItems.push(item);
      }
    }

    // Trier par date décroissante
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
