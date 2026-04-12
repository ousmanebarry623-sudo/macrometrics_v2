export const dynamic = "force-dynamic";

// alternative.me Fear & Greed Index (crypto-based, free open API)
// https://alternative.me/crypto/fear-and-greed-index/

const LABELS: Record<string, string> = {
  "Extreme Fear": "Peur Extrême",
  "Fear":         "Peur",
  "Neutral":      "Neutre",
  "Greed":        "Euphorie",
  "Extreme Greed":"Euphorie Extrême",
};

export async function GET() {
  try {
    const res = await fetch(
      "https://api.alternative.me/fng/?limit=30&format=json",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    const items: { value: string; value_classification: string; timestamp: string }[] = json?.data ?? [];
    if (!items.length) throw new Error("empty");

    const latest   = items[0];
    const score    = parseInt(latest.value);
    const rawLabel = latest.value_classification;
    const rating   = LABELS[rawLabel] ?? rawLabel;

    const prevClose = parseInt(items[1]?.value ?? String(score));
    const prevWeek  = parseInt(items[7]?.value ?? String(score));
    const prevMonth = parseInt(items[29]?.value ?? String(score));

    const history = [...items].reverse().map(d => ({
      date:   new Date(parseInt(d.timestamp) * 1000).toLocaleDateString("fr-FR", {
        timeZone: "Europe/Paris", day: "numeric", month: "short",
      }),
      value:  parseInt(d.value),
      rating: LABELS[d.value_classification] ?? d.value_classification,
    }));

    return Response.json({ score, rating, prevClose, prevWeek, prevMonth, history, source: "alternative.me" });
  } catch {
    return Response.json({ score: 50, rating: "Neutre", prevClose: 50, prevWeek: 50, prevMonth: 50, history: [], source: "fallback" });
  }
}
