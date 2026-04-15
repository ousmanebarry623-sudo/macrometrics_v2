"use client";
import { useEffect, useState, useCallback } from "react";
import type { PairSignal } from "@/app/api/signal-analysis/route";
import InfoTooltip from "@/components/InfoTooltip";
import { useBreakpoint } from "@/lib/use-breakpoint";

interface NewsArticle {
  title:   string;
  link:    string;
  pubDate: string;
  source:  string;
  summary?: string;
}

const CURRENCY_KEYWORDS: Record<string, string[]> = {
  EUR: ["EUR","Euro","European","ECB","eurozone","Lagarde"],
  USD: ["USD","Dollar","Fed","Federal Reserve","FOMC","Powell"],
  GBP: ["GBP","Pound","Sterling","BOE","Bank of England","Bailey"],
  JPY: ["JPY","Yen","BOJ","Bank of Japan","Ueda"],
  CAD: ["CAD","Canadian","BOC","Bank of Canada","Macklem"],
  AUD: ["AUD","Australian","RBA","Bullock"],
  NZD: ["NZD","Kiwi","RBNZ","Orr"],
  CHF: ["CHF","Swiss","SNB","franc"],
  XAU: ["Gold","XAU","bullion"],
  XAG: ["Silver","XAG"],
  WTI: ["Oil","WTI","Crude","Petroleum","OPEC"],
  XCU: ["Copper","XCU"],
  MXN: ["MXN","Peso","Mexico","Banxico"],
};

function getPairKeywords(base: string, quote: string): string[] {
  return [...(CURRENCY_KEYWORDS[base] ?? [base]), ...(CURRENCY_KEYWORDS[quote] ?? [quote])];
}

function articleMatchesPair(article: NewsArticle, keywords: string[]): boolean {
  const text = `${article.title} ${article.summary ?? ""}`.toLowerCase();
  return keywords.some(k => text.includes(k.toLowerCase()));
}

function timeAgo(pubDate: string): string {
  if (!pubDate) return "";
  const diff = Date.now() - new Date(pubDate).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

// ── Seasonality — 100% depuis Google Sheets via /api/seasonality-range ────────
// Plage Google Sheet : 2015 → 2025 uniquement
type SeasonPeriod = "5y" | "10y" | "tout";

const SHEET_FROM = 2015;
const SHEET_TO   = 2025; // dernière année avec données complètes

const PRESET_RANGES: Record<SeasonPeriod, [number, number]> = {
  "5y":   [2020, SHEET_TO],
  "10y":  [SHEET_FROM, SHEET_TO],
  "tout": [SHEET_FROM, SHEET_TO],
};

const SEASON_LABELS: Record<SeasonPeriod, string> = {
  "5y":   `5 ans (2020–${SHEET_TO})`,
  "10y":  `10 ans (2015–${SHEET_TO})`,
  "tout": `Tout (2015–${SHEET_TO})`,
};

const SEASON_PRESETS = [
  { label: "1 an",   from: 2024,       to: SHEET_TO },
  { label: "3 ans",  from: 2022,       to: SHEET_TO },
  { label: "5 ans",  from: 2020,       to: SHEET_TO },
  { label: "10 ans", from: SHEET_FROM, to: SHEET_TO },
  { label: "Tout",   from: SHEET_FROM, to: SHEET_TO },
];

const MONTH_NAMES_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

// Lit depuis les données Google Sheets (state seasonData)
function getSeasonality(pair: string, seasonData: Record<string, number[]> | null) {
  const trend    = seasonData?.[pair] ?? new Array(12).fill(0);
  const monthIdx = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })).getMonth();
  const score    = trend[monthIdx] ?? 0;
  const bias     = score > 0 ? "Bullish" : score < 0 ? "Bearish" : "Neutral";
  return { bias: bias as "Bullish"|"Bearish"|"Neutral", score, month: MONTH_NAMES_FR[monthIdx], trend, monthIdx };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SIGNAL_CFG = {
  BUY:     { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",  arrow: "↑" },
  SELL:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  arrow: "↓" },
  NEUTRAL: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", arrow: "—" },
};

const BIAS_CFG = {
  Bullish: { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   dot: "#22c55e" },
  Bearish: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",   dot: "#ef4444" },
  Neutral: { color: "#64748b", bg: "rgba(100,116,139,0.1)", dot: "#64748b" },
};

