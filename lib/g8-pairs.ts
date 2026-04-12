// All G8 currency pairs and Yahoo Finance symbols
export const G8_CURRENCIES = ["EUR", "GBP", "USD", "JPY", "CAD", "AUD", "NZD", "CHF"];

export interface G8Pair {
  label: string;       // e.g. EUR/USD
  yf: string;          // Yahoo Finance symbol
  base: string;
  quote: string;
  group: string;
}

// All 28 G8 combinations (non-redundant, major/cross convention)
export const G8_PAIRS: G8Pair[] = [
  // Majors USD-based
  { label: "EUR/USD", yf: "EURUSD=X", base: "EUR", quote: "USD", group: "Majors" },
  { label: "GBP/USD", yf: "GBPUSD=X", base: "GBP", quote: "USD", group: "Majors" },
  { label: "USD/JPY", yf: "JPY=X",    base: "USD", quote: "JPY", group: "Majors" },
  { label: "USD/CHF", yf: "CHF=X",    base: "USD", quote: "CHF", group: "Majors" },
  { label: "USD/CAD", yf: "CAD=X",    base: "USD", quote: "CAD", group: "Majors" },
  { label: "AUD/USD", yf: "AUDUSD=X", base: "AUD", quote: "USD", group: "Majors" },
  { label: "NZD/USD", yf: "NZDUSD=X", base: "NZD", quote: "USD", group: "Majors" },
  // EUR crosses
  { label: "EUR/GBP", yf: "EURGBP=X", base: "EUR", quote: "GBP", group: "EUR Crosses" },
  { label: "EUR/JPY", yf: "EURJPY=X", base: "EUR", quote: "JPY", group: "EUR Crosses" },
  { label: "EUR/CHF", yf: "EURCHF=X", base: "EUR", quote: "CHF", group: "EUR Crosses" },
  { label: "EUR/CAD", yf: "EURCAD=X", base: "EUR", quote: "CAD", group: "EUR Crosses" },
  { label: "EUR/AUD", yf: "EURAUD=X", base: "EUR", quote: "AUD", group: "EUR Crosses" },
  { label: "EUR/NZD", yf: "EURNZD=X", base: "EUR", quote: "NZD", group: "EUR Crosses" },
  // GBP crosses
  { label: "GBP/JPY", yf: "GBPJPY=X", base: "GBP", quote: "JPY", group: "GBP Crosses" },
  { label: "GBP/CHF", yf: "GBPCHF=X", base: "GBP", quote: "CHF", group: "GBP Crosses" },
  { label: "GBP/CAD", yf: "GBPCAD=X", base: "GBP", quote: "CAD", group: "GBP Crosses" },
  { label: "GBP/AUD", yf: "GBPAUD=X", base: "GBP", quote: "AUD", group: "GBP Crosses" },
  { label: "GBP/NZD", yf: "GBPNZD=X", base: "GBP", quote: "NZD", group: "GBP Crosses" },
  // AUD crosses
  { label: "AUD/JPY", yf: "AUDJPY=X", base: "AUD", quote: "JPY", group: "AUD/NZD Crosses" },
  { label: "AUD/CHF", yf: "AUDCHF=X", base: "AUD", quote: "CHF", group: "AUD/NZD Crosses" },
  { label: "AUD/CAD", yf: "AUDCAD=X", base: "AUD", quote: "CAD", group: "AUD/NZD Crosses" },
  { label: "AUD/NZD", yf: "AUDNZD=X", base: "AUD", quote: "NZD", group: "AUD/NZD Crosses" },
  // NZD crosses
  { label: "NZD/JPY", yf: "NZDJPY=X", base: "NZD", quote: "JPY", group: "AUD/NZD Crosses" },
  { label: "NZD/CHF", yf: "NZDCHF=X", base: "NZD", quote: "CHF", group: "AUD/NZD Crosses" },
  { label: "NZD/CAD", yf: "NZDCAD=X", base: "NZD", quote: "CAD", group: "AUD/NZD Crosses" },
  // JPY/CAD/CHF crosses
  { label: "CAD/JPY", yf: "CADJPY=X", base: "CAD", quote: "JPY", group: "Other Crosses" },
  { label: "CAD/CHF", yf: "CADCHF=X", base: "CAD", quote: "CHF", group: "Other Crosses" },
  { label: "CHF/JPY", yf: "CHFJPY=X", base: "CHF", quote: "JPY", group: "Other Crosses" },
  // Commodities
  { label: "XAU/USD", yf: "GC=F",    base: "XAU", quote: "USD", group: "Commodities" },
  { label: "XAG/USD", yf: "SI=F",    base: "XAG", quote: "USD", group: "Commodities" },
  { label: "WTI Oil",  yf: "CL=F",   base: "WTI", quote: "USD", group: "Commodities" },
  { label: "Nat. Gas", yf: "NG=F",   base: "NG",  quote: "USD", group: "Commodities" },
  { label: "Copper",   yf: "HG=F",   base: "HG",  quote: "USD", group: "Commodities" },
  // US Indices
  { label: "S&P 500",    yf: "^GSPC", base: "SPX", quote: "USD", group: "Indices US" },
  { label: "Nasdaq 100", yf: "^NDX",  base: "NDX", quote: "USD", group: "Indices US" },
  { label: "Dow Jones",  yf: "^DJI",  base: "DJI", quote: "USD", group: "Indices US" },
  { label: "Russell 2000", yf: "^RUT", base: "RUT", quote: "USD", group: "Indices US" },
  { label: "VIX",        yf: "^VIX",  base: "VIX", quote: "USD", group: "Indices US" },
];

export const G8_GROUPS = ["Majors", "EUR Crosses", "GBP Crosses", "AUD/NZD Crosses", "Other Crosses", "Commodities", "Indices US"];

// COT-tracked instruments (CFTC commodity codes)
export const COT_INSTRUMENTS = [
  { name: "EUR/USD", code: "099741", category: "Forex" },
  { name: "GBP/USD", code: "096742", category: "Forex" },
  { name: "JPY/USD", code: "097741", category: "Forex" },
  { name: "CHF/USD", code: "092741", category: "Forex" },
  { name: "CAD/USD", code: "090741", category: "Forex" },
  { name: "AUD/USD", code: "232741", category: "Forex" },
  { name: "NZD/USD", code: "112741", category: "Forex" },
  { name: "Gold", code: "088691", category: "Commodities" },
  { name: "Silver", code: "084691", category: "Commodities" },
  { name: "Crude Oil", code: "067651", category: "Commodities" },
  { name: "S&P 500", code: "13874+", category: "Indices" },
  { name: "Nasdaq 100", code: "209742", category: "Indices" },
  { name: "Bitcoin", code: "133741", category: "Crypto" },
];
