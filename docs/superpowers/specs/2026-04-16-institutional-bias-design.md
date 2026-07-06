# Institutional Bias — Design Spec
**Date :** 2026-04-16  
**Branche :** feature/market-regime-detector  
**Statut :** Approuvé

---

## 1. Objectif

Refondre le moteur de scoring du **BIAIS JOURNALIER** avec une logique institutionnelle complète (Smart Money Concepts, spreads obligataires, Market Regime, corrélations DXY/VIX) pour proposer les **6 meilleurs trades du jour** (vs 3 actuellement), avec zone d'entrée M15, SL et TP calculés depuis la structure de marché. Position max 2 jours.

---

## 2. Architecture & Data Flow

### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `lib/smc-engine.ts` | Détection BOS/CHoCH + Order Blocks sur OHLCV D1/H4/H1 |
| `lib/bond-spreads.ts` | Fetch rendements obligataires par pays (Yahoo Finance + FRED) |
| `lib/institutional-bias.ts` | Moteur de scoring institutionnel principal |
| `app/api/institutional-bias/route.ts` | Endpoint Next.js, cache Redis 15 min |

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `components/DailyBiasCard.tsx` | Consomme `/api/institutional-bias`, affiche 6 paires + zones d'entrée |

### Flux de données

```
Yahoo Finance OHLCV (D1 50c + H4 100c + H1 50c)  →  lib/smc-engine.ts       ─┐
Yahoo Finance (^TNX, FRED bond yields)             →  lib/bond-spreads.ts     ─┤
/api/market-regime (existant, Redis)               ────────────────────────── ─┤→ lib/institutional-bias.ts
/api/signal-analysis (existant, COT+Macro+Sent+Seas)───────────────────────── ─┘   → /api/institutional-bias
                                                                                      → DailyBiasCard (Top 6)
```

### Hiérarchie temporelle (M15 entry, max 2j)
- **D1** → biais macro + structure BOS/CHoCH principale
- **H4** → Order Blocks valides, confirmation de direction
- **H1** → alignement EMA50
- **M15** → zone d'entrée précise depuis l'Order Block H4

### Rétrocompatibilité
- `/api/signal-analysis` reste intact (utilisé par Signal PRO)
- Fallback dans `DailyBiasCard` : si `/api/institutional-bias` échoue → top 3 de l'ancien système

---

## 3. Formule de Scoring Institutionnel (0–100)

### 4 couches additives

| Couche | Poids total | Composantes |
|---|---|---|
| **Macro/Fondamental** | 40 pts | COT z-score diff (15) + Surprises macro (10) + Spread obligataire (10) + Saisonnalité graduée (5) |
| **Sentiment/Positionnement** | 20 pts | Retail contrarien (10) + Market Regime Risk-On/Off (10) |
| **Structure SMC** | 30 pts | D1 BOS/CHoCH direction (15) + H4 Order Block proximité (10) + H1 EMA50 alignement (5) |
| **Confluence** | 10 pts | Corrélation DXY (5) + VIX regime (5) |

### Détail couche Macro (40 pts)

**COT z-score (15 pts)**  
`instNetZ = baseZ − quoteZ` (déjà calculé dans signal-analysis)  
Score = `min(15, |instNetZ| / 3.5 × 15)` × direction (1 si aligné avec signal, 0 sinon)

**Surprises macro (10 pts)**  
`fundNet = baseScore − quoteScore` (déjà calculé)  
Score = `min(10, |fundNet| / 5 × 10)` × direction

**Spread obligataire (10 pts)**  
Score = `min(10, |spread_bps| / 100 × 10)` × direction (spread favorable = base country rendement > quote)

| Paire | Spread |
|---|---|
| EUR/USD | US10Y − DE10Y |
| GBP/USD | US10Y − GB10Y |
| USD/JPY | US10Y − JP10Y |
| USD/CAD | US10Y − CA10Y |
| AUD/USD | AU10Y − US10Y |
| NZD/USD | NZ10Y − US10Y |
| USD/CHF | US10Y − CH10Y |
| Crosses | Spread entre les deux devises concernées |
| XAU/USD, XAG/USD | US real yield (10Y TIPS, négatif = haussier gold) |
| WTI | Ignoré (0 pts) |

**Sources yields** : Yahoo Finance (`^TNX`=US, `^BUND` via FRED `IRLTLT01DEM156N`, `^JGB` via FRED `IRLTLT01JPM156N`, etc.)  
**FRED endpoint** (gratuit, sans clé) : `https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01XXM156N`

**Saisonnalité graduée (5 pts)**  
Actuellement binaire (−1/0/+1). Nouveau : utiliser `avgReturn` de Google Sheets.  
Score = `min(5, |avgReturn| / 2 × 5)` × direction

### Détail couche Sentiment (20 pts)

**Retail contrarien (10 pts)**  
- longPct ≤ 30 → +10 (BUY), longPct ≥ 70 → +10 (SELL)  
- longPct 30–40 → +7 / 60–70 → +7  
- longPct 40–45 → +3 / 55–60 → +3  
- 45–55 → 0

