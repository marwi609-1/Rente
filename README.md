# Ruhestandsplaner

Single Page Application für Ruhestands-, FIRE- und Entnahmeplanung im deutschen Kontext
(Rechtsstand 2026, Single-Haushalt).

> Rechenwerkzeug – keine Anlage-, Steuer- oder Rentenberatung.

## Start

Voraussetzung: Node.js ≥ 20.19.

```bash
npm install
npm run dev
```

| Skript               | Zweck                                         |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Entwicklungsserver                            |
| `npm run build`      | Typprüfung und Produktions-Build nach `dist/` |
| `npm run preview`    | Produktions-Build lokal ausliefern            |
| `npm run test`       | Unit- und Komponententests (Vitest)           |
| `npm run test:watch` | Tests im Watch-Modus                          |
| `npm run lint`       | ESLint und Prettier-Prüfung                   |
| `npm run format`     | Code mit Prettier formatieren                 |
| `npm run typecheck`  | Typprüfung mit `vue-tsc`                      |

## Aufbau

- `src/domain/` – framework-freie Rechenlogik (reines TypeScript, deterministisch, unit-getestet).
  ESLint verbietet dort Importe aus Vue, Pinia, Vuetify und den App-Schichten.
  - `model/` Typen, zod-Schemas, Default-Szenario
  - `random/` xoshiro128**, SplitMix32, Normal-, Gamma- und Chi-Quadrat-Verteilung, Cholesky
  - `market/` Lognormalparameter, geometrische Rendite, Renditemodelle (deterministisch, lognormal,
    Student-t, historische Sequenzen, Block-Bootstrap)
  - `strategy/` Zielallokation, Zu- und Abflüsse, Rebalancing
  - `withdrawal/` Entnahmeregeln, Ausgabenprofil, Einmalausgaben
  - `tax/` Abgeltungsteuer, Vorabpauschale, Verlustverrechnung, Einkommensteuer § 32a,
    Rentenbesteuerung, Jahresabrechnung mit Günstigerprüfung
  - `social/` gesetzliche Rente, Kranken- und Pflegeversicherung
  - `longevity/` fester Horizont, Gompertz, Kohortensterbetafel
  - `engine/` Jahresschritt, Pfad, Monte Carlo, Kennzahlen, Umrechnung real/nominal
- `src/workers/` Web-Worker-Pool (Comlink) und Ablaufsteuerung mit Fortschritt und Abbruch
- `src/data/` gesetzliche Rechengrößen 2026, historische US-Renditen 1871–2025 und
  Destatis-Kohortensterbetafeln ([Quellen](docs/DATA_SOURCES.md)); die Datendateien erzeugen
  `scripts/build_historical_us.py` und `scripts/build_mortality_de.py`
- `src/stores/` Pinia-Stores (Orchestrierung, keine Rechenlogik)
- `src/ui/` Ansichten und Komponenten (Vue 3, Vuetify 3)
- `tests/` spiegelt `src/domain`, dazu Komponententests unter `tests/ui`
- `docs/` [Modell und Formeln](docs/MODEL.md), [Annahmen](docs/ASSUMPTIONS.md),
  [Datenquellen](docs/DATA_SOURCES.md)

## Stand

| Meilenstein | Inhalt                                                             | Status     |
| ----------- | ------------------------------------------------------------------ | ---------- |
| M1          | Grundgerüst, Datenmodell, zod-Validierung, deterministische Engine | umgesetzt  |
| M2          | Zufallszahlen, Marktmodelle, Monte Carlo im Worker                 | umgesetzt¹ |
| M3          | Steuern, Rente, Krankenversicherung, Langlebigkeit                 | umgesetzt  |
| M4          | Strategien und Entnahmeregeln                                      | offen      |
| M5          | UI, Dashboard, Charts                                              | offen      |
| M6          | Szenarien, Heatmap, sichere Entnahme, PWR                          | offen      |

¹ Der Plausibilitätsanker (historische Sequenzen ab 1926, 4 %, 50/50) ergibt mit den Shiller-Daten
91,5 % statt der geforderten ≥ 95 %; siehe [A26](docs/ASSUMPTIONS.md).
