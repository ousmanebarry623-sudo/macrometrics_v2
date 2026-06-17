"use client";
import { useEffect, useState, useCallback } from "react";
import type { CentralBank } from "@/lib/trading-economics";
import { useBreakpoint } from "@/lib/use-breakpoint";

const BIAS_CFG = {
  hawkish: { color: "#22c55e", label: "Hawkish 🦅", bg: "rgba(34,197,94,0.06)" },
  neutral: { color: "#f0c84a", label: "Neutre ⚖️",  bg: "rgba(240,200,74,0.06)" },
  dovish:  { color: "#ef4444", label: "Dovish 🕊️",  bg: "rgba(239,68,68,0.06)" },
};

// ── Calendrier officiel des réunions 2026 (dates publiées par chaque banque) ──
// Clé = devise. On prend la dernière date de chaque réunion (jour de décision).
const CB_MEETINGS_2026: Record<string, string[]> = {
  USD: ["2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-16"],
  EUR: ["2026-01-29","2026-03-12","2026-04-30","2026-06-04","2026-07-16","2026-09-10","2026-10-29","2026-12-17"],
  GBP: ["2026-02-05","2026-03-19","2026-05-07","2026-06-18","2026-08-06","2026-09-17","2026-11-05","2026-12-17"],
  JPY: ["2026-01-23","2026-03-19","2026-04-28","2026-06-17","2026-07-31","2026-09-18","2026-10-30","2026-12-18"],
  CAD: ["2026-01-28","2026-03-11","2026-04-29","2026-06-10","2026-07-29","2026-09-16","2026-10-28","2026-12-09"],
  AUD: ["2026-02-03","2026-03-31","2026-05-05","2026-06-16","2026-08-11","2026-09-29","2026-11-03","2026-12-08"],
  NZD: ["2026-02-25","2026-04-08","2026-05-27","2026-07-08","2026-08-19","2026-10-07","2026-11-25"],
  CHF: ["2026-03-19","2026-06-18","2026-09-24","2026-12-17"],
};

function nextMeeting(currency: string): { date: Date | null; countdown: string; soon: boolean } {
  const sched = CB_MEETINGS_2026[currency] ?? [];
  const now = Date.now();
  const future = sched
    .map(s => new Date(`${s}T12:00:00Z`).getTime())
    .filter(t => t >= now - 86_400_000) // garde aujourd'hui
    .sort((a, b) => a - b);
  if (!future.length) return { date: null, countdown: "—", soon: false };
  const t = future[0];
  const d = Math.ceil((t - now) / 86_400_000);
  const countdown = d < 0 ? "Passée" : d === 0 ? "Aujourd'hui" : d === 1 ? "Demain" : `dans ${d}j`;
  return { date: new Date(t), countdown, soon: d >= 0 && d <= 7 };
}

// ── Interprétation pour trader débutant ───────────────────────────────────────
function interpret(b: CentralBank): { headline: string; impact: string; impactColor: string } {
  const cur = b.currency;
  const fc  = b.forecast ?? b.currentRate;
  const dir = fc > b.currentRate + 0.001 ? "hausse" : fc < b.currentRate - 0.001 ? "baisse" : "statu quo";

  if (b.bias === "hawkish") {
    return {
      headline: `Ton ferme (hawkish) : la banque s'inquiète de l'inflation et penche pour des taux plus élevés${dir === "hausse" ? " — une hausse est anticipée" : ""}.`,
      impact: `${cur} plutôt soutenu (haussier)`,
      impactColor: "#22c55e",
    };
  }
  if (b.bias === "dovish") {
    return {
      headline: `Ton accommodant (dovish) : la banque veut soutenir l'économie et penche pour des taux plus bas${dir === "baisse" ? " — une baisse est anticipée" : ""}.`,
      impact: `${cur} sous pression (baissier)`,
      impactColor: "#ef4444",
    };
  }
  return {
    headline: `Ton neutre : la banque attend (statu quo probable). Pas de catalyseur clair pour ${cur}.`,
    impact: `${cur} stable`,
    impactColor: "#94a3b8",
  };
}