**Market Regime (10 pts)**  
- `RISK_ON` → +10 pour BUY sur paires risk / −10 pour SELL  
- `RISK_OFF` → +10 pour SELL sur paires risk / +10 pour BUY sur JPY, CHF, XAU  
- `MIXED` / `TRANSITION` → +4  
- Paires risk : AUD, NZD, CAD, GBP, EUR, indices, commodités  
- Paires refuge : JPY, CHF, XAU, XAG

### Détail couche SMC (30 pts)

**D1 BOS/CHoCH (15 pts)**  
- BOS dans direction du signal (continuation) → +15  
- CHoCH récent (≤ 5 bougies D1) dans direction → +15  
- Structure RANGING → 0

**H4 Order Block (10 pts)**  
- OB valide non retesté, prix actuel dans la zone OB (±0.5% du prix mid) → +10  
- OB valide, prix à moins de 0.8% de la zone → +6  
- OB présent mais prix loin → +2

**H1 EMA50 alignement (5 pts)**  
- Prix au-dessus EMA50 H1 + signal BUY → +5  
- Prix en-dessous EMA50 H1 + signal SELL → +5  
- Sinon → 0

### Détail couche Confluence (10 pts)

**Corrélation DXY (5 pts)**  
- Signal SELL USD-based + DXY en tendance baissière D1 → +5  
- Signal BUY USD-based + DXY en tendance haussière D1 → +5  
- Signal sur cross non-USD → 0 (ignoré)  
- DXY ticker : `DX-Y.NYB` Yahoo Finance

**VIX regime (5 pts)**  
- VIX < 18 + signal BUY risk → +5  
- VIX > 25 + signal SELL risk → +5  
- VIX > 25 + signal BUY refuge (JPY, CHF, XAU) → +5  
- VIX ticker : `^VIX` Yahoo Finance

### Sélection Top 6

1. Calculer le score sur les 33 paires  
2. Filtrer : score ≥ 60 ET ≥ 3 couches non-nulles  
3. Séparer BUY et SELL  
4. Prendre top 3 BUY (score desc) + top 3 SELL (score desc)  
5. Si < 3 dans un sens → combler avec les suivants de l'autre sens  

---

## 4. Moteur SMC (`lib/smc-engine.ts`)

### Inputs
```ts
interface SMCInput {
  pair:    string;
  d1:      OHLCV[];   // 50 bougies
  h4:      OHLCV[];   // 100 bougies
  h1:      OHLCV[];   // 50 bougies
}

interface OHLCV {
  time:  number;  // timestamp
  open:  number;
  high:  number;
  low:   number;
  close: number;
  volume?: number;
}
```

### Outputs
```ts
interface SMCResult {
  structure:    "BULLISH" | "BEARISH" | "RANGING";
  lastEvent:    "BOS" | "CHOCH" | "NONE";
  lastEventAge: number;       // nombre de bougies D1 depuis l'événement
  orderBlock: {
    valid:     boolean;
    direction: "BUY" | "SELL";
    high:      number;
    low:       number;
    mid:       number;
    age:       number;         // bougies H4 depuis formation
  } | null;
  ema50H1:      number;
  currentPrice: number;
}
```

### Algorithme BOS/CHoCH

```
1. Calculer ATR(14) sur D1
2. Identifier les pivots (swing high = max local sur fenêtre 5 bougies, filtre ATR > 0.5×ATR14)
3. Garder les 5 derniers pivots significatifs
4. Classifier :
   - 2 derniers HH + HL → BULLISH
   - 2 derniers LH + LL → BEARISH
   - Sinon → RANGING
5. BOS : cassure du dernier pivot dans le sens de la structure (continuation)
6. CHoCH : cassure du dernier pivot dans le sens opposé (retournement)
7. lastEventAge = index depuis le dernier BOS ou CHoCH
```

### Algorithme Order Block

```
1. Sur H4, calculer ATR(14)
2. Pour chaque bougie de 0 à -80 :
   - Si bougie baissière suivie d'un mouvement haussier ≥ 1.5×ATR → potentiel BUY OB
   - Si bougie haussière suivie d'un mouvement baissier ≥ 1.5×ATR → potentiel SELL OB
3. Vérifier que le prix n'a jamais retouché la zone (invalide si retest)
4. Retenir l'OB le plus récent et valide dans la direction du signal
```

### Zone d'entrée M15
```
BUY  OB → entryZone = { low: OB.low, high: OB.high }
          stopLoss  = OB.low × (1 − 0.0015)   // 15 pips buffer
          target1   = prochain swing high D1
          target2   = prochain swing high D1 + ATR(14) D1

SELL OB → entryZone = { low: OB.low, high: OB.high }
          stopLoss  = OB.high × (1 + 0.0015)
          target1   = prochain swing low D1
          target2   = prochain swing low D1 − ATR(14) D1
```

---

## 5. Bond Spreads (`lib/bond-spreads.ts`)

### Sources

