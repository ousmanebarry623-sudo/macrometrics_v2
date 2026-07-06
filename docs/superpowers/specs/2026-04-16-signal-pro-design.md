# Signal PRO — Design Spec
**Date :** 2026-04-16  
**Branche :** feature/market-regime-detector  
**Statut :** Approuvé

---

## 1. Objectif

Ajouter un panel **Signal PRO** sous la page Signal existante (`app/signal/page.tsx`). Ce panel fusionne les signaux techniques de l'indicateur ELTE SMART avec les données macro/sentiment de MacroMetrics pour produire un signal directionnel institutionnel enrichi (BUY / SELL / NEUTRAL).

---

## 2. Architecture & Data Flow

### Approche retenue : Approche 1 — Enrichissement de `DashMetrics` + nouveau composant

```
ElteSmartDashboard
  → onMetrics(enrichedMetrics)   ← position, sensitivity, tfBulls, trend, volume, momentum, volatility
  → SignalPage (metricsRef)
       ↓
  SignalProPanel
    ├─ TechnicalScore  ← enrichedMetrics (local, zéro fetch supplémentaire)
    ├─ MacroScore      ← /api/signal-analysis (cache 30 min, existant)
    │                  + /api/market-regime   (cache Redis, existant)
    └─ SignalProScore = 0.55 × TechnicalScore + 0.45 × MacroScore
```

### Fichiers à modifier / créer

| Fichier | Action |
|---|---|
| `components/ElteSmartDashboard.tsx` | Étendre `DashMetrics` : ajouter `tfBulls: (boolean \| null)[]`, `position: "Buy" \| "Sell"`, `sensitivity: number` |
| `components/SignalProPanel.tsx` | Nouveau composant — logique + UI complète |
| `app/signal/page.tsx` | Ajouter `<SignalProPanel>` sous la zone chart |

### Re-render automatique
Le panel se recalcule à chaque changement de `yfSymbol` ou `tfLabel` via `useEffect` sur ces deux props.

---

## 3. Formules de Scoring

### 3.1 Technical Score (0–100) — depuis `enrichedMetrics` (local, zéro API)

| Indicateur | Points max | Logique |
|---|---|---|
| Supertrend direction | 20 | position === "Buy" → +20, sinon 0 |
| Multi-TF consensus (11 TFs) | 20 | `(bullCount / 11) × 20` |
| EMA200 trend | 15 | trend === "Bullish" → +15, sinon 0 |
| Trend strength % | 15 | `min(15, trendStrength / 100 × 15)` |
| Momentum MACD | 10 | momentum === "Bullish" → +10, sinon 0 |
| Volume confirmation | 10 | volume === "Bullish" → +10, sinon 0 |
| Volatility state | 5 | Expanding/Trending → +5, Ranging → +2 |
| Sensitivity (proxy ADX) | 5 | sens ≥ 3.5 → +5, ≥ 3.0 → +3, sinon +1 |

### 3.2 Macro Score (0–100) — depuis `/api/signal-analysis` + `/api/market-regime`

| Source | Points max | Logique |
|---|---|---|
| COT institutionnel (z-score) | 30 | `min(30, abs(instNetZ) / 3.5 × 30)` directionnel selon `instBias` |
| Sentiment retail (contrarian MyFXBook) | 25 | extrême contrarien → 25, proportionnel sinon |
| Surprises macro (TradingView calendar) | 20 | `min(20, abs(fundNet) / 5 × 20)` selon direction |
| Saisonnalité | 15 | Bullish → +15, Neutral → +7, Bearish → 0 |
| Market Regime | 10 | Risk-On → +10, Mixed → +5, Transition → +3, Risk-Off → 0 |

### 3.3 Fusion finale

```
SignalProScore = round(0.55 × TechnicalScore + 0.45 × MacroScore)
Signal → BUY   si SignalProScore > 60
         SELL  si SignalProScore < 40
         NEUTRAL sinon
```

### 3.4 Confidence (0–100)

Basée sur 4 critères additifs :
1. **Cohérence technique** — % de TFs dans le même sens que le signal (0–25)
2. **Cohérence macro** — nb facteurs macro alignés / 5 × 25 (0–25)
3. **Accord technique ↔ macro** — même direction → +25, sinon 0 (0–25)
4. **Intensité** — abs(instNetZ)/3.5 × 15 + trendStrength/100 × 10 (0–25)

Niveau : HIGH ≥ 65, MEDIUM ≥ 45, LOW < 45

### 3.5 Horizon temporel

| Condition | Horizon |
|---|---|
| TechnicalScore > 70 ET MacroScore < 50 | Intraday (< 24h) |
| TechnicalScore > 55 ET MacroScore > 55 | Swing (3–7 jours) |
| MacroScore > 65 ET COT dominant | Position (2–4 semaines) |
| Sinon | Swing (1–3 jours) |

