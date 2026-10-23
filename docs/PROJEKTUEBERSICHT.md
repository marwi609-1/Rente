# Projektübersicht Ruhestandsplaner

Stand: Version 1.09 (Oktober 2026), Rechtsstand Deutschland 2026.

> Rechenwerkzeug – keine Anlage-, Steuer- oder Rentenberatung.

## Zweck

Der Ruhestandsplaner ist eine Single Page Application für Ruhestands-, FIRE- und Entnahmeplanung
eines Single-Haushalts in Deutschland. Er beantwortet vor allem drei Fragen:

- Reicht das Depot zusammen mit gesetzlicher Rente und weiteren Einkünften bis zum
  Planungshorizont?
- Welcher Netto-Konsum ist bei einer gewünschten Erfolgsquote sicher?
- Ab welchem Alter ist ein Ausstieg aus dem Erwerbsleben möglich (FIRE-Status)?

Gerechnet wird in Jahresschritten, deterministisch oder als Monte-Carlo-Simulation mit bis zu
10.000 Pfaden. Die deutschen Steuer- und Sozialversicherungsregeln sind dabei vollständig
berücksichtigt. Alle Beträge lassen sich real (Euro von heute) oder nominal anzeigen.

## Funktionsumfang

### Eingaben (10 Tabs)

| Tab                 | Inhalt                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Haushalt            | Alter, Ruhestandsalter, Planungshorizont, Geschlecht, Langlebigkeit (fester Horizont, Gompertz oder Destatis-Kohortensterbetafel)                                         |
| Vermögen & Sparen   | Depotwert, Anteil der Anschaffungskosten, Verlustvortrag, Sparrate mit realem Wachstum                                                                                    |
| Konsum & Entnahme   | Netto-Konsum, Mindestkonsum (Erfolgskriterium), Zielvermögen, Entnahmeregel, Ausgabenprofil, Einmalausgaben                                                               |
| Rente               | gesetzliche Rente laut Renteninformation, Rentenbeginn mit Ab- und Zuschlägen, Anpassung                                                                                  |
| Weitere Einkünfte   | Betriebsrente, Riester, Altersvorsorgedepot, Basisrente, private Renten- und Lebensversicherung, sonstige Einnahmen; als Einmalzahlung, lebenslange oder befristete Rente |
| Krankenversicherung | Überbrückung (freiwillig GKV oder PKV), Rentenphase (KVdR bzw. GKV oder PKV), Kinderlosigkeit (PV-Zuschlag)                                                               |
| Steuern             | Sparer-Pauschbetrag, Kirchensteuer, Teilfreistellung, Basiszins der Vorabpauschale, Günstigerprüfung, Fortschreibung des Tarifs mit der Inflation                         |
| Strategie           | Asset Allocation (fix, Glidepath, Bond Tent, Bucket), Rebalancing (Band, steueroptimiert)                                                                                 |
| Markt               | Renditemodell und Parameter für Aktien, Anleihen, Cash und Inflation, Korrelationen, TER                                                                                  |
| Simulation          | Pfadzahl, Seed, Ziel-Erfolgsquote, Ausgabe real oder nominal                                                                                                              |

Jedes Feld hat eine Einheit, einen Hilfetext und zeigt die Meldungen der zod-Validierung direkt am
Feld.

### Rechenmodell

- **Renditemodelle:** deterministisch, lognormal und Student-t (jeweils korreliert über
  Cholesky-Zerlegung), historische Sequenzen und stationärer Block-Bootstrap.
- **Historische Daten aus Sicht eines Anlegers in DM bzw. Euro, 1963–2025:**
  - Aktien bis 2000 DWS Akkumula, ab 2001 MSCI World Net Return EUR
  - rechnerische 10-jährige Bundesanleihe aus Bundesbank-Umlaufsrenditen
  - Dreimonatsgeld (Frankfurt, ab 1999 Euribor)
  - VPI
- **Entnahmeregeln:** fester realer Konsum, Prozent vom Depot, Guyton-Klinger, VPW, Floor &
  Ceiling.