```
US  10Y : Yahoo Finance ^TNX (disponible)
DE  10Y : FRED  IRLTLT01DEM156N (gratuit, sans clé)
GB  10Y : FRED  IRLTLT01GBM156N
JP  10Y : FRED  IRLTLT01JPM156N
CA  10Y : FRED  IRLTLT01CAM156N
AU  10Y : FRED  IRLTLT01AUM156N
NZ  10Y : FRED  IRLTLT01NZM156N
CH  10Y : FRED  IRLTLT01CHM156N
US TIPS : Yahoo Finance ^TIP ou FRED DFII10 (real yield)
```

**FRED URL pattern** : `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}`  
**Fréquence** : données mensuelles (suffisant pour biais journalier)  
**Cache** : Redis 6h (les spreads ne changent pas intraday)  
**Fallback** : si FRED timeout → utiliser dernière valeur en cache, sinon 0 pts

### Output
```ts
interface BondSpread {
  pair:        string;
  baseYield:   number;   // % annualisé
  quoteYield:  number;
  spread_bps:  number;   // (base − quote) × 100
  direction:   "FAVORABLE" | "UNFAVORABLE" | "NEUTRAL";
  source:      "live" | "cache" | "fallback";
}
```

---

## 6. Endpoint (`app/api/institutional-bias/route.ts`)

### Appels parallèles à l'initialisation
```ts
const [signals, regime, bondSpreads] = await Promise.all([
  fetch("/api/signal-analysis").then(r => r.json()),
  fetch("/api/market-regime").then(r => r.json()),
  fetchBondSpreads(),   // lib/bond-spreads.ts
]);

// OHLCV fetché en parallèle pour toutes les paires (batches de 5)
const smcResults = await fetchAllSMC(pairs);  // lib/smc-engine.ts
```

### Cache Redis
- TTL : **15 minutes** (compromis fraîcheur/performance)
- Clé : `institutional-bias:v1`
- Force refresh : `?force=1`

### Response type
```ts
interface InstitutionalBiasResponse {
  top6:      InstitutionalPairSignal[];
  regime:    RegimeType;
  dxyTrend:  "BULLISH" | "BEARISH" | "NEUTRAL";
  vix:       number;
  updatedAt: string;
}

interface InstitutionalPairSignal {
  pair:        string;
  category:    "Major" | "Cross" | "Commodity";
  direction:   "BUY" | "SELL";
  score:       number;          // 0–100
  layers: {
    macro:      number;         // 0–40
    sentiment:  number;         // 0–20
    smc:        number;         // 0–30
    confluence: number;         // 0–10
  };
  smcContext: {
    structure:    "BULLISH" | "BEARISH" | "RANGING";
    lastEvent:    "BOS" | "CHOCH" | "NONE";
    hasValidOB:   boolean;
    obZone:       { low: number; high: number } | null;
  };
  entry: {
    zone:    { low: number; high: number };
    stopLoss: number;
    target1:  number;
    target2:  number;
    holdMax:  "48h";
    rr1:      number;   // Risk/Reward TP1
    rr2:      number;   // Risk/Reward TP2
  };
  arguments:   string[];   // 3 phrases en français
  bondSpread:  number;     // spread_bps
}
```

---

## 7. UI — `components/DailyBiasCard.tsx`

### Header enrichi
```
┌──────────────────────────────────────────────────────┐
│  BIAIS JOURNALIER                    RAJ 15:11  ↻    │
│  Morning brief · COT · SMC · Bonds · Régime          │
│  ● RISK_ON    DXY ↓    VIX 14.2                      │
└──────────────────────────────────────────────────────┘
```

### Top 6 avec niveaux
```
#1  EUR/GBP  Cross   ↓ BAISSIER   88
    📊 BOS D1 ✓  OB H4 ✓  Spread +45bp  COT ✓
    Entrée: 0.8412–0.8425 | SL: 0.8460 | TP1: 0.8350 | R/R: 1.4
    ⏱ Max 48h
```

### Expansion au clic (détail par paire)
- Barres de score par couche (Macro / Sentiment / SMC / Confluence)
- Contexte SMC : badge `BOS` ou `CHoCH` + âge
- Bond spread en bps
- 3 arguments en français
- Bouton "Voir sur le graphique" → sélectionne la paire dans TradingView

### Fallback
Si `/api/institutional-bias` échoue → affiche les 3 paires de `/api/signal-analysis` avec mention "Mode basique"

---

## 8. Contraintes & Limites

- **FRED API** : gratuit, sans clé, données mensuelles (mises à jour ~1× par mois). Cache 6h suffisant.
- **OHLCV Yahoo Finance** : 33 paires × 3 TF = 99 appels → batché par 5 avec délai 100ms entre batches
- **SMC detection** : algorithmique (pas ML) — résultats déterministes, pas de faux positifs coûteux
- **Pas de signal sur indice/crypto** dans le Top 6 (trop de bruit sur 48h) → XAU/XAG/WTI uniquement pour commodités
- **Niveaux SL/TP** : indicatifs, basés sur structure — ne remplacent pas la gestion de risque personnelle
- **Pas de WebSocket** : refresh toutes les 15 min (bouton manuel disponible)