// ── Glossaire débutant ────────────────────────────────────────────────────────
const GLOSSARY: { term: string; def: string }[] = [
  { term: "Taux directeur", def: "Le taux fixé par la banque centrale. Plus il est haut, plus la devise rapporte aux investisseurs → tend à la renforcer." },
  { term: "Hawkish 🦅 (faucon)", def: "Ton ferme : la banque veut monter ou maintenir des taux élevés pour combattre l'inflation. Généralement HAUSSIER pour la devise." },
  { term: "Dovish 🕊️ (colombe)", def: "Ton accommodant : la banque veut baisser les taux pour soutenir l'économie. Généralement BAISSIER pour la devise." },
  { term: "Hike / Hold / Cut", def: "Hike = hausse de taux · Hold = maintien · Cut = baisse. Les % montrent ce que le marché price pour la prochaine réunion." },
  { term: "Prévision", def: "Taux attendu par le marché à terme. ▲ au-dessus du taux actuel = hausse anticipée (haussier devise), ▼ = baisse (baissier)." },
  { term: "Différentiel de taux", def: "Sur une paire (ex EUR/USD), c'est l'écart de taux entre les 2 banques. C'est le moteur n°1 du forex à moyen terme : l'argent va vers la devise qui rapporte le plus." },
];

export default function CentralBanksCard() {
  const [banks, setBanks] = useState<CentralBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpd, setLastUpd] = useState("");
  const [showGlossary, setShowGlossary] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { isMobile, isTablet } = useBreakpoint();

  const banksGridCols = isMobile ? "1fr" : isTablet ? "repeat(2,1fr)" : "repeat(auto-fill, minmax(260px,1fr))";

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/macro-data?type=central-banks", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const data: CentralBank[] = await r.json();
      setBanks(data);
      setLastUpd(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60 * 60 * 1000); // refresh 1h
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Banques Centrales G8
          </h3>
          <p style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
            Taux directeurs · Biais · Calendrier réunions 2026 · Probabilités marché
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowGlossary(s => !s)} style={{ fontSize: 10, fontWeight: 700, color: showGlossary ? "#f0c84a" : "#475569", background: showGlossary ? "rgba(240,200,74,0.1)" : "transparent", border: `1px solid ${showGlossary ? "rgba(240,200,74,0.3)" : "#1c1c38"}`, borderRadius: 6, cursor: "pointer", padding: "3px 9px" }}>
            {showGlossary ? "✕ Glossaire" : "? Comment lire"}
          </button>
          {lastUpd && <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>MAJ {lastUpd}</span>}
          <button onClick={fetchData} title="Actualiser" style={{ background: "none", border: "1px solid #1c1c38", borderRadius: 6, color: "#475569", cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {/* Glossaire débutant */}
      {showGlossary && (
        <div style={{ background: "#0d0d1a", border: "1px solid #1c1c38", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#f0c84a", marginBottom: 10 }}>📚 Comprendre les banques centrales</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {GLOSSARY.map(g => (
              <div key={g.term}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 2 }}>{g.term}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{g.def}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 10, lineHeight: 1.6, borderTop: "1px solid #1c1c38", paddingTop: 8 }}>
            💡 <strong style={{ color: "#64748b" }}>Règle simple :</strong> banque hawkish + taux qui montent = devise forte. Banque dovish + taux qui baissent = devise faible. Pour trader une paire, compare les deux banques : achète la devise de la banque la plus hawkish contre la plus dovish.
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: banksGridCols, gap: 10 }} suppressHydrationWarning>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 220, borderRadius: 8 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: banksGridCols, gap: 10 }} suppressHydrationWarning>
          {banks.map(b => {
            const bc = BIAS_CFG[b.bias];
            const forecast = b.forecast ?? b.currentRate;
            const rateDir = forecast > b.currentRate ? "▲" : forecast < b.currentRate ? "▼" : "—";
            const rateDirColor = forecast > b.currentRate ? "#22c55e" : forecast < b.currentRate ? "#ef4444" : "#94a3b8";
            const moveBps = Math.round((forecast - b.currentRate) * 100);
            const meet = nextMeeting(b.currency);
            const meetingStr = meet.date ? meet.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—";
            const lastChangeStr = new Date(b.lastChange).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
            const isLive = b.rateSource === "live";
            const asOfStr = b.rateAsOf ? new Date(b.rateAsOf).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
            const dominant = b.probability.hike >= b.probability.cut
              ? (b.probability.hike >= b.probability.hold ? "hike" : "hold")
              : (b.probability.cut >= b.probability.hold ? "cut" : "hold");
            const interp = interpret(b);
            const isOpen = expanded === b.name;

            return (
              <div key={b.name} style={{
                background: "#0d0d1a",
                border: `1px solid ${bc.color}20`,
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{b.flag}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9" }}>{b.name}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{b.currency}</div>
                    </div>
                  </div>
                  <span title="Biais de politique monétaire" style={{ fontSize: 9, fontWeight: 700, color: bc.color, background: bc.bg, padding: "3px 8px", borderRadius: 999, border: `1px solid ${bc.color}30` }}>
                    {bc.label}
                  </span>
                </div>

                {/* Taux actuel + prévision */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Taux actuel</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "#f0c84a", fontFamily: "JetBrains Mono, monospace", lineHeight: 1 }}>
                      {b.currentRate.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 8, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      {isLive
                        ? <><span style={{ color: "#22c55e", fontWeight: 700 }}>● LIVE</span><span style={{ color: "#334155" }}>{asOfStr ? `· ${asOfStr}` : ""}</span></>
                        : <span style={{ color: "#334155" }}>curé · depuis {lastChangeStr}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>Prévision marché</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: rateDirColor, fontFamily: "JetBrains Mono, monospace" }}>
                      {rateDir} {b.forecast != null ? b.forecast.toFixed(2) : "—"}%
                    </div>
                    {moveBps !== 0 && (
                      <div style={{ fontSize: 8, color: rateDirColor, marginTop: 2 }}>
                        {moveBps > 0 ? "+" : ""}{moveBps} bps attendus
                      </div>
                    )}
                  </div>
                </div>

                {/* Interprétation trader */}
                <div style={{ background: `${interp.impactColor}0d`, border: `1px solid ${interp.impactColor}22`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{interp.headline}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: interp.impactColor, marginTop: 4 }}>→ {interp.impact}</div>
                </div>

                {/* Probabilité prochaine décision */}
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Ce que price le marché (prochaine réunion)
                  </div>
                  <div style={{ height: 5, borderRadius: 999, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${b.probability.hike}%`, background: "#22c55e", flexShrink: 0 }} />
                    <div style={{ width: `${b.probability.hold}%`, background: "#f0c84a", flexShrink: 0 }} />
                    <div style={{ flex: 1, background: "#ef4444" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
                    <span style={{ color: "#22c55e", fontWeight: dominant === "hike" ? 800 : 400 }}>↑ Hausse {b.probability.hike}%</span>
                    <span style={{ color: "#f0c84a", fontWeight: dominant === "hold" ? 800 : 400 }}>— Maintien {b.probability.hold}%</span>
                    <span style={{ color: "#ef4444", fontWeight: dominant === "cut" ? 800 : 400 }}>↓ Baisse {b.probability.cut}%</span>
                  </div>
                </div>

                {/* Prochaine réunion */}
                <div style={{ borderTop: "1px solid #1c1c38", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>Prochaine réunion</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{meetingStr}</span>
                    <span style={{ fontSize: 9, color: meet.soon ? "#f59e0b" : bc.color, background: meet.soon ? "rgba(245,158,11,0.12)" : bc.bg, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                      {meet.soon && "⚠ "}{meet.countdown}
                    </span>
                  </div>
                </div>

                {/* Détail dépliable : comment trader */}
                <button onClick={() => setExpanded(isOpen ? null : b.name)} style={{ background: "none", border: "none", color: "#475569", fontSize: 10, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left" }}>
                  {isOpen ? "▲ Masquer" : "▼ Comment trader cette banque"}
                </button>
                {isOpen && (
                  <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.6, background: "#0a0a15", borderRadius: 8, padding: "8px 10px" }}>
                    <div>• <strong style={{ color: "#94a3b8" }}>Biais {b.bias}</strong> → {interp.impact}.</div>
                    <div>• Surveille la réunion du <strong style={{ color: "#94a3b8" }}>{meetingStr}</strong> : une décision contraire aux attentes = mouvement violent sur {b.currency}.</div>
                    <div>• Pour une paire, oppose ce biais à l'autre banque (différentiel de taux). Ex : banque hawkish contre banque dovish = tendance forte.</div>
                    <div>• Le forex anticipe : si le marché price déjà la décision (barre ci-dessus), l'effet est souvent « déjà dans les prix ».</div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Note source */}
      <div style={{ marginTop: 12, fontSize: 9, color: "#334155", lineHeight: 1.6 }}>
        <span style={{ color: "#22c55e", fontWeight: 700 }}>● LIVE</span> = taux directeur en temps réel via FRED (Fed, BCE, BoE). Les autres banques sont en valeur curée (dernière décision connue) faute de série live fiable. Calendrier des réunions = agenda officiel 2026 (prochaine échéance calculée automatiquement). Probabilités = pricing de marché à la dernière mise à jour.
      </div>
    </div>
  );
}
