export const dynamic = "force-dynamic";

interface Article {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  summary?: string;
}

async function parseRSS(url: string, source: string, category: string, limit = 6): Promise<Article[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSS reader)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const text = await res.text();
    const items: Article[] = [];

    for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const xml = match[1];
      const title = xml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1]?.trim() ?? "";
      const link = xml.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
        ?? xml.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/)?.[1]?.trim()
        ?? xml.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ?? "#";
      const pubDate = xml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
      const desc = xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]
        ?.replace(/<[^>]+>/g, "").trim().slice(0, 180) ?? "";
      if (title) items.push({ title, link, pubDate, source, category, summary: desc });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const feeds = await Promise.allSettled([
      parseRSS("https://www.fxstreet.com/rss/news", "FXStreet", "Forex", 20),
      parseRSS("https://www.forexlive.com/feed/news", "ForexLive", "Forex", 20),
      parseRSS("https://investinglive.com/feed/", "InvestingLive", "Markets", 20),
    ]);

    const allItems: Article[] = [];
    for (const result of feeds) {
      if (result.status === "fulfilled") allItems.push(...result.value);
    }

    allItems.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    return Response.json(allItems);
  } catch {
    return Response.json([]);
  }
}
