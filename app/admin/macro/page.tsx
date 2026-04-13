"use client";

import { useState, useEffect } from "react";
import { MACRO_COUNTRIES } from "@/lib/trading-economics";

const FIELDS = [
  { key: "rate",         label: "Taux d'intérêt",    unit: "%" },
  { key: "inflation",    label: "Inflation (CPI)",    unit: "%" },
  { key: "coreInflation",label: "Core Inflation",     unit: "%" },
  { key: "unemployment", label: "Chômage",            unit: "%" },
  { key: "gdpGrowth",    label: "Croissance PIB (ann)",unit: "%" },
  { key: "tradeBalance", label: "Balance commerciale",unit: "B" },
  { key: "sentiment",    label: "Confiance consomm.", unit: "" },
  { key: "debtToGdp",    label: "Dette/PIB",          unit: "%" },
] as const;

type FieldKey = typeof FIELDS[number]["key"];

interface Override { [field: string]: number | null }
interface OverrideStore { [code: string]: Override }

const EMPTY_FORM = () => Object.fromEntries(FIELDS.map(f => [f.key, ""])) as Record<FieldKey, string>;

export default function AdminMacroPage() {
  const [selected, setSelected] = useState(MACRO_COUNTRIES[0].code);
  const [form, setForm]         = useState<Record<FieldKey, string>>(EMPTY_FORM());
  const [overrides, setOverrides] = useState<OverrideStore>({});
  const [status, setStatus]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadingOverrides, setLoadingOverrides] = useState(true);

  // Load current overrides on mount
  useEffect(() => {
    fetch("/api/import-macro")
      .then(r => r.json())
      .then(d => { setOverrides(d.overrides ?? {}); })
      .catch(() => {})
      .finally(() => setLoadingOverrides(false));
  }, []);

  // Pre-fill form when country changes
  useEffect(() => {
    const base = MACRO_COUNTRIES.find(c => c.code === selected)!;
    const ov   = overrides[selected] ?? {};
    const filled = EMPTY_FORM();
    for (const f of FIELDS) {
      const val = (ov[f.key] !== undefined ? ov[f.key] : (base as unknown as Record<string, unknown>)[f.key]);
      filled[f.key] = val !== null && val !== undefined ? String(val) : "";
    }
    setForm(filled);
  }, [selected, overrides]);

  async function handleSave() {
    setLoading(true);
    setStatus(null);
    const data: Partial<Override> = {};
    for (const f of FIELDS) {
      const v = form[f.key];
      if (v !== "" && v !== undefined) {
        data[f.key] = parseFloat(v.replace(",", "."));
      }
    }
    try {
      const res = await fetch("/api/import-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: selected, data }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(`✅ ${selected} mis à jour — ${json.fields?.length ?? 0} champs sauvegardés`);
        setOverrides(prev => ({ ...prev, [selected]: { ...(prev[selected] ?? {}), ...(data as Override) } } as OverrideStore));
      } else {
        setStatus(`❌ Erreur: ${json.error}`);
      }
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(code?: string) {
    if (!confirm(code ? `Réinitialiser ${code} aux valeurs par défaut ?` : "Réinitialiser TOUS les pays ?")) return;
    setLoading(true);
    const url = code ? `/api/import-macro?code=${code}` : "/api/import-macro?code=ALL";
    if (!code) {
      await fetch("/api/import-macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetAll: true }),
      });
      setOverrides({});
      setStatus("✅ Toutes les overrides supprimées");
    } else {
      await fetch(url, { method: "DELETE" });
      setOverrides(prev => { const n = { ...prev }; delete n[code]; return n; });
      setStatus(`✅ ${code} réinitialisé aux valeurs par défaut`);
    }
    setLoading(false);
  }

  const country = MACRO_COUNTRIES.find(c => c.code === selected)!;
  const hasOverride = (code: string) => !!overrides[code] && Object.keys(overrides[code]).length > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px", color: "#f1f5f9" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(249,115,22,0.08)", padding: "3px 10px", borderRadius: 999, border: "1px solid rgba(249,115,22,0.2)" }}>Admin</span>
          <span style={{ fontSize: 11, color: "#475569" }}>Mise à jour manuelle des données macro</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9" }}>Édition des données macro</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
          Saisis les valeurs directement depuis TradingEconomics · Les données sont stockées en Redis et ont priorité sur les valeurs par défaut.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        {/* Country selector */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pays</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {MACRO_COUNTRIES.map(c => (
              <button
                key={c.code}
                onClick={() => setSelected(c.code)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                  background: selected === c.code ? "rgba(212,175,55,0.12)" : "#10101e",
                  border: `1px solid ${selected === c.code ? "rgba(212,175,55,0.35)" : hasOverride(c.code) ? "rgba(34,197,94,0.25)" : "#1c1c38"}`,
                  color: selected === c.code ? "#f0c84a" : "#94a3b8",
                  fontWeight: selected === c.code ? 700 : 400,
                  fontSize: 13, textAlign: "left",
                }}
              >
                <span>{c.flag}</span>
                <span style={{ flex: 1 }}>{c.code}</span>
                {hasOverride(c.code) && (
                  <span style={{ fontSize: 8, background: "rgba(34,197,94,0.2)", color: "#22c55e", padding: "1px 5px", borderRadius: 999, fontWeight: 700 }}>M</span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleReset()}
            style={{ marginTop: 16, width: "100%", padding: "7px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >
            🗑 Reset tout
          </button>
        </div>

        {/* Form */}
        <div style={{ background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 24 }}>
          {/* Country header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>{country.flag}</span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9" }}>{country.country}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{country.currency} · {country.code}</div>
              </div>
            </div>
            {hasOverride(selected) && (
              <button
                onClick={() => handleReset(selected)}
                style={{ padding: "5px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 12, cursor: "pointer" }}
              >
                Reset {selected}
              </button>
            )}
          </div>

          {/* Source hint */}
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
            💡 <strong style={{ color: "#94a3b8" }}>TradingEconomics :</strong> Va sur{" "}
            <code style={{ color: "#3b82f6" }}>tradingeconomics.com/{country.country.toLowerCase().replace(/ /g, "-")}</code>{" "}
            → onglet <strong style={{ color: "#94a3b8" }}>Aperçu</strong> → copie les valeurs "Dernier" dans les champs ci-dessous.
          </div>

          {/* Fields grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {FIELDS.map(f => {
              const base = (MACRO_COUNTRIES.find(c => c.code === selected) as Record<string, unknown>)?.[f.key];
              const ov   = (overrides[selected] ?? {})[f.key];
              const isModified = ov !== undefined && ov !== null;
              return (
                <div key={f.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: isModified ? "#22c55e" : "#94a3b8" }}>
                      {f.label}
                    </label>
                    {f.unit && <span style={{ fontSize: 10, color: "#475569" }}>{f.unit}</span>}
                    {isModified && <span style={{ fontSize: 10, color: "#22c55e", marginLeft: "auto" }}>modifié</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      step="0.01"
                      value={form[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={String(base ?? "—")}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 7,
                        background: "#0d0d1a",
                        border: `1px solid ${isModified ? "rgba(34,197,94,0.35)" : "#1c1c38"}`,
                        color: isModified ? "#22c55e" : "#f1f5f9",
                        fontSize: 14,
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 600,
                        outline: "none",
                      }}
                    />
                    {isModified && (
                      <span style={{ fontSize: 11, color: "#475569", minWidth: 50 }}>
                        (def: {String(base ?? "—")})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save button */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{
                padding: "10px 28px", borderRadius: 9, cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "#1c1c38" : "linear-gradient(135deg, #d4af37, #f0c84a)",
                border: "none", color: "#000", fontWeight: 800, fontSize: 14,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Sauvegarde…" : `💾 Sauvegarder ${selected}`}
            </button>
            {status && (
              <div style={{ fontSize: 13, color: status.startsWith("✅") ? "#22c55e" : "#ef4444" }}>
                {status}
              </div>
            )}
          </div>

          {/* Override summary */}
          {hasOverride(selected) && (
            <div style={{ marginTop: 20, padding: "12px 14px", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Valeurs overridées pour {selected}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(overrides[selected]).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 12, padding: "3px 10px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 999, color: "#22c55e", fontFamily: "JetBrains Mono, monospace" }}>
                    {k}: <strong>{String(v)}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All overrides summary */}
      {!loadingOverrides && Object.keys(overrides).length > 0 && (
        <div style={{ marginTop: 24, background: "#10101e", border: "1px solid #1c1c38", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 12 }}>
            Pays avec données manuelles ({Object.keys(overrides).length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.keys(overrides).map(code => {
              const c = MACRO_COUNTRIES.find(x => x.code === code);
              return c ? (
                <span key={code} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 999, fontSize: 12, color: "#22c55e" }}>
                  {c.flag} {code} · {Object.keys(overrides[code]).length} champs
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {loadingOverrides && (
        <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>Chargement des données Redis…</div>
      )}
    </div>
  );
}