---

## 4. Divergences — Règles de détection

| Condition | Message affiché |
|---|---|
| position === "Buy" ET instBias === "Bearish" | "Supertrend haussier mais COT baissier → divergence technique/institutionnel" |
| trend === "Bullish" ET instBias === "Bearish" | "EMA200 haussière mais COT baissier → attention à la structure long terme" |
| retail longPct > 65 | `"Retail ${longPct}% long → signal contrarien baissier"` |
| retail longPct < 35 | `"Retail ${longPct}% short → signal contrarien haussier"` |
| position === "Buy" ET regime === "RISK_OFF" | "Supertrend haussier mais régime Risk-Off → contexte macro défavorable" |
| bullCount >= 8 ET macroSignal === "SELL" | "Multi-TF fortement haussier mais macro baissière → divergence majeure" |
| seasonal.bias aligne avec signal | `"Saisonnalité ${seasonal.month} ${seasonal.bias} → confirmation saisonnière"` |

---

## 5. UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚡ SIGNAL PRO                              [↻ refresh] [LIVE •]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐ │
│   │   BUY / SELL    │  │  Confidence  84  │  │  Horizon          │ │
│   │   EURUSD        │  │  ████████░░ Gauge│  │  Swing 3–7 jours  │ │
│   │   Score: 76     │  │  HIGH            │  │  + probabilité %  │ │
│   └─────────────────┘  └──────────────────┘  └───────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  TECHNICAL  (score: 79)        │  MACRO  (score: 72)                │
│  Supertrend    ● Bullish       │  COT           ● Bullish           │
│  MACD          ● Bullish       │  Retail        ● Contrarian Bull   │
│  EMA200        ● Bullish       │  Saisonnalité  ● Neutral           │
│  TF Consensus  9/11 Bull       │  Macro         ● Neutral           │
│  Volume        ● Confirming    │  Regime        ● Risk-On           │
│  Volatility    ● Trending      │                                    │
│  Momentum      ● Bullish       │                                    │
│  Sensitivity   3.5             │                                    │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠ DIVERGENCES DÉTECTÉES                                            │
│  • Retail 76% short → signal contrarien fort                        │
│  • Supertrend bullish + EMA200 bullish → structure confirmée        │
├──────────────────────────────────────────────────────────────────────┤
│  📋 RÉSUMÉ AUTO                                                      │
│  Signal haussier car Supertrend, MACD et EMA200 sont alignés avec   │
│  un COT bullish et un régime Risk-On. Retail contrarien renforce     │
│  la conviction.                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Détails visuels
- **Fond :** `#0d0d1a`, border `1px solid #1c1c38`, borderRadius 12px
- **Signal direction :** BUY = `#22c55e`, SELL = `#ef4444`, NEUTRAL = `#475569`
- **Confidence gauge :** barre de progression SVG ou CSS, couleur dynamique (rouge → orange → vert)
- **Bullets :** vert/rouge selon direction, gris si neutre
- **Loading :** skeleton animé pendant les fetches macro
- **Responsive :** colonnes Technical/Macro en colonne verticale sur mobile

---

## 6. Interface TypeScript

### `DashMetrics` étendue (dans `ElteSmartDashboard.tsx`)
```ts
export interface DashMetrics {
  trend:       string;
  volume:      string;
  momentum:    string;
  volatility:  string;
  barsSince:   number;
  // Nouveaux champs pour Signal PRO
  position:    "Buy" | "Sell";
  sensitivity: number;
  tfBulls:     (boolean | null)[];
  trendStrength: number;
}
```

### `SignalProResult` (dans `SignalProPanel.tsx`)
```ts
interface SignalProResult {
  pair:            string;
  signal:          "BUY" | "SELL" | "NEUTRAL";
  confidence:      number;
  confLevel:       "HIGH" | "MEDIUM" | "LOW";
  horizon:         string;
  technicalScore:  number;
  macroScore:      number;
  signalProScore:  number;
  factors: {
    technical: TechnicalFactors;
    macro:     MacroFactors;
  };
  divergences:     string[];
  resume:          string;
}
```

---

## 7. Contraintes & Limites

- Le panel n'a pas de sélecteur de paire propre — il suit toujours la paire sélectionnée en haut.
- `/api/signal-analysis` est en cache 30 min côté serveur — les données macro ne sont pas temps-réel.
- `/api/market-regime` utilise Redis (disponible en prod Vercel).
- Pas de persistance du résultat Signal PRO — recalcul à chaque render/refresh.
- Sur les paires non couvertes par `/api/signal-analysis` (ex: MXN crosses), le MacroScore utilise les données disponibles et ignore les manquantes.
