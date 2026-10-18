# Annahmen und Abweichungen

Fachliche Festlegungen, wo die Spezifikation Spielraum lässt. Bei Unklarheit gilt die konservativere
Annahme (Spezifikation Abschnitt 0, Punkt 4). Formeln stehen in `MODEL.md`.

## Zeitachse und Zahlungszeitpunkte

**A1 – Horizont einschließlich.** Das Jahr, in dem `planningHorizonAge` erreicht wird, wird noch
simuliert (`N = H − currentAge + 1`). Das Depot muss damit ein Jahr länger tragen als bei einem
exklusiven Horizont (konservativ). „Vermögen mit X“ bezeichnet den Bestand am Ende des Jahres, in dem
das Alter X erreicht wird. Die Restlaufzeit der VPW-Annuität zählt das laufende Jahr mit
(`n = H − Alter + 1`).

**A2 – Zahlungen zu Jahresbeginn.** Sparrate, Konsum und Einmalausgaben fallen zu Jahresbeginn an
(Spezifikation Abschnitt 7), Renditen wirken danach auf den Restbestand, Rebalancing erfolgt zum
Jahresende.

**A3 – Preisindex je Zeitpunkt.** Zahlungen zu Jahresbeginn werden mit dem Index zu Jahresbeginn,
Bestände zum Jahresende mit dem Index zum Jahresende in heutige Kaufkraft umgerechnet. Die
Jahreszeile führt dafür neben `inflationIndex` (Jahresbeginn) zusätzlich `inflationIndexEnd`
(Erweiterung von `YearResult`).

**A4 – Phasen.** Erwerb vor `retirementAge`, Überbrückung bis `statePension.startAge`, danach Rente.
Liegt der Rentenbeginn vor dem Ruhestand, gibt es keine Überbrückungsphase.

## Renditen und Kosten

**A5 – Deterministischer Referenzpfad mit exakter geometrischer Rendite.** Verwendet wird
`(1 + μ) / √(1 + σ²/(1 + μ)²) − 1`, der Median von `1 + r` unter der Lognormalannahme, nicht die
Näherung `μ − σ²/2`. Das gilt für alle vier Reihen einschließlich Inflation; dadurch liegt die
Referenzinflation geringfügig unter `μ_π` (Default: 1,989 % statt 2,0 %). Die Konsistenz mit dem
Median der späteren Monte-Carlo-Pfade hat hier Vorrang.

**A6 – TER multiplikativ.** `(1 + r)(1 − TER) − 1`, entsprechend einer täglichen Abgrenzung im
Fondsvermögen. Cash (Tagesgeld) hat keine laufenden Kosten.

## Flüsse, Konsum und Erfolg

**A7 – Saldierung in der Erwerbsphase.** Einmalausgaben in der Erwerbsphase werden zuerst aus der
Sparrate gedeckt; nur ein verbleibender Fehlbetrag wird durch Verkäufe finanziert, ein Überschuss
investiert. Ohne Steuern ist das identisch mit „erst verkaufen, dann sparen“ (Abschnitt 7,
Schritte 4 und 5); mit Steuern vermeidet es unnötige Gewinnrealisierungen.

**A8 – Konsum in der Erwerbsphase** wird nicht modelliert (`netConsumption = 0`), weil die Sparrate
netto eingegeben wird. Die Erfolgsprüfung beginnt mit `retirementAge`.

**A9 – Vorrang des laufenden Konsums.** Reicht das Depot nicht, wird zuerst der laufende Konsum und
erst danach eine Einmalausgabe finanziert. Die Erfolgsprüfung vergleicht nur den laufenden Konsum mit
dem Mindestkonsum, damit eine finanzierte Einmalausgabe kein Fehljahr verdeckt (konservativ).
Finanzierte Einmalausgaben stehen in `oneOffSpending` (Erweiterung von `YearResult`).

**A10 – Fehlbetrag** ist der Abstand des finanzierten laufenden Konsums zum inflationierten
Mindestkonsum, nicht zum gewünschten Konsum. Fehlbeträge unter 1 Cent gelten als Rundungsrauschen.

