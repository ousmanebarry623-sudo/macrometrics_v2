export const dynamic = "force-dynamic";
import { G8_PAIRS } from "@/lib/g8-pairs";

async function fetchQuote(yfSymbol: string) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Referer": "https://finance.yahoo.com/",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  return {
    price: meta.regularMarketPrice ?? 0,
    prevClose: meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice ?? 0,
    open: meta.regularMarketOpen ?? 0,
    high: meta.regularMarketDayHigh ?? 0,
    low: meta.regularMarketDayLow ?? 0,
    openInterest: meta.openInterest ?? null,
  };
}

export async function GET() {
  const results = await Promise.allSettled(G8_PAIRS.map((p) => fetchQuote(p.yf)));

  const items = G8_PAIRS.map((p, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      const { price, prevClose, open, high, low, openInterest } = r.value;
      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
      return { label: p.label, yf: p.yf, group: p.group, price, change, changePct, open, high, low, openInterest };
    }
    return { label: p.label, yf: p.yf, group: p.group, price: 0, change: 0, changePct: 0, open: 0, high: 0, low: 0, openInterest: null };
  });

  return Response.json(items);
}
