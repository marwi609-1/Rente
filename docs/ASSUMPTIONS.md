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

Die sterblichkeitsgewichtete Sicht ist seit M3 umgesetzt, sichere Entnahme, PWR und FIRE-Status
seit M6 (A67–A73).

**A30 – Worker und Pakete.** Pool mit `min(4, Kerne − 1)` Workern, Pakete zu 250 Pfaden. Ein Abbruch
verwirft laufende Pakete und vergibt keine neuen; ein bereits gestartetes Paket rechnet im Worker
noch zu Ende.

## Umfang der Engine

**A19 – Engine-Umfang.** Seit M4 rechnet die Engine alle Strategien und Entnahmeregeln der
Spezifikation; der Platzhalterfehler `UnsupportedFeatureError` aus M1–M3 ist entfallen. `vpw` war
vorgezogen, weil das Akzeptanzkriterium von M1 sie verlangt.

## Strategien und Entnahmeregeln

**A50 – Gleiche Stützstellen.** Haben zwei Stützstellen dasselbe Alter, gilt ab diesem Alter die
spätere. Beim Bond Tent mit `startAge = peakAge` gilt damit am Tiefpunktalter `peakEquity`. Das
Schema verlangt zusätzlich `peakAge < endAge` (sonst würde der Tiefpunkt nie erreicht) und
`peakEquity ≤ min(startEquity, endEquity)`, weil die Spezifikation den Tiefpunkt als Minimum der
Aktienquote definiert.

**A51 – Erwartete Netto-Lücke des Buckets.** Bei `fixed-real` ist sie der inflationierte
Netto-Konsum mit Ausgabenprofil abzüglich der Netto-Rente, die sich nur aus Rente, Einkommensteuer
und KV auf die Rente ergibt (ohne Kapitalerträge, die erst aus den Verkäufen entstehen). Bei den
übrigen Regeln ist sie der depotfinanzierte Konsum laut Regel. Für das Auffüllen zum Jahresende
wird der Regelbetrag des laufenden Jahres mit der Inflation des Jahres fortgeschrieben (`K_t ·
I_{t+1}/I_t`), weil der Depotwert des Folgejahres noch nicht feststeht. Steuern auf künftige
Verkäufe sind im Ziel nicht enthalten.

**A52 – Bucket vor dem Ruhestand.** „Allokation, die sich zum Ruhestandsbeginn ergäbe“: Ziele aus
der erwarteten Lücke im Ruhestandsalter, bezogen auf den aktuellen Depotwert. Der Preisindex wird
mit der geometrischen Inflation (`market.inflation`) bis zum Ruhestand fortgeschrieben und die Lücke
in Kaufkraft des laufenden Jahres zurückgerechnet. Die Allokation wird jährlich neu bestimmt und wie
`fixed` mit Band rebalanciert.

**A53 – Auffüllen der Töpfe.** Zum Jahresende wird Cash aus Anleihen bis zum Ziel aufgefüllt, dann
Anleihen aus Aktien bis zum Ziel. Steuern und KV auf die Verkäufe zahlt Cash; reicht es nicht,
mindern sie den Anleihekauf. Bestände über den Zielen bleiben stehen (keine Verkäufe aus vollen
Töpfen). Überschüsse während des Jahres (etwa Rente über Bedarf) fließen in die Töpfe unter ihrem
Ziel. Für `equity-up-only` zählt die Aktienrendite des Jahres nach TER. Das Rebalancing-Band gilt
für den Bucket im Ruhestand nicht.

**A54 – Guyton-Klinger.** Die Schwellen beziehen sich auf die Rate nach Inflationsausgleich (bzw.
nach dessen Aussetzen), geprüft mit einer relativen Toleranz von 10⁻¹² gegen Gleitkommarauschen.
Eine Kürzung und eine Erhöhung schließen sich im selben Jahr aus. „Letzte 15 Jahre vor dem
Horizont“: höchstens 15 Restjahre einschließlich des laufenden (`H − a + 1 ≤ 15`). Das
Ausgabenprofil skaliert den Regelbetrag nachträglich; der Zustand der Regel enthält es nicht.
Maßgeblich für „negative Depotrendite“ ist die nominale Portfoliorendite des Vorjahres.

