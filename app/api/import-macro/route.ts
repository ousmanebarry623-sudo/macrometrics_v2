import { NextResponse } from "next/server";
import { kv } from "@/lib/redis";
import { MACRO_COUNTRIES, type CountryMacro } from "@/lib/trading-economics";

const REDIS_MACRO_KEY = "macro:override:v1";

export const dynamic = "force-dynamic";

// ── Field mapping: French TE label → CountryMacro key ─────────────────────────
const INDICATOR_MAP: Record<string, keyof CountryMacro> = {
  "taux d'intérêt":               "rate",
  "taux d interet":                "rate",
  "interest rate":                 "rate",
  "taux d'inflation":              "inflation",
  "taux d inflation":              "inflation",
  "inflation rate":                "inflation",
  "inflation":                     "inflation",
  "core inflation":                "coreInflation",
  "core inflation rate":           "coreInflation",
  "inflation sous-jacente":        "coreInflation",
  "taux de chômage":               "unemployment",
  "taux de chomage":               "unemployment",
  "unemployment rate":             "unemployment",
  "taux de croissance annuel du pib": "gdpGrowth",
  "gdp annual growth rate":        "gdpGrowth",
  "gdp growth rate":               "gdpGrowth",
  "taux de croissance du pib":     "gdpGrowth",
  "croissance du pib":             "gdpGrowth",
  "balance commerciale":           "tradeBalance",
  "balance of trade":              "tradeBalance",
  "trade balance":                 "tradeBalance",
  "confiance des consommateurs":   "sentiment",
  "consumer confidence":           "sentiment",
  "confiance des entreprises":     "sentiment",
  "business confidence":           "sentiment",
  "dette publique/pib":            "debtToGdp",
  "government debt to gdp":        "debtToGdp",
  "debt to gdp":                   "debtToGdp",
  "dette/pib":                     "debtToGdp",
};

// Country code aliases
const COUNTRY_MAP: Record<string, string> = {
  "united states":   "US",
  "usa":             "US",
  "us":              "US",
  "euro area":       "EU",
  "eurozone":        "EU",
  "eu":              "EU",
  "united kingdom":  "GB",
  "uk":              "GB",
  "gb":              "GB",
  "japan":           "JP",
  "jp":              "JP",
  "canada":          "CA",
  "ca":              "CA",
  "australia":       "AU",
  "au":              "AU",
  "new zealand":     "NZ",
  "nz":              "NZ",
  "switzerland":     "CH",
  "ch":              "CH",
  "china":           "CN",
  "cn":              "CN",
  "germany":         "DE",
  "allemagne":       "DE",
  "de":              "DE",
  "france":          "FR",
  "fr":              "FR",
};

function normalizeStr(s: string): string {
  return s.toLowerCase().trim()
    .replace(/\u2019/g, "'")   // curly apostrophe
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ");
}

// ── POST /api/import-macro ─────────────────────────────────────────────────────
// Body: { country: "US", data: { rate: 3.75, inflation: 3.3, ... } }
// OR:   { country: "US", rawText: "<pasted TE table text>" }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { country, data, rawText, resetAll } = body as {
      country?: string;
      data?: Partial<CountryMacro>;
      rawText?: string;
      resetAll?: boolean;
    };

    // Reset all overrides
    if (resetAll) {
      await kv.del(REDIS_MACRO_KEY);
      return NextResponse.json({ ok: true, message: "Toutes les overrides supprimées" });
    }

    if (!country) {
      return NextResponse.json({ error: "Paramètre 'country' requis" }, { status: 400 });
    }

    const code = COUNTRY_MAP[normalizeStr(country)] ?? country.toUpperCase();
    const base = MACRO_COUNTRIES.find(c => c.code === code);
    if (!base) {
      return NextResponse.json({ error: `Pays inconnu: ${country}` }, { status: 400 });
    }

    let parsed: Partial<CountryMacro> = data ?? {};

    // ── Parse raw text (copy-paste from TE table) ──────────────────────────────
    if (rawText) {
      const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        // Match: "indicator name   value   ..." (tab or multiple spaces separated)
        const parts = line.split(/\t|  +/);
        if (parts.length < 2) continue;

        const rawLabel = normalizeStr(parts[0]);
        const rawValue = parts[1]?.replace(",", ".").trim();
        const num = parseFloat(rawValue);
        if (isNaN(num)) continue;

        // Match to known indicator
        let field = INDICATOR_MAP[rawLabel];
        if (!field) {
          const matchedKey = Object.keys(INDICATOR_MAP).find(k => rawLabel.includes(k) || k.includes(rawLabel));
          if (matchedKey) field = INDICATOR_MAP[matchedKey];
        }

        if (field && field !== "score" && field !== "trend" && field !== "source") {
          (parsed as Record<string, unknown>)[field] = num;
        }
      }
    }

    if (Object.keys(parsed).length === 0) {
      return NextResponse.json({ error: "Aucune donnée valide trouvée" }, { status: 400 });
    }

    // Load existing overrides and merge
    const existing = (await kv.get<Record<string, Partial<CountryMacro>>>(REDIS_MACRO_KEY)) ?? {};
    existing[code] = { ...(existing[code] ?? {}), ...parsed };
    await kv.set(REDIS_MACRO_KEY, existing); // no TTL = permanent

    return NextResponse.json({
      ok: true,
      code,
      updated: parsed,
      fields: Object.keys(parsed),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── GET /api/import-macro — read current overrides ────────────────────────────
export async function GET() {
  try {
    const overrides = await kv.get<Record<string, Partial<CountryMacro>>>(REDIS_MACRO_KEY);
    return NextResponse.json({ overrides: overrides ?? {}, countries: Object.keys(overrides ?? {}) });
  } catch {
    return NextResponse.json({ overrides: {}, countries: [] });
  }
}

// ── DELETE /api/import-macro?code=US — remove one country ────────────────────
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.toUpperCase();
  if (!code) {
    await kv.del(REDIS_MACRO_KEY);
    return NextResponse.json({ ok: true, message: "Toutes les overrides supprimées" });
  }
  const existing = (await kv.get<Record<string, Partial<CountryMacro>>>(REDIS_MACRO_KEY)) ?? {};
  delete existing[code];
  if (Object.keys(existing).length === 0) {
    await kv.del(REDIS_MACRO_KEY);
  } else {
    await kv.set(REDIS_MACRO_KEY, existing);
  }
  return NextResponse.json({ ok: true, code, remaining: Object.keys(existing) });
}
