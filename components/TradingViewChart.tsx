// components/TradingViewChart.tsx
"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

export interface TvSymbol { label: string; tv: string; yf: string; cat: string; }

export const TV_SYMBOLS: TvSymbol[] = [
  // ── Forex Majeurs ──────────────────────────────────────────────────────────
  { label:"EUR/USD",  tv:"FX:EURUSD",        yf:"EURUSD=X",  cat:"Majeurs"  },
  { label:"GBP/USD",  tv:"FX:GBPUSD",        yf:"GBPUSD=X",  cat:"Majeurs"  },
  { label:"USD/JPY",  tv:"FX:USDJPY",        yf:"JPY=X",     cat:"Majeurs"  },
  { label:"USD/CHF",  tv:"FX:USDCHF",        yf:"CHF=X",     cat:"Majeurs"  },
  { label:"USD/CAD",  tv:"FX:USDCAD",        yf:"CAD=X",     cat:"Majeurs"  },
  { label:"AUD/USD",  tv:"FX:AUDUSD",        yf:"AUDUSD=X",  cat:"Majeurs"  },
  { label:"NZD/USD",  tv:"FX:NZDUSD",        yf:"NZDUSD=X",  cat:"Majeurs"  },
  // ── Croisées EUR ───────────────────────────────────────────────────────────
  { label:"EUR/GBP",  tv:"FX:EURGBP",        yf:"EURGBP=X",  cat:"EUR"      },
  { label:"EUR/JPY",  tv:"FX:EURJPY",        yf:"EURJPY=X",  cat:"EUR"      },
  { label:"EUR/AUD",  tv:"FX:EURAUD",        yf:"EURAUD=X",  cat:"EUR"      },
  { label:"EUR/CAD",  tv:"FX:EURCAD",        yf:"EURCAD=X",  cat:"EUR"      },
  { label:"EUR/CHF",  tv:"FX:EURCHF",        yf:"EURCHF=X",  cat:"EUR"      },
  { label:"EUR/NZD",  tv:"FX:EURNZD",        yf:"EURNZD=X",  cat:"EUR"      },
  // ── Croisées GBP ───────────────────────────────────────────────────────────
  { label:"GBP/JPY",  tv:"FX:GBPJPY",        yf:"GBPJPY=X",  cat:"GBP"      },
  { label:"GBP/AUD",  tv:"FX:GBPAUD",        yf:"GBPAUD=X",  cat:"GBP"      },
  { label:"GBP/CAD",  tv:"FX:GBPCAD",        yf:"GBPCAD=X",  cat:"GBP"      },
  { label:"GBP/CHF",  tv:"FX:GBPCHF",        yf:"GBPCHF=X",  cat:"GBP"      },
  { label:"GBP/NZD",  tv:"FX:GBPNZD",        yf:"GBPNZD=X",  cat:"GBP"      },
  // ── Croisées AUD ───────────────────────────────────────────────────────────
  { label:"AUD/JPY",  tv:"FX:AUDJPY",        yf:"AUDJPY=X",  cat:"AUD"      },
  { label:"AUD/CAD",  tv:"FX:AUDCAD",        yf:"AUDCAD=X",  cat:"AUD"      },
  { label:"AUD/CHF",  tv:"FX:AUDCHF",        yf:"AUDCHF=X",  cat:"AUD"      },
  { label:"AUD/NZD",  tv:"FX:AUDNZD",        yf:"AUDNZD=X",  cat:"AUD"      },
  // ── Croisées NZD / CAD / CHF ───────────────────────────────────────────────
  { label:"NZD/JPY",  tv:"FX:NZDJPY",        yf:"NZDJPY=X",  cat:"Autres FX"},
  { label:"NZD/CAD",  tv:"FX:NZDCAD",        yf:"NZDCAD=X",  cat:"Autres FX"},
  { label:"NZD/CHF",  tv:"FX:NZDCHF",        yf:"NZDCHF=X",  cat:"Autres FX"},
  { label:"CAD/JPY",  tv:"FX:CADJPY",        yf:"CADJPY=X",  cat:"Autres FX"},
  { label:"CAD/CHF",  tv:"FX:CADCHF",        yf:"CADCHF=X",  cat:"Autres FX"},
  { label:"CHF/JPY",  tv:"FX:CHFJPY",        yf:"CHFJPY=X",  cat:"Autres FX"},
  // ── Métaux & Matières premières ────────────────────────────────────────────
  { label:"XAU/USD",  tv:"OANDA:XAUUSD",     yf:"GC=F",      cat:"Matières" },
  { label:"XAG/USD",  tv:"OANDA:XAGUSD",     yf:"SI=F",      cat:"Matières" },
  { label:"WTI",      tv:"NYMEX:CL1!",       yf:"CL=F",      cat:"Matières" },
  { label:"Brent",    tv:"NYMEX:BB1!",       yf:"BZ=F",      cat:"Matières" },
  { label:"Gaz Nat.", tv:"NYMEX:NG1!",       yf:"NG=F",      cat:"Matières" },
  { label:"Cuivre",   tv:"COMEX:HG1!",       yf:"HG=F",      cat:"Matières" },
  { label:"Platine",  tv:"NYMEX:PL1!",       yf:"PL=F",      cat:"Matières" },
  // ── Indices ────────────────────────────────────────────────────────────────
  { label:"S&P 500",  tv:"FOREXCOM:SPXUSD",  yf:"^GSPC",     cat:"Indices"  },
  { label:"Nasdaq",   tv:"FOREXCOM:NSXUSD",  yf:"^NDX",      cat:"Indices"  },
  { label:"Dow Jones",tv:"FOREXCOM:DJI",     yf:"^DJI",      cat:"Indices"  },
  { label:"DAX",      tv:"XETR:DAX",         yf:"^GDAXI",    cat:"Indices"  },
  { label:"FTSE 100", tv:"SPREADEX:FTSE",    yf:"^FTSE",     cat:"Indices"  },
  { label:"Nikkei",   tv:"TVC:NI225",        yf:"^N225",     cat:"Indices"  },
  { label:"CAC 40",   tv:"EURONEXT:PX1",     yf:"^FCHI",     cat:"Indices"  },
  { label:"Russell",  tv:"TVC:RUT",          yf:"^RUT",      cat:"Indices"  },
  // ── Crypto ─────────────────────────────────────────────────────────────────
  { label:"BTC/USD",  tv:"BITSTAMP:BTCUSD",  yf:"BTC-USD",   cat:"Crypto"   },
  { label:"ETH/USD",  tv:"BITSTAMP:ETHUSD",  yf:"ETH-USD",   cat:"Crypto"   },
  { label:"SOL/USD",  tv:"COINBASE:SOLUSD",  yf:"SOL-USD",   cat:"Crypto"   },
  { label:"XRP/USD",  tv:"BITSTAMP:XRPUSD",  yf:"XRP-USD",   cat:"Crypto"   },
  { label:"BNB/USD",  tv:"BINANCE:BNBUSDT",  yf:"BNB-USD",   cat:"Crypto"   },
  { label:"ADA/USD",  tv:"COINBASE:ADAUSD",  yf:"ADA-USD",   cat:"Crypto"   },
  { label:"DOGE/USD", tv:"BINANCE:DOGEUSDT", yf:"DOGE-USD",  cat:"Crypto"   },
];