**A55 – Floor-Ceiling real.** Untergrenze und Obergrenze sind `floorFactor` bzw. `ceilingFactor` ×
`netConsumption` × `I_t`, also real fest.

**A56 – Steueroptimiertes Rebalancing.** „Bevorzugt über Zu- und Abflüsse“ wird über drei Wege
umgesetzt: Zuflüsse gehen in untergewichtete Klassen, Abflüsse kommen aus übergewichteten (A13),
und beim Rebalancing in der Erwerbsphase zählt die bekannte Netto-Sparrate des Folgejahres zum
Zielvolumen. Verkauft wird nur, was dieser Zufluss nicht ausgleichen kann; die Lücke schließt die
Sparrate im Folgejahr. Entnahmen im Ruhestand werden nicht vorweggenommen, weil ihre Höhe vom
Depotwert und den Steuern des Folgejahres abhängt. Ohne Vorwegnahme würde `taxAware` sogar mehr
verkaufen: Zuflüsse stellen das Ziel genau her, und schon kleine Kursbewegungen erreichen das Band
erneut, während ohne Flusssteuerung gegenläufige Drift das Band seltener auslöst.

**A57 – Geldfluss beim Rebalancing.** Der Erlös nach Steuern wird vollständig in die Lücken
investiert. Weil die Steuer per Fixpunktiteration (Toleranz 1 Cent) bestimmt wird, kann der Bestand
um diese Toleranz neben dem exakten Ziel liegen; Geld entsteht oder verschwindet dabei nicht.

**A58 – Vorbelegungen beim Variantenwechsel.** Wechselt man in der Eingabe Strategie,
Entnahmeregel, Langlebigkeitsmodell, KV in der Überbrückung oder Basiszins, erhält die neue Variante
Startwerte zum Weiterbearbeiten: Prozent vom Depot 4 %; Guyton-Klinger 5 % / ±20 % / 10 %
(Größenordnung bei Guyton/Klinger 2006); VPW 3 % real; Floor & Ceiling 4 % mit Faktoren 0,8 und
1,2; feste Allokation 60 % Aktien; Bond Tent 70 % → 40 % beim Ruhestand → 70 % 15 Jahre später;
Bucket 2 und 5 Jahre, Auffüllen nur nach Aktiengewinnen; Glidepath, Gompertz und fester Basiszins wie
im Default-Szenario. Der Cash-Anteil der bisherigen Strategie bleibt erhalten. Beim Wechsel in die
PKV ist der Beitrag 0 € und muss eingetragen werden (die Eingabe weist darauf hin); die
Beitragssteigerung übernimmt das Wachstum der KV-Rechengrößen. Es sind keine Empfehlungen.

## Fixpunktlöser

**A59 – Sprungstellen statt Abbruch.** Die Spezifikation verlangt nach 30 Iterationen ohne
Konvergenz einen Fehler. Im Default-Szenario pendelt bei einem von 10.000 Pfaden die
Brutto-Hochrechnung in der Überbrückungsphase zwischen 115.801,19 € (Bedarf um 1,12 € ungedeckt) und
115.802,30 € (um 1,12 € überdeckt): Beim höheren Verkauf sinkt die Steuer auf Kapitalerträge um
1,12 €. Die Günstigerprüfung rundet zvE und Steuer auf volle Euro ab (§ 32a Abs. 1 EStG), und mit dem
Verkaufsbetrag ändert sich die Aufteilung auf die Anlageklassen und damit der realisierte Gewinn;
einen exakten Fixpunkt gibt es nicht. Ein Fehler würde den ganzen Lauf verwerfen. Stattdessen wird die
Sprungstelle per Bisektion eingegrenzt und der kleinste Verkauf genommen, der den Bedarf deckt
(Überdeckung höchstens 10 €, sie wird investiert). Größere Sprünge oder fehlende Konvergenz ohne
eingrenzbaren Wechsel führen weiterhin zum Fehler. Geprüft: Default-Szenario und acht Varianten
(Student-t, Block-Bootstrap, Bucket, Guyton-Klinger, VPW, ohne KVdR, PKV mit Kirchensteuer, ohne
Günstigerprüfung) mit je 10.000 Pfaden ohne Fehler.

