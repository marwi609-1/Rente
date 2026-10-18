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
  - `random/` Cholesky-Zerlegung
  - `market/` Lognormalparameter, geometrische Rendite, deterministischer Renditepfad
  - `strategy/` Zielallokation, Zu- und Abflüsse, Rebalancing
  - `withdrawal/` Entnahmeregeln, Ausgabenprofil, Einmalausgaben
  - `engine/` Jahresschritt, Pfad, Umrechnung real/nominal
- `src/stores/` Pinia-Stores (Orchestrierung, keine Rechenlogik)
- `src/ui/` Ansichten und Komponenten (Vue 3, Vuetify 3)
- `tests/` spiegelt `src/domain`, dazu Komponententests unter `tests/ui`
- `docs/` [Modell und Formeln](docs/MODEL.md), [Annahmen](docs/ASSUMPTIONS.md)

## Stand

| Meilenstein | Inhalt                                                             | Status    |
| ----------- | ------------------------------------------------------------------ | --------- |
| M1          | Grundgerüst, Datenmodell, zod-Validierung, deterministische Engine | umgesetzt |
| M2          | Zufallszahlen, Marktmodelle, Monte Carlo im Worker                 | offen     |
| M3          | Steuern, Rente, Krankenversicherung, Langlebigkeit                 | offen     |
| M4          | Strategien und Entnahmeregeln                                      | offen     |
| M5          | UI, Dashboard, Charts                                              | offen     |
| M6          | Szenarien, Heatmap, sichere Entnahme, PWR                          | offen     |
