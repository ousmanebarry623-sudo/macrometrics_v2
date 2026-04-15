"use client";
import { useEffect, useState } from "react";

interface Article { title: string; link: string; pubDate: string; source: string; category: string; summary?: string; }

const SOURCE_COLORS: Record<string, string> = {
  "FXStreet":    "#06b6d4",
  "ForexLive":   "#22c55e",
  "DailyFX":     "#818cf8",
  "Google News": "#475569",
};

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  } catch { return ""; }
}

const CATEGORIES = ["Tous", "Forex", "Markets"];
const PAGE_SIZE = 10;

export default function FundamentalFeed({ limit }: { limit?: number }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("Tous");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchNews = () => {
      fetch("/api/news").then(r => r.json())
        .then(d => { setArticles(d); setLoading(false); })
        .catch(() => setLoading(false));
    };
    fetchNews();
    // Refetch every 10 minutes for real-time updates
    const interval = setInterval(fetchNews, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); setExpanded(null); }, [cat]);

  const filtered = cat === "Tous" ? articles : articles.filter(a => a.category === cat || a.source === cat);
  const pool = limit ? filtered.slice(0, limit) : filtered;
  const totalPages = Math.ceil(pool.length / PAGE_SIZE);
  const paginated = pool.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Analyse Fondamentale</h3>
          <p style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>FXStreet · ForexLive · Markets</p>
        </div>
        <span style={{ fontSize: 10, color: "#f97316", background: "rgba(249,115,22,0.1)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(249,115,22,0.2)" }}>
          {pool.length} articles
        </span>
      </div>

      {/* Category + source filters */}
      <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
            background: cat === c ? "rgba(212,175,55,0.12)" : "transparent",
            border: `1px solid ${cat === c ? "rgba(212,175,55,0.3)" : "#1c1c38"}`,
            color: cat === c ? "#f0c84a" : "#475569" }}>
            {c}
          </button>
        ))}
        {["FXStreet", "ForexLive"].map(s => (
          <button key={s} onClick={() => setCat(s)} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
            background: cat === s ? ((SOURCE_COLORS[s] ?? "#475569") + "20") : "transparent",
            border: `1px solid ${cat === s ? ((SOURCE_COLORS[s] ?? "#475569") + "40") : "#1c1c38"}`,
            color: cat === s ? (SOURCE_COLORS[s] ?? "#f0c84a") : "#475569" }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array(5).fill(0).map((_,i) => <div key={i}><div className="skeleton" style={{ height: 16, marginBottom: 5 }} /><div className="skeleton" style={{ height: 11, width: "50%" }} /></div>)}
        </div>
      ) : paginated.length === 0 ? (
        <div style={{ textAlign: "center", color: "#475569", padding: 30, fontSize: 13 }}>Aucun article disponible</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {paginated.map((a, i) => {
              const globalIdx = (page - 1) * PAGE_SIZE + i;
              return (
                <div key={globalIdx} style={{ borderBottom: i < paginated.length - 1 ? "1px solid #1c1c3860" : "none", padding: "12px 0" }}>
                  <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 5 }}
                      dangerouslySetInnerHTML={{ __html: a.title }} />
                  </a>
                  {a.summary && expanded === globalIdx && (
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6, marginBottom: 6, padding: "6px 10px", background: "#0d0d1a", borderRadius: 6, borderLeft: "2px solid #1c1c38" }}>
                      {a.summary}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                      background: (SOURCE_COLORS[a.source] ?? "#475569") + "18",
                      color: SOURCE_COLORS[a.source] ?? "#475569",
                      border: `1px solid ${(SOURCE_COLORS[a.source] ?? "#475569")}25` }}>
                      {a.source}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{a.category}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{timeAgo(a.pubDate)}</span>
                    {a.summary && (
                      <button onClick={() => setExpanded(expanded === globalIdx ? null : globalIdx)}
                        style={{ fontSize: 10, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>
                        {expanded === globalIdx ? "▲ Moins" : "▼ Résumé"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: page === 1 ? "default" : "pointer",
                  background: "transparent", border: "1px solid #1c1c38",
                  color: page === 1 ? "#1c1c38" : "#94a3b8" }}>
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 6, cursor: "pointer", minWidth: 30,
                    background: page === p ? "rgba(212,175,55,0.12)" : "transparent",
                    border: `1px solid ${page === p ? "rgba(212,175,55,0.35)" : "#1c1c38"}`,
                    color: page === p ? "#f0c84a" : "#475569" }}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: page === totalPages ? "default" : "pointer",
                  background: "transparent", border: "1px solid #1c1c38",
                  color: page === totalPages ? "#1c1c38" : "#94a3b8" }}>
                ›
              </button>
              <span style={{ fontSize: 10, color: "#475569", marginLeft: 4 }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pool.length)} / {pool.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
