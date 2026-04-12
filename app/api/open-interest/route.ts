export const dynamic = "force-dynamic";

// Price: Yahoo Finance v8 · OI: CFTC public API (weekly)

export const INSTRUMENTS = [
  // ── Forex ──────────────────────────────────────────────────────────────────
  { name: "EUR/USD",    yf: "6E=F",  cat: "Forex",    cftcMarket: "EURO FX - CHICAGO MERCANTILE EXCHANGE" },
  { name: "GBP/USD",   yf: "6B=F",  cat: "Forex",    cftcMarket: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE" },
  { name: "JPY/USD",   yf: "6J=F",  cat: "Forex",    cftcMarket: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE" },
  { name: "AUD/USD",   yf: "6A=F",  cat: "Forex",    cftcMarket: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
  { name: "CAD/USD",   yf: "6C=F",  cat: "Forex",    cftcMarket: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
  { name: "CHF/USD",   yf: "6S=F",  cat: "Forex",    cftcMarket: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE" },
  { name: "NZD/USD",   yf: "6N=F",  cat: "Forex",    cftcMarket: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE" },
  // ── Métaux ─────────────────────────────────────────────────────────────────
  { name: "Gold",      yf: "GC=F",  cat: "Métaux",   cftcMarket: "GOLD - COMMODITY EXCHANGE INC." },
  { name: "Silver",    yf: "SI=F",  cat: "Métaux",   cftcMarket: "SILVER - COMMODITY EXCHANGE INC." },
  { name: "Copper",    yf: "HG=F",  cat: "Métaux",   cftcMarket: "COPPER- #1 - COMMODITY EXCHANGE INC." },
  { name: "Platinum",  yf: "PL=F",  cat: "Métaux",   cftcMarket: "PLATINUM - NEW YORK MERCANTILE EXCHANGE" },
  // ── Énergie ────────────────────────────────────────────────────────────────
  { name: "Crude Oil", yf: "CL=F",  cat: "Énergie",  cftcMarket: "CRUDE OIL, LIGHT SWEET-WTI - ICE FUTURES EUROPE" },
  { name: "Nat. Gas",  yf: "NG=F",  cat: "Énergie",  cftcMarket: null },
  // ── Agricole ───────────────────────────────────────────────────────────────
  { name: "Wheat",     yf: "ZW=F",  cat: "Agricole", cftcMarket: "WHEAT-HRW - CHICAGO BOARD OF TRADE" },
  { name: "Corn",      yf: "ZC=F",  cat: "Agricole", cftcMarket: "CORN - CHICAGO BOARD OF TRADE" },
  { name: "Soybeans",  yf: "ZS=F",  cat: "Agricole", cftcMarket: "SOYBEANS - CHICAGO BOARD OF TRADE" },
  { name: "Coffee",    yf: "KC=F",  cat: "Agricole", cftcMarket: "COFFEE C - ICE FUTURES U.S." },
  { name: "Sugar",     yf: "SB=F",  cat: "Agricole", cftcMarket: "SUGAR NO. 11 - ICE FUTURES U.S." },
  // ── Indices ────────────────────────────────────────────────────────────────
  { name: "S&P 500",    yf: "ES=F",  cat: "Indices",  cftcMarket: "MICRO E-MINI S&P 500 INDEX - CHICAGO MERCANTILE EXCHANGE" },
  { name: "Nasdaq 100", yf: "NQ=F",  cat: "Indices",  cftcMarket: "MICRO E-MINI NASDAQ-100 INDEX - CHICAGO MERCANTILE EXCHANGE" },
  // ── Crypto ─────────────────────────────────────────────────────────────────
  { name: "Bitcoin",   yf: "BTC=F", cat: "Crypto",   cftcMarket: "BITCOIN - CHICAGO MERCANTILE EXCHANGE" },
];

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchPrice(yf: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yf)}?interval=1d&range=2d`;
    const res = await fetch(url, { headers: YF_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price     = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    return { price, prevClose };
  } catch { return null; }
}

async function fetchCFTCOpenInterest(market: string): Promise<number | null> {
  try {
    const url = [
      "https://publicreporting.cftc.gov/resource/jun7-fc8e.json",
      `?market_and_exchange_names=${encodeURIComponent(market)}`,
      "&$order=report_date_as_yyyy_mm_dd DESC",
      "&$select=open_interest_all,report_date_as_yyyy_mm_dd",
      "&$limit=1",
    ].join("");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows[0]) return null;
    return parseInt(rows[0].open_interest_all ?? "0") || null;
  } catch { return null; }
}

export async function GET() {
  const [priceResults, oiResults] = await Promise.all([
    Promise.allSettled(INSTRUMENTS.map(i => fetchPrice(i.yf))),
    Promise.allSettled(INSTRUMENTS.map(i => i.cftcMarket ? fetchCFTCOpenInterest(i.cftcMarket) : Promise.resolve(null))),
  ]);

  const items = INSTRUMENTS.map((inst, i) => {
    const pr = priceResults[i];
    const or = oiResults[i];
    const { price, prevClose } = (pr.status === "fulfilled" && pr.value) ? pr.value : { price: 0, prevClose: 0 };
    const openInterest = or.status === "fulfilled" ? or.value : null;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    return { name: inst.name, cat: inst.cat, yf: inst.yf, price, changePct, openInterest };
  });

  return Response.json(items);
}