**A11 – Mindestkonsum ohne Ausgabenprofil.** Das Ausgabenprofil skaliert den Betrag der
Entnahmeregel (auch bei VPW), nicht den Mindestkonsum. Ein Profilfaktor, der den Konsum unter den
Mindestkonsum drückt, erzeugt deshalb Fehljahre.

**A12 – Verkäufe bei erschöpfter Anlageklasse.** Ist eine Klasse beim proportionalen Verkauf zu
klein, tragen die übrigen den Rest anteilig zur Zielallokation; haben sie Zielgewicht 0, anteilig zu
ihrem Bestand.

**A13 – Steueroptimierte Flusssteuerung.** `rebalancing.taxAware` lenkt Zuflüsse in untergewichtete
und Abflüsse aus übergewichteten Klassen. Die Logik ist bereits in M1 umgesetzt, weil sie Teil der
Flusssteuerung der fixen Allokation ist und im Default-Szenario aktiv ist.

**A14 – Rebalancing-Band einschließlich.** Eine Abweichung, die das Band erreicht („ab der“), löst
ein vollständiges Rebalancing auf die Zielallokation aus. `band = 0` bedeutet jährliches Rebalancing.

**A15 – Startdepot.** `totalValue` wird nach der Zielallokation im Startalter aufgeteilt.

## Validierung

**A16 – Allokationssumme.** Die Strategien geben Aktien- und Cash-Anteil vor, Anleihen sind der Rest.
Eine Summe ≠ 1 zeigt sich daher als `equity + cash > 1` und wird abgelehnt. Für explizite
Allokationen mit drei Anteilen gibt es zusätzlich `allocationSchema` (Summe = 1 ± 1e−9).

**A17 – Korrelationsmatrix strikt positiv definit.** Pivotelemente der Cholesky-Zerlegung müssen
größer als 1e−12 sein; perfekte Korrelationen (nur positiv semidefinit) werden abgelehnt.

**A18 – Weitere Plausibilitätsregeln.** Die Hochrechnung der Rente darf den bisherigen Anspruch nicht
unterschreiten. Einmalausgaben müssen zwischen aktuellem Alter und Horizont liegen.
`costBasisShare` darf über 1 liegen (nicht realisierter Verlust). Für `student-t` ist `studentDf > 2`
Pflicht (endliche Varianz).

## Historische Daten und Marktmodelle

**A20 – Jahreskonvention der historischen Daten.** Jahr Y reicht von Januar Y bis Januar Y+1 auf
Basis von Shillers Monatsdurchschnitten. Das glättet einzelne Jahre gegenüber Stichtagswerten.
Details in `DATA_SOURCES.md`.

**A21 – Kurzfristiger Zins ab 2012.** Shillers Reihe R endet 2011. Fortgeschrieben wird nach
Shillers eigener Konstruktion mit dem 6-Monats-T-Bill-Satz (FRED TB6MS). Dieser lag 1998–2011 im
Mittel 0,47 Prozentpunkte unter R; die Cash-Rendite ab 2012 ist dadurch eher konservativ.

**A22 – Datenfenster.** `market.bootstrap.fromYear`/`toYear` begrenzen die Daten für beide
historischen Modelle, nicht nur für den Bootstrap. Fehlende Folgejahre setzt `historical-sequence`
zyklisch mit dem ersten Jahr des Fensters fort.

**A23 – Pfadanzahl historischer Sequenzen.** `historical-sequence` erzeugt je Startjahr einen Pfad
und ignoriert `simulation.paths`. Weil sich die Fenster überlappen, unterschätzt der Standardfehler
`√(p(1−p)/N)` hier die tatsächliche Unsicherheit.

**A24 – Deterministisches Modell im Monte Carlo.** Alle Pfade wären identisch; es wird ein Pfad
gerechnet, die Erfolgsquote ist 0 oder 1.

**A25 – Korrelation auf Log-Renditen.** Die Zielkorrelation wird auf die normalverteilten Schocks
angewendet und gilt damit exakt für `ln(1 + r)`. Für einfache Renditen weicht sie bei den
Default-Parametern um höchstens 0,0005 ab.