## Oberfläche und Auswertung

**A60 – Neuberechnung.** Jede Eingabeänderung startet 500 ms nach der letzten Änderung eine neue
Berechnung und bricht eine laufende ab. Ungültige Eingaben (auch unlesbare Zahlen) machen den Plan
ungültig; dann wird nicht gerechnet, frühere Ergebnisse bleiben gedimmt sichtbar und sind als
veraltet gekennzeichnet. Der Schalter real/nominal (`simulation.outputReal`) löst keine
Neuberechnung aus, weil die Auswertung beide Einheiten enthält. Der deterministische Referenzpfad
(ein Pfad, wenige Millisekunden) wird im Hauptthread gerechnet, die Monte-Carlo-Pfade im Worker.

**A61 – Einheit der Kennzahlen.** Vermögen mit 90/95, Expected Shortfall, Portfolio-Rendite und
die Diagramme folgen dem Schalter real/nominal. Der kumulierte Fehlbetrag bleibt immer real, weil
nominale Summen über Jahrzehnte Kaufkraft unterschiedlicher Jahre addieren würden. Der Schalter
fester Horizont/sterblichkeitsgewichtet wirkt auf Erfolgsquote und Fehlbetrag.

**A62 – Median-Pfad.** „Einkommen und Ausgaben (Median-Pfad)“ zeigt einen tatsächlichen Pfad statt
jahresweiser Mediane der einzelnen Größen, damit sich die gestapelten Werte zu einem stimmigen
Konsum addieren. Gewählt wird der Pfad mit dem mittleren realen Endvermögen; weil bei hohem
Scheiterrisiko viele Pfade bei 0 enden, entscheidet bei Gleichstand das mittlere Vermögen über alle
Jahre.

**A63 – Asset Allocation beim Bucket.** Die Median-Anteile je Klasse werden auf 100 % normiert, damit
die Flächen stapelbar sind. Erschöpfte Pfade haben Anteile 0 und gehen in den Median ein.

**A64 – Endvermögensverteilung.** Die Klassen reichen bis zum 99. Perzentil; die rechtsschiefe
Verteilung würde sonst durch wenige sehr große Endvermögen gestaucht. Größere Werte stehen in einer
Überlaufklasse „ab …“.

**A65 – Sterbe- und Erschöpfungsalter.** Das Diagramm zählt Sterbealter bis zum Horizont; Pfade, die
den Horizont erleben, und Pfade ohne Erschöpfung stehen als Zahl im Untertitel. Beim festen
Horizont entfällt das Sterbealter.

**A66 – Umfang der Ansichten.** Seit M6 sind alle Ansichten aus Abschnitt 12.1 umgesetzt.

## Suchen, Heatmap und PWR

**A67 – Mindestkonsum bei variiertem Netto-Konsum.** Sichere Entnahme und Heatmap variieren den
Netto-Konsum. Der Mindestkonsum wird dabei im Verhältnis des Plans mitgeführt (Default 70 %). Bei
festem Mindestkonsum wäre jede Konsumhöhe darunter per Definition ein Fehlschlag: Die Erfolgsquote
fiele unterhalb des Mindestkonsums auf 0 und stiege an ihm sprunghaft an, die Suche nach dem
höchsten tragfähigen Konsum und die Heatmap-Spalten verlören ihre Aussage.

**A68 – Sichere Entnahme nur bei konsumbestimmten Regeln.** Bei Prozent vom Depot, VPW und
Guyton-Klinger bestimmt der Depotwert den Konsum, `netConsumption` wirkt nicht. Dort wird keine
sichere Entnahme ausgewiesen; die Heatmap zeigt den Zusammenhang von Entnahmerate und Erfolgsquote
mit fester realer Entnahme.

**A69 – Suchgrößen.** Sichere Entnahme im 100-€-Raster. Die Suchen setzen voraus, dass die
Erfolgsquote mit steigendem Konsum fällt und mit späterem Ruhestand steigt; mit denselben
Renditepfaden trifft das in den Tests zu (monotone Heatmap-Spalten, monotone sichere Entnahme über
die Zielquote). Grundlage beider Suchen ist die Erfolgsquote des festen Horizonts.

