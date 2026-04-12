// app/api/tv-price/route.ts
// Proxy vers l'API Scanner de TradingView pour des prix en temps réel.
// Usage : GET /api/tv-price?symbol=FX:EURUSD
// Retourne : { symbol, price, change, changeAbs, high, low, open, volume, updateMode }
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

// ─── Mapping préfixe exchange → scanner TradingView ──────────────────────────
function getScannerUrl(tvSymbol: string): string {
  const exchange = tvSymbol.split(":")[0]?.toUpperCase() ?? "";
  const map: Record<string, string> = {
    FX:       "forex",
    OANDA:    "forex",
    FOREXCOM: "forex",
    TVC:      "forex",
    FXCM:     "forex",
    NYMEX:    "futures",
    COMEX:    "futures",
    CBOT:     "futures",
    CME:      "futures",
    BINANCE:  "crypto",
    COINBASE: "crypto",
    BYBIT:    "crypto",
    NASDAQ:   "america",
    NYSE:     "america",
    AMEX:     "america",
  };
  const cat = map[exchange] ?? "forex";
  return `https://scanner.tradingview.com/${cat}/scan`;
}

export interface TvPriceResult {
  symbol:     string;
  price:      number;
  open:       number;
  high:       number;
  low:        number;
  change:     number;   // % variation
  changeAbs:  number;   // variation absolue
  volume:     number;
  updateMode: string;   // "realtime" | "delayed_streaming_900" | "endofday"
  ts:         number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return Response.json({ error: "Paramètre symbol manquant (ex: FX:EURUSD)" }, { status: 400 });
  }

  const scannerUrl = getScannerUrl(symbol);

  try {
    const res = await fetch(scannerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Origin:  "https://www.tradingview.com",
        Referer: "https://www.tradingview.com/",
      },
      body: JSON.stringify({
        symbols: { tickers: [symbol] },
        columns: ["close", "open", "high", "low", "change", "change_abs", "volume", "update_mode"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `TradingView scanner error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json() as {
      data?: Array<{ s: string; d: (number | string | null)[] }>;
    };

    const row = json?.data?.[0];
    if (!row || !row.d || row.d.length < 7) {
      return Response.json({ error: "Aucune donnée reçue de TradingView" }, { status: 404 });
    }

    const [close, open, high, low, change, changeAbs, volume, updateMode] = row.d;

    const result: TvPriceResult = {
      symbol,
      price:      typeof close     === "number" ? close     : 0,
      open:       typeof open      === "number" ? open      : 0,
      high:       typeof high      === "number" ? high      : 0,
      low:        typeof low       === "number" ? low       : 0,
      change:     typeof change    === "number" ? change    : 0,
      changeAbs:  typeof changeAbs === "number" ? changeAbs : 0,
      volume:     typeof volume    === "number" ? volume    : 0,
      updateMode: typeof updateMode === "string" ? updateMode : "unknown",
      ts: Date.now(),
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