// TF correspondance : notre label → code TradingView
export const TV_TF: Record<string, string> = {
  "1M": "1", "5M": "5", "15M": "15", "30M": "30",
  "1H": "60", "4H": "240", "D": "D", "W": "W", "M": "M",
};

// Singleton loader — charge tv.js une seule fois
let scriptLoaded  = false;
let scriptLoading = false;
const queue: (() => void)[] = [];
function loadTVScript(cb: () => void) {
  if (scriptLoaded) { cb(); return; }
  queue.push(cb);
  if (scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/tv.js";
  s.async = true;
  s.onload = () => { scriptLoaded = true; queue.forEach(fn => fn()); queue.length = 0; };
  document.head.appendChild(s);
}

let _uid = 0;

interface Props {
  tvSymbol:  string;
  interval?: string;   // TV interval code: "1","5","15","30","60","D","W","M"
  height?:   number;
}

export default function TradingViewChart({ tvSymbol, interval = "D", height = 520 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useRef(`tv_chart_${++_uid}`);

  useEffect(() => {
    if (!ref.current) return;
    const id = uid.current;
    ref.current.id = id;

    loadTVScript(() => {
      if (!window.TradingView || !ref.current) return;
      ref.current.innerHTML = "";
      ref.current.id = id;
      new window.TradingView.widget({
        container_id:      id,
        autosize:          true,
        symbol:            tvSymbol,
        interval,
        timezone:          "Europe/Paris",
        theme:             "dark",
        style:             "1",
        locale:            "fr",
        toolbar_bg:        "#10101e",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        save_image:        false,
        hide_top_toolbar:  false,
        studies:           [],
        backgroundColor:   "#060610",
        gridColor:         "#1c1c38",
        withdateranges:    true,
      });
    });

    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [tvSymbol, interval]);

  return (
    <div ref={ref} style={{ width: "100%", height, background: "#060610", borderRadius: 8, overflow: "hidden" }} />
  );
}