**A70 – FIRE-Status.** Gesucht wird nur nach späteren Ausstiegsaltern bis zum Horizont, ohne andere
Eingaben anzupassen (Sparrate, Rentenansprüche, Glidepath-Stützstellen bleiben gleich). Die
Hochrechnung der Rente folgt dem jeweiligen Ausstiegsalter (Spezifikation 10.3).

**A71 – Heatmap.** Jede Zelle verwendet eine feste Allokation und feste reale Entnahme, unabhängig von
Strategie und Entnahmeregel des Plans; Cash bleibt beim Anteil der Strategie (Bucket: 0 %). Die
Entnahmerate bezieht sich auf den heutigen Depotwert, nicht auf den Wert bei Ruhestandsbeginn,
der je Pfad verschieden ist.

**A72 – Perfect Withdrawal Rate.** „Konstante reale Entnahme“ ist der Netto-Konsum der festen realen
Entnahme, also einschließlich des aus der Netto-Rente bestrittenen Teils; Steuern, KV, Sparphase,
Ausgabenprofil und Einmalausgaben bleiben wie im Plan. „Genau aufgebraucht“ heißt: Endvermögen
minus ungedeckter Konsum ist null; so bleibt die Gleichung auch jenseits der Erschöpfung stetig.
Berechnet wird auf Knopfdruck über alle Pfade des Laufs.

**A73 – Rechenaufwand.** Sichere Entnahme und FIRE-Status laufen nach jedem Hauptlauf automatisch im
Hintergrund und werden mit der nächsten Eingabe abgebrochen; Heatmap und PWR nur auf Knopfdruck.
Eine Eingabeänderung bricht sie ab, fertige Ergebnisse bleiben als veraltet markiert sichtbar.

## Szenarien

**A74 – Vorlagen.** „Basis“, „Pessimistisch“ und „Optimistisch“ sind feste Vorlagen mit dem
aktuellen Startjahr. Sie lassen sich laden, duplizieren, exportieren und vergleichen, aber nicht
löschen; Änderungen werden als eigenes Szenario gespeichert. „Pessimistisch“ ändert nur die
genannten Werte (Aktien μ 6 %, σ 18 %, Student-t ν = 5, Inflation μ 3 %), die Volatilität der
Inflation bleibt bei 1,5 %; „Optimistisch“ setzt Aktien μ 9 % und Inflation μ 2 % (wie im
Default).

**A75 – Speicherort.** Szenarien liegen nur im Browser (IndexedDB) und sind an Gerät und Browser
gebunden; der Arbeitsstand der Eingabe selbst wird nicht automatisch gespeichert. Gespeicherte Pläne
werden beim Laden erneut validiert.

**A76 – Vergleich mit gemeinsamem Seed.** Alle verglichenen Szenarien laufen mit dem Seed des
zuerst ausgewählten (Common Random Numbers); ihre Pfadzahl und alle anderen Eingaben bleiben. Die
Vergleichstabelle zeigt die Kennzahlen des Hauptlaufs, nicht sichere Entnahme und FIRE-Status (die
Suchen würden den Vergleich vervielfachen).

**A77 – Import des Ursprungsformats (offen).** Die Spezifikation verlangt eine Migration von
Version 1 (Ursprungsformat mit `yearlyWithdrawal`, `taxRate` usw.), getestet mit dem
Ursprungs-Default-JSON. Dieses Format liegt nicht vor; ein erfundenes v1-Schema würde die Regel
verletzen, keine Daten zu erfinden. Auf Entscheidung des Nutzers ist die Migration zurückgestellt:
Dateien mit `schemaVersion` 1 werden mit einer klaren Meldung abgelehnt. Migration und Test folgen,
sobald das Ursprungs-JSON bereitsteht.

## Steuern

**A31 – Jahresabrechnung mit laufender Verrechnung.** Steuern und KV werden für das ganze Jahr
berechnet; jeder Verkauf und die Vorabpauschale zahlen die Differenz zum bereits Gezahlten (wie die
Verlustverrechnung einer Bank). Die Vorabpauschale wird zum Jahresende statt im Januar des
Folgejahres versteuert (Spezifikation).