- **Steuern:**
  - Abgeltungsteuer mit Teilfreistellung, Vorabpauschale und Verlustverrechnung
  - Einkommensteuer nach § 32a EStG mit Fünftelregelung
  - Besteuerungsanteil der Rente, Versorgungsfreibetrag
  - Günstigerprüfung, Solidaritätszuschlag, Kirchensteuer
  - Verkäufe werden über einen Fixpunktlöser so hochgerechnet, dass nach Steuern und KV genau der
    Netto-Bedarf gedeckt ist
- **Kranken- und Pflegeversicherung:**
  - KVdR mit Versorgungsbezügen (Freigrenze, Freibetrag)
  - freiwillige GKV auf alle Einnahmen einschließlich Kapitalerträgen
  - PKV mit RV-Zuschuss
- **Erfolgskriterium:** Ein Pfad ist erfolgreich, wenn er in keinem Ruhestandsjahr unter den
  Mindestkonsum fällt und am Horizont das Zielvermögen erreicht. In der sterblichkeitsgewichteten
  Sicht gilt beides bis zum gezogenen Sterbealter.

### Auswertungen

- **Dashboard:**
  - KPI-Karten: Erfolgsquote mit Standardfehler, sichere Entnahme, FIRE-Status, Vermögen mit
    90/95, frühester Kapitalverzehr, Fehlbetrag, Expected Shortfall, Portfolio-CAGR
  - Diagramme: Fan Chart der Vermögensentwicklung, Einkommen und Ausgaben des Median-Pfades
    (Tooltip mit Herkunft der Kapitalertragsteuer), Asset Allocation
- **Monte Carlo:**
  - Verteilungen des Endvermögens, der Erschöpfungs- und der Sterbealter
  - Perfect Withdrawal Rate als Verteilung; bei historischen Sequenzen zusätzlich je Startjahr
- **Heatmap:** Erfolgsquote über Aktienquote und Entnahmerate bzw. Netto-Konsum.
- **Szenarien:**
  - Speicherung in IndexedDB, JSON-Export und -Import
  - Vorlagen „Basis“, „Pessimistisch“, „Optimistisch“
  - Vergleich von bis zu drei Szenarien
- **Annahmen:** Rechtsstand und die gesamte Dokumentation direkt in der App.

Alle Diagramme haben eine Tabellenansicht und funktionieren im hellen und dunklen Design sowie ab
360 px Breite.

## Technik

| Bereich            | Umsetzung                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Oberfläche         | Vue 3, Vuetify 3, Vue Router (Hash-Modus), ECharts über vue-echarts (nur benötigte Module)               |
| Zustand            | Pinia; automatische Neuberechnung 500 ms nach der letzten Eingabe, abbrechbar                            |
| Rechnen            | reines TypeScript in `src/domain/`, deterministisch über eigene Zufallsströme (xoshiro128**, SplitMix32) |
| Parallelisierung   | Web-Worker-Pool mit Comlink, `min(4, Kerne − 1)` Worker, Pakete zu 250 Pfaden                            |
| Validierung        | zod 4 mit deutschen Meldungen                                                                            |
| Persistenz         | IndexedDB über `idb`                                                                                     |
| Build und Qualität | Vite 8, `vue-tsc` (strict), ESLint, Prettier, Vitest mit jsdom                                           |

### Schichten

- `src/domain/` enthält die framework-freie Rechenlogik. ESLint verbietet dort Importe aus Vue,
  Pinia, Vuetify und den App-Schichten.
- `src/workers/` übernimmt die Ablaufsteuerung mit Fortschritt und Abbruch.
- `src/stores/` orchestriert nur und enthält keine Rechenlogik.
- `src/ui/` enthält Ansichten, Formulare, KPI-Karten und Diagramme.
- `src/data/` enthält die gesetzlichen Rechengrößen 2026, die historischen Renditen und die
  Sterbetafeln. Die Datendateien werden von den Skripten unter `scripts/` reproduzierbar erzeugt,
  mit SHA-256 der Quelldateien.

Umfang: rund 12.400 Zeilen Quellcode und 6.400 Zeilen Tests.

## Qualitätssicherung

- Ein Meilenstein gilt als fertig, wenn `npm run typecheck && npm run lint && npm run test`
  fehlerfrei durchlaufen. Aktuell sind das 406 Tests.