const BADGE_COLORS: Record<string, string> = {
  EUR:"#3b82f6", GBP:"#f97316", USD:"#22c55e", JPY:"#ef4444",
  CAD:"#ef4444", AUD:"#f59e0b", NZD:"#10b981", CHF:"#6366f1",
  MXN:"#84cc16",
  XAU:"#d4af37", XAG:"#94a3b8", WTI:"#78716c", XNG:"#06b6d4", XCU:"#c2410c",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function BiasBadge({ bias, small }: { bias: "Bullish"|"Bearish"|"Neutral"; small?: boolean }) {
  const cfg = BIAS_CFG[bias];
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontSize: small ? 10 : 11, fontWeight:700,
      padding: small ? "1px 6px" : "2px 8px", borderRadius:999,
      color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.color}30`,
      whiteSpace:"nowrap",
    }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:cfg.dot, display:"inline-block", flexShrink:0 }} />
      {bias}
    </span>
  );
}

function SentimentBar({ longPct }: { longPct: number }) {
  return (
    <div style={{ display:"flex", height:6, borderRadius:999, overflow:"hidden", width:80, gap:1 }}>
      <div style={{ flex: longPct, background:"#22c55e", borderRadius:"999px 0 0 999px" }} />
      <div style={{ flex: 100 - longPct, background:"#ef4444", borderRadius:"0 999px 999px 0" }} />
    </div>
  );
}

function SeasonBar({ trend, current }: { trend: number[]; current: number }) {
  const MONTHS = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  return (
    <div style={{ display:"flex", gap:2, alignItems:"flex-end" }}>
      {trend.map((v, i) => (
        <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
          <div style={{
            width:7, height: v !== 0 ? 10 : 6,
            borderRadius:2,
            background: i === current
              ? (v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "#64748b")
              : (v > 0 ? "#22c55e40" : v < 0 ? "#ef444440" : "#1c1c38"),
            border: i === current ? `1px solid ${v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "#64748b"}` : "none",
          }} />
          {i === current && (
            <span style={{ fontSize:6, color:"#94a3b8", lineHeight:1 }}>{MONTHS[i]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function CurrencyBadge({ cur }: { cur: string }) {
  return (
    <span style={{
      display:"inline-block", fontSize:9, fontWeight:800, padding:"2px 5px",
      borderRadius:4, background: (BADGE_COLORS[cur]||"#475569")+"25",
      color: BADGE_COLORS[cur]||"#94a3b8", border:`1px solid ${(BADGE_COLORS[cur]||"#475569")}40`,
      fontFamily:"JetBrains Mono, monospace",
    }}>{cur}</span>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ p, onClose, seasonData, seasonLabel, news }: { p: PairSignal; onClose: () => void; seasonData: Record<string, number[]> | null; seasonLabel: string; news: NewsArticle[] }) {
  const sig = SIGNAL_CFG[p.signal];
  const { isMobile } = useBreakpoint();
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.7)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding: isMobile ? "16px" : 0,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:14,
        width: isMobile ? "100%" : 660, maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 24px 80px rgba(0,0,0,0.8)",
      }} suppressHydrationWarning>
        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #1c1c38", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", gap:4 }}>
              <CurrencyBadge cur={p.base} /><CurrencyBadge cur={p.quote} />
            </div>
            <span style={{ fontSize:18, fontWeight:800, color:"#f1f5f9" }}>{p.pair}</span>
            <span style={{ fontSize:13, fontWeight:700, color:sig.color, background:sig.bg, border:`1px solid ${sig.border}`, padding:"3px 10px", borderRadius:6, display:"flex", alignItems:"center", gap:5 }}>
              {p.signal} {sig.arrow}
            </span>
            <span style={{ fontSize:12, fontWeight:700, color:"#f0c84a" }}>{p.confidence}%</span>
            <span style={{ fontSize:10, color:"#475569", background:"#10101e", padding:"2px 7px", borderRadius:5, border:"1px solid #1c1c38" }}>{p.confLevel} · 3W</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:10, color:"#334155" }}>Qualité <span style={{ color:"#f0c84a", fontWeight:700 }}>{p.quality}</span></span>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
          {/* LEFT: Signal Details */}
          <div style={{ padding:"16px 20px", borderRight:"1px solid #1c1c38" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>Signal Details</div>

            {/* Institutional */}
            <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em" }}>Institutionnel</span>
                <BiasBadge bias={p.institutional.bias} small />
              </div>
              {[
                { label:"Base", cur:p.base, d:p.institutional.base },
                { label:"Quote", cur:p.quote, d:p.institutional.quote },
              ].map(({ label, cur, d }) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:11, color:"#64748b" }}>{label}:</span>
                    <CurrencyBadge cur={cur} />
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <BiasBadge bias={d.bias} small />
                    <span style={{ fontFamily:"JetBrains Mono, monospace", fontSize:11, color:"#94a3b8" }}>{d.strengthPct}%</span>
                  </div>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, paddingTop:6, borderTop:"1px solid #1c1c38" }}>
                <span style={{ fontSize:11, color:"#64748b" }}>Force combinée:</span>
                <span style={{ fontFamily:"JetBrains Mono, monospace", fontSize:11, fontWeight:700, color:"#f0c84a" }}>{p.institutional.strengthPct}%</span>
              </div>
            </div>

            {/* Fundamental */}
            <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em" }}>Fondamental</span>
                <BiasBadge bias={p.fundamental.bias} small />
              </div>
              {[
                { label:`Score ${p.base}`, val:p.fundamental.baseScore },
                { label:`Score ${p.quote}`, val:p.fundamental.quoteScore },
                { label:"Score Net", val:p.fundamental.netScore, highlight:true },
              ].map(({ label, val, highlight }) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:11, color: highlight?"#94a3b8":"#64748b" }}>{label}:</span>
                  <span style={{
                    fontFamily:"JetBrains Mono, monospace", fontSize:11, fontWeight: highlight?700:400,
                    color: val > 0 ? "#22c55e" : val < 0 ? "#ef4444" : "#64748b",
                    background: val > 0 ? "rgba(34,197,94,0.1)" : val < 0 ? "rgba(239,68,68,0.1)" : "transparent",
                    padding:"1px 6px", borderRadius:4,
                  }}>{val > 0 ? "+" : ""}{val.toFixed(1)}</span>
                </div>
              ))}
            </div>

            {/* Sentiment */}
            <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                  Sentiment Retail
                  <span style={{ fontWeight:400, color:"#f0c84a", marginLeft:5, textTransform:"none", letterSpacing:"normal" }}>(MyFXBook)</span>
                </span>
                <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                  <BiasBadge bias={p.sentiment.bias} small />
                  {p.sentiment.extreme && <span style={{ fontSize:9, fontWeight:700, color:"#f97316", background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.3)", padding:"1px 5px", borderRadius:3 }}>EXT</span>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <SentimentBar longPct={p.sentiment.longPct} />
                <span style={{ fontSize:11, color:"#22c55e", fontFamily:"JetBrains Mono, monospace" }}>{p.sentiment.longPct}%</span>
                <span style={{ fontSize:10, color:"#64748b" }}>Long</span>
                <span style={{ fontSize:11, color:"#ef4444", fontFamily:"JetBrains Mono, monospace", marginLeft:"auto" }}>{p.sentiment.shortPct}%</span>
                <span style={{ fontSize:10, color:"#64748b" }}>Short</span>
              </div>
            </div>

            {/* Seasonality */}
            {(() => {
              const seas = getSeasonality(p.pair, seasonData);
              const MONTHS_S = ["J","F","M","A","M","J","J","A","S","O","N","D"];
              return (
                <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em" }}>Saisonnalité</span>
                      <span style={{ fontSize:9, color:"#f0c84a", background:"rgba(240,200,74,0.1)", border:"1px solid rgba(240,200,74,0.25)", padding:"1px 6px", borderRadius:4 }}>
                        {seasonLabel}
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      <BiasBadge bias={seas.bias} small />
                      <span style={{ fontSize:9, color:"#475569" }}>{seas.month}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:3, alignItems:"flex-end", marginBottom:8 }}>
                    {seas.trend.map((v, i) => (
                      <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, flex:1 }}>
                        <div style={{
                          width:"100%", height: v !== 0 ? 20 : 10,
                          borderRadius:3, minWidth:10,
                          background: i === seas.monthIdx
                            ? (v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "#64748b")
                            : (v > 0 ? "#22c55e30" : v < 0 ? "#ef444430" : "#1c1c38"),
                          border: i === seas.monthIdx ? `1px solid ${v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "#64748b"}` : "none",
                        }} />
                        <span style={{ fontSize:8, color: i === seas.monthIdx ? "#94a3b8" : "#334155" }}>{MONTHS_S[i]}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:"#475569" }}>
                    Données historiques post-Bretton Woods · {seasonLabel}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* RIGHT: Analysis */}
          <div style={{ padding:"16px 20px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>Analyse</div>

            {/* Quality */}
            <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", marginBottom:8 }}>Qualité du signal</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#64748b" }}>Score qualité:</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#f0c84a", fontFamily:"JetBrains Mono, monospace" }}>{p.quality}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#64748b" }}>Facteurs alignés:</span>
                <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"#94a3b8" }}>{p.factors} / 3</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#64748b" }}>Confiance:</span>
                <span style={{ fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"#f0c84a" }}>{p.confidence}%</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:11, color:"#64748b" }}>Niveau:</span>
                <span style={{ fontSize:10, fontWeight:700, color: p.confLevel==="HIGH"?"#22c55e":p.confLevel==="MEDIUM"?"#f0c84a":"#64748b" }}>{p.confLevel}</span>
              </div>
            </div>

            {/* Score radar */}
            <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", marginBottom:8 }}>Résumé facteurs</div>
              {[
                { label:"Institutionnel", bias:p.institutional.bias, pct:p.institutional.strengthPct },
                { label:"Fondamental",    bias:p.fundamental.bias,    pct:Math.min(100, Math.abs(p.fundamental.netScore)*12) },
                { label:"Sentiment",      bias:p.sentiment.bias,      pct:Math.abs(p.sentiment.longPct - 50)*2 },
                ...[{ label:`Saisonnalité (${getSeasonality(p.pair, seasonData).month})`, bias:getSeasonality(p.pair, seasonData).bias, pct:Math.abs(getSeasonality(p.pair, seasonData).score)*100 }],
              ].map(({ label, bias, pct }) => {
                const c = BIAS_CFG[bias];
                return (
                  <div key={label} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:10, color:"#64748b" }}>{label}</span>
                      <BiasBadge bias={bias} small />
                    </div>
                    <div style={{ height:4, background:"#1c1c38", borderRadius:999 }}>
                      <div style={{ height:"100%", width:`${Math.min(100,pct)}%`, background:c.color, borderRadius:999 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signal direction */}
            <div style={{
              background: `${SIGNAL_CFG[p.signal].bg}`, border:`1px solid ${SIGNAL_CFG[p.signal].border}`,
              borderRadius:10, padding:"12px 14px", textAlign:"center",
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", marginBottom:6 }}>Direction</div>
              <div style={{ fontSize:28, fontWeight:800, color:SIGNAL_CFG[p.signal].color }}>
                {SIGNAL_CFG[p.signal].arrow} {p.signal}
              </div>
              <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>
                Mis à jour à {p.updatedAt} Paris
              </div>
            </div>
          </div>
        </div>

        {/* News articles */}
        {(() => {
          const keywords  = getPairKeywords(p.base, p.quote);
          const matching  = news.filter(a => articleMatchesPair(a, keywords)).slice(0, 5);
          if (matching.length === 0) return null;
          return (
            <div style={{ borderTop:"1px solid #1c1c38", padding:"14px 20px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
                Articles récents · {p.base}/{p.quote}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {matching.map((a, i) => (
                  <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none", display:"flex", gap:10, padding:"8px 10px", background:"#10101e", border:"1px solid #1c1c38", borderRadius:8, transition:"border-color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#334155")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#1c1c38")}
                  >
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", lineHeight:1.4, marginBottom:3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                        {a.title}
                      </div>
                      {a.summary && (
                        <div style={{ fontSize:10, color:"#64748b", lineHeight:1.4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                          {a.summary}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                      <span style={{ fontSize:9, fontWeight:600, color:"#475569", background:"#0d0d1a", padding:"2px 6px", borderRadius:4, border:"1px solid #1c1c38" }}>{a.source}</span>
                      <span style={{ fontSize:9, color:"#334155" }}>{timeAgo(a.pubDate)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const { isMobile } = useBreakpoint();
  const [data,     setData]     = useState<PairSignal[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState<PairSignal | null>(null);
  const [category,     setCategory]     = useState<"All"|"Major"|"Cross"|"Commodity"|"Minor">("All");
  const [signalF,      setSignalF]      = useState<"All"|"BUY"|"SELL"|"NEUTRAL">("All");
  const [lastFetch,    setLastFetch]    = useState<Date|null>(null);
  const [seasonPeriod,  setSeasonPeriod]  = useState<SeasonPeriod>("10y");
  const [fromYear,      setFromYear]      = useState<string>(String(SHEET_FROM));
  const [toYear,        setToYear]        = useState<string>(String(SHEET_TO));
  const [seasonData,    setSeasonData]    = useState<Record<string, number[]> | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonMode,        setSeasonMode]        = useState<"preset"|"custom">("preset");
  const [showSeasonFilter,  setShowSeasonFilter]  = useState(true);
  const [activePresetLabel, setActivePresetLabel] = useState<string>("10 ans");
  const [news,             setNews]             = useState<NewsArticle[]>([]);

  // Fonction centrale : récupère la saisonnalité depuis Google Sheets pour une plage d'années
  const fetchSeasonRange = useCallback(async (from: number, to: number) => {
    if (isNaN(from) || isNaN(to) || from >= to || from < SHEET_FROM) return;
    setSeasonLoading(true);
    try {
      const allPairs = [
        "EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD",
        "EUR/GBP","EUR/JPY","EUR/CAD","EUR/AUD","GBP/JPY","GBP/AUD","GBP/CAD",
        "GBP/NZD","AUD/JPY","AUD/CAD","AUD/NZD","NZD/JPY","CAD/JPY","USD/MXN",
        "XAU/USD","XAG/USD","WTI/USD","XCU/USD",
      ];
      const r = await fetch(`/api/seasonality-range?from=${from}&to=${to}&pairs=${encodeURIComponent(allPairs.join(","))}`, { cache:"no-store" });
      if (!r.ok) throw new Error();
      const results: { pair: string; trend: number[] }[] = await r.json();
      const map: Record<string, number[]> = {};
      for (const item of results) map[item.pair] = item.trend;
      setSeasonData(map);
    } catch {
      /* keep previous */
    }
    setSeasonLoading(false);
  }, []);

  // Fetch custom range (bouton Calculer)
  const fetchCustomSeason = useCallback(async () => {
    const f = parseInt(fromYear), t = parseInt(toYear);
    await fetchSeasonRange(f, t);
    setSeasonMode("custom");
  }, [fromYear, toYear, fetchSeasonRange]);

  const load = useCallback(async (force=false) => {
    setLoading(true); setError("");
    try {
      const r = await fetch(force ? "/api/signal-analysis?force=1" : "/api/signal-analysis", { cache:"no-store" });
      if (!r.ok) throw new Error("API error");
      const d: PairSignal[] = await r.json();
      setData(d); setLastFetch(new Date());
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Charge la saisonnalité Google Sheets au démarrage (preset "10y" = 2015–2025)
  useEffect(() => {
    const [from, to] = PRESET_RANGES["10y"];
    fetchSeasonRange(from, to);
  }, [fetchSeasonRange]);

  useEffect(() => {
    fetch("/api/news", { cache: "no-store" })
      .then(r => r.json())
      .then((d: NewsArticle[]) => setNews(d))
      .catch(() => {});
  }, []);

  const filtered = data.filter(p =>
    (category === "All" || p.category === category) &&
    (signalF  === "All" || p.signal   === signalF)
  );

  const buys    = filtered.filter(p => p.signal === "BUY").length;
  const sells   = filtered.filter(p => p.signal === "SELL").length;
  const neutral = filtered.filter(p => p.signal === "NEUTRAL").length;

  return (
    <>
      {selected && <DetailPanel p={selected} onClose={() => setSelected(null)} seasonData={seasonData} seasonLabel={seasonMode === "custom" ? `${fromYear}–${toYear}` : SEASON_LABELS[seasonPeriod]} news={news} />}

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"24px 20px" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:800, color:"#f1f5f9", margin:0 }}>Analyse Multi-Facteurs</h1>
            <p style={{ fontSize:12, color:"#475569", marginTop:4 }}>
              COT Institutionnel · Surprises Macro · Sentiment Retail · Mis à jour toutes les 30 min
            </p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {lastFetch && <span style={{ fontSize:10, color:"#334155" }}>MAJ : {lastFetch.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span>}
            <button onClick={() => load(true)} disabled={loading} style={{
              fontSize:12, padding:"5px 12px", borderRadius:7, cursor:"pointer",
              background:"rgba(240,200,74,0.08)", border:"1px solid rgba(240,200,74,0.25)", color:"#f0c84a",
              display:"flex", alignItems:"center", gap:6, opacity:loading?0.5:1,
            }}>
              <span style={{ animation:loading?"spin 1s linear infinite":"none", display:"inline-block" }}>↻</span>
              Actualiser
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18, maxWidth:520 }}>
          {[
            { label:"BUY",     count:buys,    color:"#22c55e", bg:"rgba(34,197,94,0.08)" },
            { label:"SELL",    count:sells,   color:"#ef4444", bg:"rgba(239,68,68,0.08)" },
            { label:"NEUTRAL", count:neutral, color:"#64748b", bg:"rgba(100,116,139,0.06)" },
          ].map(({ label, count, color, bg }) => (
            <div key={label} style={{ background:bg, border:`1px solid ${color}30`, borderRadius:10, padding:"12px 16px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"JetBrains Mono, monospace" }}>{count}</div>
              <div style={{ fontSize:10, color:"#475569", fontWeight:700, letterSpacing:"0.08em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", gap:3, background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:8, padding:"3px 4px" }}>
            {(["All","Major","Cross","Commodity","Minor"] as const).map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{
                fontSize:11, fontWeight:category===c?700:500, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                background:category===c?"rgba(240,200,74,0.15)":"transparent",
                border:`1px solid ${category===c?"rgba(240,200,74,0.4)":"transparent"}`,
                color:category===c?"#f0c84a":"#475569",
              }}>{c}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:3, background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:8, padding:"3px 4px" }}>
            {(["All","BUY","SELL","NEUTRAL"] as const).map(s => {
              const active = signalF === s;
              const color = s==="BUY"?"#22c55e":s==="SELL"?"#ef4444":s==="NEUTRAL"?"#64748b":"#f0c84a";
              return (
                <button key={s} onClick={() => setSignalF(s)} style={{
                  fontSize:11, fontWeight:active?700:500, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                  background:active?`${color}18`:"transparent",
                  border:`1px solid ${active?`${color}50`:"transparent"}`,
                  color:active?color:"#475569",
                }}>{s}</button>
              );
            })}
          </div>
          <span style={{ fontSize:11, color:"#334155", alignSelf:"center", marginLeft:"auto" }}>
            {filtered.length} paires
          </span>
        </div>

        {/* Sélecteur saisonnalité — style SeasonalityG8 */}
        {(() => {
          const yearsCount = Math.max(0, parseInt(toYear) - parseInt(fromYear) + 1);
          return (
            <div style={{ marginBottom:16, padding:"12px 14px", background:"#0d0d1a", border:`1px solid ${showSeasonFilter?"rgba(212,175,55,0.3)":"#1c1c38"}`, borderRadius:8 }}>
              {/* Toggle row */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: showSeasonFilter ? 10 : 0 }}>
                <button onClick={() => setShowSeasonFilter(v => !v)} style={{ display:"flex", alignItems:"center", gap:7, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  <div style={{ width:34, height:18, borderRadius:999, background: showSeasonFilter?"rgba(212,175,55,0.25)":"#1c1c38", border:`1px solid ${showSeasonFilter?"rgba(212,175,55,0.5)":"#2a2a50"}`, position:"relative", transition:"all 0.2s", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:2, left: showSeasonFilter ? 16 : 2, width:12, height:12, borderRadius:"50%", background: showSeasonFilter?"#f0c84a":"#475569", transition:"left 0.2s" }} />
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, color: showSeasonFilter?"#f0c84a":"#475569" }}>Filtre par période</span>
                </button>
                {showSeasonFilter && (
                  <span style={{ fontSize:10, color:"#475569", marginLeft:"auto" }}>
                    {yearsCount} années sélectionnées
                  </span>
                )}
              </div>

              {showSeasonFilter && (
                <>
                  {/* Presets */}
                  <div style={{ display:"flex", gap:4, marginBottom:10, flexWrap:"wrap" }}>
                    {SEASON_PRESETS.map(p => {
                      const isActive = seasonMode === "preset" && activePresetLabel === p.label;
                      return (
                        <button key={p.label} onClick={() => {
                          setActivePresetLabel(p.label);
                          setSeasonMode("preset");
                          setFromYear(String(p.from));
                          setToYear(String(p.to));
                          fetchSeasonRange(p.from, p.to);
                        }} style={{
                          fontSize:10, fontWeight:600, padding:"2px 10px", borderRadius:5, cursor:"pointer",
                          background: isActive?"rgba(212,175,55,0.15)":"transparent",
                          border:`1px solid ${isActive?"rgba(212,175,55,0.4)":"#1c1c38"}`,
                          color: isActive?"#f0c84a":"#64748b",
                        }}>{p.label}</button>
                      );
                    })}
                  </div>

                  {/* Custom range */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, flexWrap:"wrap" }}>
                    <span style={{ color:"#475569" }}>De</span>
                    <input
                      type="number" value={fromYear}
                      onChange={e => { setFromYear(e.target.value); setSeasonMode("custom"); setActivePresetLabel(""); }}
                      min={SHEET_FROM} max={SHEET_TO - 1} step={1}
                      style={{ width:62, background:"#10101e", border:"1px solid #2a2a50", borderRadius:5, color:"#f0c84a", fontSize:11, padding:"3px 6px", textAlign:"center", fontFamily:"JetBrains Mono, monospace" }}
                    />
                    <span style={{ color:"#475569" }}>à</span>
                    <input
                      type="number" value={toYear}
                      onChange={e => { setToYear(e.target.value); setSeasonMode("custom"); setActivePresetLabel(""); }}
                      min={SHEET_FROM + 1} max={SHEET_TO} step={1}
                      style={{ width:62, background:"#10101e", border:"1px solid #2a2a50", borderRadius:5, color:"#f0c84a", fontSize:11, padding:"3px 6px", textAlign:"center", fontFamily:"JetBrains Mono, monospace" }}
                    />
                    {parseInt(toYear) === SHEET_TO && (
                      <span style={{ fontSize:9, color:"#22c55e", background:"rgba(34,197,94,0.08)", padding:"1px 6px", borderRadius:4, border:"1px solid rgba(34,197,94,0.2)" }}>
                        {SHEET_TO}
                      </span>
                    )}
                    <span style={{ color:"#475569", marginLeft:4 }}>
                      → <strong style={{ color:"#94a3b8" }}>{Math.max(0, parseInt(toYear) - parseInt(fromYear) + 1)}</strong> ans
                    </span>
                    <button
                      onClick={fetchCustomSeason}
                      disabled={seasonLoading}
                      style={{
                        fontSize:10, fontWeight:700, padding:"3px 12px", borderRadius:5, cursor:"pointer",
                        background:"rgba(212,175,55,0.18)", border:"1px solid rgba(212,175,55,0.45)",
                        color:"#f0c84a", opacity:seasonLoading?0.5:1, marginLeft:4,
                      }}>
                      {seasonLoading ? "…" : "Calculer"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Error/Loading */}
        {error && <div style={{ padding:24, textAlign:"center", color:"#ef4444", fontSize:13 }}>⚠ {error}</div>}
        {loading && !data.length && (
          <div style={{ padding:48, textAlign:"center", color:"#475569", fontSize:13 }}>
            <span style={{ animation:"spin 1s linear infinite", display:"inline-block", marginRight:8 }}>⟳</span>
            Analyse en cours… (COT + Macro + Sentiment)
          </div>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div style={{ overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }} suppressHydrationWarning>
          <div style={{ background:"#10101e", border:"1px solid #1c1c38", borderRadius:12, overflow:"hidden", minWidth: isMobile ? 960 : "auto" }} suppressHydrationWarning>
            {/* Column headers */}
            <div style={{
              display:"grid", gridTemplateColumns:"160px 130px 90px 150px 140px 140px 120px 70px",
              padding:"8px 16px", borderBottom:"1px solid #161630",
              fontSize:9, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"0.1em",
            }}>
              <span>PAIRE</span>
              <span>SIGNAL</span>
              <span>CONFIANCE</span>
              <span style={{display:"flex",alignItems:"center"}}>INSTITUTIONNEL<InfoTooltip content="COT CFTC — z-score des positions nettes non-commerciaux sur 52 semaines. Hebdomadaire, délai 3 jours ouvrés." /></span>
              <span style={{display:"flex",alignItems:"center"}}>FONDAMENTAL<InfoTooltip content="Surprises macro 30j (TradingView Calendar). Actual vs Forecast sur les 30 derniers événements de la devise. Mise à jour continue." /></span>
              <span style={{display:"flex",alignItems:"center"}}>SENTIMENT<InfoTooltip content="MyFXBook Community Outlook — ratio long/short retail. Utilisé en contrarian : majorité long = signal bearish institutionnel potentiel." /></span>
              <span style={{display:"flex",alignItems:"center"}}>SAISONNALITÉ<InfoTooltip content="Rendement mensuel moyen historique (Google Sheets 2015–2025). avg > 0 → Bullish, avg < 0 → Bearish. Ajustable via le filtre de période." /></span>
              <span style={{display:"flex",alignItems:"center"}}>QUALITÉ<InfoTooltip content="Score 0–100 d'alignement des 4 facteurs. HIGH (≥80) = 4 facteurs alignés. LOW (<50) = ≤2 facteurs alignés." /></span>
            </div>

            {filtered.map((p, i) => {
              const sig  = SIGNAL_CFG[p.signal];
              const instC = BIAS_CFG[p.institutional.bias];
              const fundC = BIAS_CFG[p.fundamental.bias];
              const sentC = BIAS_CFG[p.sentiment.bias];
              return (
                <div key={p.pair} onClick={() => setSelected(p)} style={{
                  display:"grid",
                  gridTemplateColumns:"160px 130px 90px 150px 140px 140px 120px 70px",
                  padding:"12px 16px",
                  borderBottom: i < filtered.length-1 ? "1px solid #0f0f24" : "none",
                  alignItems:"center", cursor:"pointer",
                  background:"transparent", transition:"background 0.12s",
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#161630"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="transparent"}
                >
                  {/* Pair */}
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{p.pair}</span>
                        <span style={{ fontSize:9, color:"#334155", background:"#0d0d1a", padding:"1px 5px", borderRadius:4, border:"1px solid #1c1c38" }}>
                          {p.category}
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:3 }}>
                        <CurrencyBadge cur={p.base} /><CurrencyBadge cur={p.quote} />
                      </div>
                    </div>
                  </div>

                  {/* Signal */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{
                      display:"inline-flex", alignItems:"center", gap:6,
                      fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:6,
                      color:sig.color, background:sig.bg, border:`1px solid ${sig.border}`,
                      width:"fit-content",
                    }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:sig.color, display:"inline-block" }} />
                      {p.signal} {sig.arrow}
                    </div>
                    <div style={{ fontSize:9, color:"#334155" }}>
                      {p.factors} factors · {p.confLevel}
                    </div>
                  </div>

                  {/* Confidence */}
                  <div>
                    <div style={{ fontSize:18, fontWeight:800, color:p.confidence>=65?"#22c55e":p.confidence>=45?"#f0c84a":"#64748b", fontFamily:"JetBrains Mono, monospace" }}>
                      {p.confidence}%
                    </div>
                    <div style={{ fontSize:9, color:"#334155" }}>{p.confLevel} · 3W</div>
                  </div>

                  {/* Institutional */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:instC.color, display:"inline-block", flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:600, color:instC.color }}>{p.institutional.bias}</span>
                    </div>
                    <div style={{ fontSize:10, color:"#475569" }}>{p.institutional.strengthPct}% force</div>
                    <div style={{ height:3, background:"#1c1c38", borderRadius:999, width:80 }}>
                      <div style={{ height:"100%", width:`${p.institutional.strengthPct}%`, background:instC.color, borderRadius:999 }} />
                    </div>
                  </div>

                  {/* Fundamental */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:fundC.color, display:"inline-block", flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:600, color:fundC.color }}>{p.fundamental.bias}</span>
                    </div>
                    <div style={{
                      fontFamily:"JetBrains Mono, monospace", fontSize:12, fontWeight:700,
                      color: p.fundamental.netScore>0?"#22c55e":p.fundamental.netScore<0?"#ef4444":"#64748b",
                      background: p.fundamental.netScore>0?"rgba(34,197,94,0.1)":p.fundamental.netScore<0?"rgba(239,68,68,0.1)":"transparent",
                      padding:"1px 6px", borderRadius:4, width:"fit-content",
                    }}>
                      {p.fundamental.netScore>0?"+":""}{p.fundamental.netScore.toFixed(1)}
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:sentC.color, display:"inline-block", flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:600, color:sentC.color }}>{p.sentiment.bias}</span>
                      {p.sentiment.extreme && <span style={{ fontSize:8, fontWeight:700, color:"#f97316", background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.3)", padding:"0 4px", borderRadius:3 }}>EXT</span>}
                    </div>
                    <SentimentBar longPct={p.sentiment.longPct} />
                  </div>

                  {/* Seasonality */}
                  {(() => {
                    const seas = getSeasonality(p.pair, seasonData);
                    return (
                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background: BIAS_CFG[seas.bias].color, display:"inline-block", flexShrink:0 }} />
                          <span style={{ fontSize:11, fontWeight:600, color: BIAS_CFG[seas.bias].color }}>{seas.bias}</span>
                          <span style={{ fontSize:9, color:"#334155" }}>{seas.month}</span>
                        </div>
                        <SeasonBar trend={seas.trend} current={seas.monthIdx} />
                      </div>
                    );
                  })()}

                  {/* Quality */}
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:"#f0c84a", fontFamily:"JetBrains Mono, monospace" }}>{p.quality}</div>
                    <div style={{ fontSize:8, color:"#334155" }}>Quality</div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop:12, padding:"10px 16px", background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, fontSize:10, color:"#334155", display:"flex", gap:16, flexWrap:"wrap" }}>
          <span>📊 <strong style={{color:"#475569"}}>Institutionnel</strong> : COT CFTC non-commerciaux (z-score 52 sem.) · TFF pour devises, Legacy COT pour matières premières</span>
          <span>📈 <strong style={{color:"#475569"}}>Fondamental</strong> : Surprises économiques 30 jours (TV Calendar)</span>
          <span>👥 <strong style={{color:"#475569"}}>Sentiment</strong> : MyFXBook Community Outlook (contrarian) · CFTC non-reportable en fallback</span>
          <span>📅 <strong style={{color:"#475569"}}>Saisonnalité</strong> : Biais historique du mois en cours (50+ ans post-Bretton Woods)</span>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </>
  );
}