**A32 – Einstand nach Durchschnittsmethode** statt FIFO (Spezifikation, FIFO ist ein Nicht-Ziel).
Der anfängliche Einstand `costBasisShare` gilt für Aktien- und Anleihe-ETF gleichermaßen.

**A33 – Grundlage der Vorabpauschale.** „Wert zu Jahresbeginn“ ist der Bestand nach den Zahlungen
zu Jahresbeginn: Käufe im Januar zählen voll, Verkäufe im Januar nicht (§ 18 Abs. 2 InvStG mindert
nur um volle Monate vor dem Erwerb). Bei `bond-mean` dient `market.bonds.mean` als Basiszins.

**A34 – Kirchensteuer vereinfacht.** Auf die tarifliche Einkommensteuer wird Kirchensteuer als
`k · ESt` erhoben, ohne Sonderausgabenabzug der Kirchensteuer und ohne Kappung. Bei der
Abgeltungsteuer gilt die gesetzliche Formel `e / (4 + k)`. Beides erhöht die Steuer eher.

**A35 – Günstigerprüfung nicht in der Erwerbsphase.** Das Erwerbseinkommen ist nicht modelliert
(die Sparrate ist netto); ohne es lässt sich der persönliche Steuersatz nicht bestimmen. In der
Erwerbsphase gilt daher stets die Abgeltungsteuer (konservativ).

**A36 – Fortschreibung des Tarifs.** Mit `indexBracketsWithInflation` werden alle Tarifeckwerte und
die Soli-Freigrenze proportional zum Preisindex fortgeschrieben; Sparer-, Werbungskosten- und
Sonderausgaben-Pauschbetrag bleiben nominal fest (konservativ). Der Tarif 2026 gilt für das
Startjahr.

**A37 – Vorsorgeaufwendungen.** Abziehbar sind die vom Haushalt getragenen GKV-/PV-Beiträge
(Basisabsicherung, ohne Krankengeldanspruch voll). PKV-Beiträge werden nicht abgezogen, weil ihr
Basisanteil tarifabhängig und unbekannt ist (konservativ; betrifft nur die Günstigerprüfung in der
Überbrückung).

**A38 – Ausweis der Steuern.** `incomeTax` ist die Steuer auf die Rente allein (mit allen
abziehbaren KV-Beiträgen), `capitalTax` die Differenz zur Gesamtsteuer; bei Günstigerprüfung ist das
die tarifliche Mehrsteuer auf die Kapitalerträge.

## Gesetzliche Rente

**A39 – Keine Rente in Jahren mit Erwerbseinkommen.** Liegt der Rentenbeginn vor `retirementAge`,
wird die Rente erst ab dem Ruhestand gezahlt (Hinzuverdienst nicht modelliert, konservativ).
Zugangsfaktor und Rentenfreibetrag richten sich trotzdem nach `startAge`.

**A40 – Zuschlag bei späterem Rentenbeginn.** Die Spezifikation nennt nur den Abschlag; § 77 Abs. 2
Satz 1 Nr. 2 Buchst. b SGB VI sieht für jeden Monat nach der Regelaltersgrenze 0,5 % Zuschlag vor.
Umgesetzt wie im Gesetz.

**A41 – Rentenfreibetrag** aus dem ersten (im Modell vollen) Rentenjahr. Bei einem Rentenbeginn
vor dem Startjahr wird der Jahresbetrag mit `adjustmentRate` auf das Beginnjahr zurückgerechnet.

## Kranken- und Pflegeversicherung

**A42 – Satz auf Renten freiwillig Versicherter.** Die Spezifikation setzt für die Rentenphase ohne
KVdR „wie in der Überbrückung“ den ermäßigten Satz an. § 240 Abs. 2 Satz 5 SGB V erklärt jedoch
§ 247 Satz 1 für entsprechend anwendbar: Auf die Rente gilt der allgemeine Satz (14,6 %), auf übrige
Einnahmen der ermäßigte (14,0 %). Umgesetzt wie im Gesetz (höhere Beiträge, konservativ). Die
Rente wird nach § 238a SGB V zuerst bis zur BBG berücksichtigt.