- Die Engine wird gegen geschlossene Formeln geprüft:
  - Rentenendwert der Sparphase
  - reale Annuität in der Entnahmephase
  - Perfect Withdrawal Rate auf historischen Pfaden nach der Formel von Early Retirement Now
    (SWR-Serie, Part 8); die Abweichung liegt unter 0,001 €
- Plausibilitätsanker der Spezifikation (Bengen/Trinity, US-Daten ab 1926, 4 %, 50/50):
  91,5 % der Fenster sind erfolgreich statt der geforderten ≥ 95 %. Die Ursache ist die vorgegebene
  Anleihereihe; das Ergebnis ist als Anker akzeptiert (A26). Mit den EUR-Daten sind 33 von 34
  Fenstern erfolgreich.
- Neue Funktionen werden zusätzlich im Produktions-Build im Browser (Chromium) geprüft.

## Dokumentation

| Datei                              | Inhalt                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| [README.md](../README.md)          | Start, Skripte, Aufbau, Stand, Versionierung                                                      |
| [MODEL.md](MODEL.md)               | Modell und Formeln: Jahresschritt, Steuern, KV, Langlebigkeit, Strategien, Suchen, PWR, Testanker |
| [ASSUMPTIONS.md](ASSUMPTIONS.md)   | 92 dokumentierte Annahmen und Entscheidungen (A1–A92)                                             |
| [DATA_SOURCES.md](DATA_SOURCES.md) | Quellen, Stand, Prüfsummen und Nutzungsbedingungen aller Daten und gesetzlichen Werte             |

Grundregel: Historische Daten, Sterbetafeln und gesetzliche Parameter werden nie geschätzt oder
erfunden. Sie stammen aus Primärquellen und sind mit Quelle dokumentiert.

## Versionsverlauf

| Version  | Inhalt                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bis 1.02 | Meilensteine M1–M6: Grundgerüst, Marktmodelle, Monte Carlo, Steuern, Rente, KV, Langlebigkeit, Strategien, Oberfläche, Szenarien, Heatmap, sichere Entnahme, PWR; Gompertz-Vorschlag aus der Kohortensterbetafel |
| 1.03     | Simulation rund 40 % schneller (Sekanten- und Illinois-Löser, Quickselect), Versionsanzeige                                                                                                                      |
| 1.04     | Weitere Einkünfte mit steuerlicher und KV-Einordnung je Produkt                                                                                                                                                  |
| 1.05     | Herkunft der Kapitalertragsteuer im Tooltip; importierte Szenarien werden direkt geladen                                                                                                                         |
| 1.06     | PKV in der Rentenphase                                                                                                                                                                                           |
| 1.07     | Historische Daten auf DM/Euro umgestellt (Akkumula, MSCI World, Bundesbank, Destatis)                                                                                                                            |
| 1.08     | Zielvermögen als Erfolgskriterium, PWR je Startjahr; Prüfanker nach ERN                                                                                                                                          |
| 1.09     | Sterbetafel als Default-Langlebigkeit, Hinweis zur Wirkung des Geschlechts                                                                                                                                       |

## Bekannte Grenzen

- Nur Single-Haushalt; Paare und Hinterbliebenenrenten sind nicht modelliert.
- Erwerbseinkommen ist nicht modelliert. Steuerpflichtige Einkünfte vor dem Ruhestand werden
  pauschal mit 42 % angesetzt.
- Jahresschritte; Zahlungen fallen zu Jahresbeginn an.
- Der Basisanteil des PKV-Beitrags wird konservativ nicht als Vorsorgeaufwand abgezogen (A84).
- Die EUR-Historie umfasst nur 63 Jahre bzw. 34 vollständige, stark überlappende
  30-Jahres-Fenster. Die Akkumula-Renditen bis 2000 enthalten bereits Fondskosten, die TER wird
  zusätzlich abgezogen.
- MSCI-Indexdaten sind lizenzpflichtig. Vor einer Veröffentlichung außerhalb des privaten
  Gebrauchs ist die Nutzung zu klären.

## Mögliche nächste Schritte

- Barwert der gesetzlichen Rente und der weiteren Einkünfte als Kennzahl („entspricht X € Depot“).
- Feld für den steuerlich absetzbaren Basisanteil des PKV-Beitrags.
- Die geschlossene Form nach ERN als Startwert des PWR-Lösers, um die PWR-Berechnung zu
  beschleunigen.
