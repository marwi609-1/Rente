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

## Umfang von Meilenstein 1

**A19 – Engine-Umfang.** Die Engine rechnet in M1 ohne Steuern, gesetzliche Rente und Kranken- und
Pflegeversicherung; der deterministische Pfad ist ein Bruttopfad. Strategien außer `fixed` und
Entnahmeregeln außer `fixed-real` und `vpw` werden mit `UnsupportedFeatureError` abgelehnt statt still
ersetzt. `vpw` ist vorgezogen, weil das Akzeptanzkriterium von M1 sie verlangt.

## Offene Verifikationen

**V1 – Gompertz-Parameter des Default-Szenarios** (Modalalter 88, Dispersion 10) stammen aus der
Spezifikation und sind eine Näherung. Die Plausibilisierung gegen die Kohortensterbetafeln des
Statistischen Bundesamts erfolgt mit dem Langlebigkeitsmodul (M3).

**V2 – Basiszins 2026** (3,2 % im Default) ist laut Spezifikation gegen das BMF-Schreiben zu prüfen;
Verifikation vor Abschluss von M3.