**A26 – Plausibilitätsanker nicht erreicht.** Die Spezifikation erwartet für historische Sequenzen
ab 1926 (50/50, 4 % real, 30 Jahre, ohne Steuern und Kosten) eine Erfolgsquote ≥ 95 %. Mit den
Shiller-Daten ergeben sich 65 von 71 Fenstern (91,5 %); es scheitern die Startjahre 1964–1969,
jeweils erst ab dem 26. Entnahmejahr. Geprüft wurde:

- Eine unabhängige Nachrechnung in Python aus den Monatsdaten liefert denselben Wert.
- Mit anderen Startmonaten der Jahreskonvention (Februar bis Dezember) liegt die Quote zwischen
  91,5 % und 94,4 %.
- Mit 3,9 % Entnahme sind es 97,2 %, über alle Startjahre ab 1871 bei 4 % 95,2 %.

Bengen (1994) verwendete mittelfristige US-Staatsanleihen, die Trinity-Studie (1998) langfristige
Unternehmensanleihen; die Spezifikation schreibt 10-jährige Staatsanleihen (Shiller) vor. Daten und
Modell wurden nicht angepasst; der Test prüft das reproduzierbare Ergebnis. Entscheidung über die
Schwelle offen.

**A27 – Student-t.** Der Median von `1 + r` entspricht dem lognormalen Modell. Das arithmetische
Mittel der einfachen Renditen liegt dagegen über `μ` und ist theoretisch unbeschränkt, weil
`E[exp(σ·t)]` für t-verteilte Schocks nicht existiert; die Untergrenze bleibt −100 %. Die gemeinsame
Chi-Quadrat-Mischung gibt auch Cash und Inflation dicke Ränder. Umsetzung wie spezifiziert.

**A28 – Zufallsströme.** Jeder Pfad hat einen eigenen Strom aus `SplitMix32(seed + Pfadindex)`.
Die Ziehungsreihenfolge je Jahr ist fest (vier Normale, dann gegebenenfalls Chi-Quadrat), damit
Läufe reproduzierbar bleiben.

## Kennzahlen und Ausführung

**A29 – Definitionen der Kennzahlen.**

- Ein Depot gilt als erschöpft, wenn es zum Jahresende weniger als 1 Cent enthält. VPW erschöpft
  das Depot planmäßig im Horizontjahr.
- „Frühester Kapitalverzehr“ ist die Ordnungsstatistik an Position ⌈0,1 · N⌉ der
  Erschöpfungsalter, ohne Interpolation.
- Der Expected Shortfall mittelt die ⌈0,1 · N⌉ niedrigsten realen Endvermögen.
- Die Portfolio-CAGR rechnet nur über Jahre mit investiertem Kapital.

Die sterblichkeitsgewichtete Sicht folgt mit dem Langlebigkeitsmodul (M3); sichere Entnahme, PWR
und FIRE-Status mit M6.

**A30 – Worker und Pakete.** Pool mit `min(4, Kerne − 1)` Workern, Pakete zu 250 Pfaden. Ein Abbruch
verwirft laufende Pakete und vergibt keine neuen; ein bereits gestartetes Paket rechnet im Worker
noch zu Ende.

## Umfang der Engine

**A19 – Engine-Umfang.** Die Engine rechnet bis einschließlich M2 ohne Steuern, gesetzliche Rente
und Kranken- und Pflegeversicherung; Pfade sind Bruttopfade. Strategien außer `fixed` und
Entnahmeregeln außer `fixed-real` und `vpw` werden mit `UnsupportedFeatureError` abgelehnt statt still
ersetzt. `vpw` ist vorgezogen, weil das Akzeptanzkriterium von M1 sie verlangt.

## Offene Verifikationen

**V1 – Gompertz-Parameter des Default-Szenarios** (Modalalter 88, Dispersion 10) stammen aus der
Spezifikation und sind eine Näherung. Die Plausibilisierung gegen die Kohortensterbetafeln des
Statistischen Bundesamts erfolgt mit dem Langlebigkeitsmodul (M3).

**V2 – Basiszins 2026** (3,2 % im Default) ist laut Spezifikation gegen das BMF-Schreiben zu prüfen;
Verifikation vor Abschluss von M3.