**A43 – Beitragsgrundlage aus Kapitalerträgen.** Steuerpflichtige Kapitalerträge nach
Teilfreistellung, Vorabpauschale und Zinsen, nach Verlustverrechnung und – laut Parameter
`capitalBaseAfterSaverAllowance` (Default ja, Spezifikation) – nach Sparer-Pauschbetrag. Die
Entnahme von Vermögenssubstanz ist beitragsfrei. Beiträge werden auf das Kalenderjahr bezogen
(keine Vorläufigkeit mit späterer Korrektur nach dem Steuerbescheid).

**A44 – Krankenversicherung nach der Überbrückung.** Die Rentenphase folgt `kvdrEligible`
(KVdR oder freiwillige GKV), auch wenn die Überbrückung in der PKV lag. Eine Rückkehr aus der PKV
in die GKV ist ab 55 in der Regel ausgeschlossen (§ 6 Abs. 3a SGB V); das prüft das Modell nicht.

**A45 – Feste Beitragssätze.** Allgemeiner, ermäßigter und Zusatzbeitragssatz sowie PV-Satz bleiben
auf dem Stand 2026; nur Mindestbemessung und BBG wachsen mit `paramsGrowth`. Kinderabschläge in der
PV (ab dem zweiten Kind unter 25) sind nicht modelliert.

**A46 – Leeres Depot.** Reicht das Vermögen nicht für Konsum, Steuern und KV, wird zuerst gekürzt
was finanziert werden kann; ungedeckte KV-Beiträge werden nicht als Schuld fortgeführt (der Pfad
ist dann ohnehin gescheitert).

## Langlebigkeit

**A47 – Ganzzahliges Sterbealter.** Das gezogene Sterbealter ist das Alter im Todesjahr; das Jahr
wird noch voll erlebt (Konsum, Rente). Sterbealter nach dem Horizont werden nur bis zum Horizont
bewertet.

**A48 – Sterbetafel Variante 3.** Verwendet wird die Variante mit hoher Lebenserwartung
(konservativ). Abgedeckt sind die Jahrgänge 1926–2008 ab Alter 18; andere Kombinationen werden
mit einer Fehlermeldung abgelehnt.

**A49 – Ziehung der Sterbealter.** Je Pfad eine Zufallszahl aus einem eigenen Strom, Inversion der
Überlebensfunktion. Beim deterministischen Marktmodell (ein Pfad) ist die sterblichkeitsgewichtete
Erfolgsquote daher 0 oder 1.

## Geprüfte Annahmen der Spezifikation

**V1 – Gompertz-Parameter des Default-Szenarios** (Modalalter 88, Dispersion 10). Angepasst an die
bedingte Überlebenskurve ab 52 Jahren des Jahrgangs 1974 (Destatis-Kohortensterbetafeln, Alter
53–95, Kleinste Quadrate auf log S):

| Variante   | Geschlecht | m    | b   | häufigstes Sterbealter | P(erlebt 96) |
| ---------- | ---------- | ---- | --- | ---------------------- | ------------ |
| 2 (mittel) | männlich   | 87,7 | 9,6 | 89                     | 8,7 %        |
| 3 (hoch)   | männlich   | 89,1 | 9,6 | 91                     | 11,6 %       |
| 2 (mittel) | weiblich   | 91,8 | 8,8 | 92                     | 19,3 %       |
| 3 (hoch)   | weiblich   | 93,1 | 8,7 | 93                     | 23,5 %       |

Der Default (88/10, P(erlebt 96) = 11,1 %) passt zu einem Mann des Jahrgangs 1974 zwischen mittlerer
und hoher Variante. Für Frauen ist er zu niedrig; dort empfiehlt sich `table` oder etwa m = 92–93,
b = 9.

**V2 – Basiszins 2026:** 3,20 % bestätigt (BMF-Schreiben vom 13.01.2026). Alle Werte aus Abschnitt 13
der Spezifikation sind gegen die Primärquellen geprüft und stimmen; Details in `DATA_SOURCES.md`.
