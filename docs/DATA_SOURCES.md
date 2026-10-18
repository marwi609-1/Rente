# Datenquellen

## Historische US-Renditen – `src/data/historical-us.json`

Jährliche nominale einfache Renditen 1871–2025 für US-Aktien (Total Return), 10-jährige
US-Staatsanleihen (Total Return), einen kurzfristigen Zins und die CPI-Inflation. Verwendet von den
Marktmodellen `historical-sequence` und `block-bootstrap`.

| Reihe                       | Quelle                                                                              | Datei / Serie                                                                             | Stand                                           | Abruf      |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| Aktien, Anleihen, CPI       | Robert J. Shiller, „U.S. Stock Markets 1871–Present and CAPE Ratio“                 | `ie_data.xls`, Blatt „Data“                                                               | gespeichert 05.10.2026, Monatsdaten bis 10/2026 | 18.10.2026 |
| Kurzfristiger Zins bis 2011 | Robert J. Shiller, Daten zu Kapitel 26 von „Market Volatility“ (aktualisiert)       | `chapt26.xlsx`, Blatt „Data“, Reihe R (One-Year Interest Rate)                            | Reihe R endet 2011                              | 18.10.2026 |
| Kurzfristiger Zins ab 2012  | Board of Governors of the Federal Reserve System (US), H.15 Selected Interest Rates | FRED-Serie TB6MS (6-Month Treasury Bill Secondary Market Rate, Discount Basis), monatlich | bis 09/2026                                     | 18.10.2026 |

URLs:

- Shiller `ie_data.xls`: <https://shillerdata.com/> (Download „ie_data.xls“); ältere Spiegelung
  unter <http://www.econ.yale.edu/~shiller/data/ie_data.xls> (dort Stand 2023, nicht verwendet)
- Shiller `chapt26.xlsx`: <http://www.econ.yale.edu/~shiller/data/chapt26.xlsx>
- FRED TB6MS: <https://fred.stlouisfed.org/series/TB6MS>, CSV über
  <https://fred.stlouisfed.org/graph/fredgraph.csv?id=TB6MS>

SHA-256 der verwendeten Quelldateien stehen im Feld `meta.sources` der JSON-Datei.

### Nutzungsbedingungen

- **Shiller-Daten:** Öffentlich zum Download bereitgestellt; eine ausdrückliche Lizenz ist nicht
  angegeben. Das Blatt „Disclaimer“ von `ie_data.xls` schließt Gewähr für Richtigkeit und
  Vollständigkeit aus. Vor einer Weiterverbreitung außerhalb dieses Projekts sind die
  Nutzungsbedingungen zu klären.
- **FRED TB6MS:** laut FRED „Public Domain: Citation Requested“. Zitiervorschlag: Board of Governors
  of the Federal Reserve System (US), 6-Month Treasury Bill Secondary Market Rate, Discount Basis
  [TB6MS], retrieved from FRED, Federal Reserve Bank of St. Louis;
  <https://fred.stlouisfed.org/series/TB6MS>.

### Aufbereitung

Das Skript `scripts/build_historical_us.py` erzeugt die Datei reproduzierbar aus den drei Quellen
(benötigt Python 3 mit `xlrd` und `openpyxl`):

```bash
python -I scripts/build_historical_us.py ie_data.xls chapt26.xlsx TB6MS.csv src/data/historical-us.json
```

- **Jahreskonvention:** Jahr Y reicht von Januar Y bis Januar Y+1. Shillers Kurse sind
  Monatsdurchschnitte der Tagesschlusskurse.
- **Aktien:** Total Return mit monatlicher Wiederanlage der Dividende wie in Shillers „Real Total
  Return Price“: `TR_m = TR_{m−1} · (P_m + D_m/12) / P_{m−1}`. Gegenprobe gegen Shillers
  Spalte „Real Total Return Price“ (umgerechnet mit dem CPI), Abweichung < 1e−9.
- **Anleihen:** Produkt der zwölf Monatsfaktoren aus Shillers Spalte „Monthly Total Bond Returns“
  (10-jährige US-Staatsanleihe; der Faktor in Monat m gilt bis Monat m+1). Gegenprobe gegen die
  Spalte „Real Total Bond Returns“, Abweichung < 1e−9.
- **Inflation:** CPI Januar Y+1 / CPI Januar Y − 1.
- **Kurzfristiger Zins:** bis 2011 Shillers Reihe R / 100. Shiller bildet R aus den Januar- und
  Juli-Sätzen eines 6-Monats-Papiers (bis 1997 Commercial Paper, danach Certificate of Deposit):
  `R = (1 + r_Jan/2) · (1 + r_Jul/2) − 1`. Ab 2012 fehlt R; fortgeschrieben wird nach derselben
  Formel mit TB6MS. Die Formel reproduziert R für 1998–2011 aus der FRED-Serie CD6M nahezu exakt.
  T-Bill-Sätze lagen 1998–2011 im Mittel 0,47 Prozentpunkte unter R und sind auf Diskontbasis
  notiert; die Cash-Rendite ab 2012 ist dadurch eher konservativ.

### Einschränkungen

- US-Historie: Der US-Aktienmarkt war im Rückblick einer der erfolgreichsten der Welt
  (Survivorship-Bias). Die App weist bei historischen Modellen darauf hin.
- Keine Wechselkurseffekte für Anleger in Euro.
- Monatsdurchschnitte glätten Jahresrenditen gegenüber Stichtagswerten (z. B. 2008: −35,6 %
  statt rund −37 % von Jahresende zu Jahresende).
- Die Anleihereihe ist eine rechnerische 10-jährige Staatsanleihe, kein investierbarer Fonds.

## Gesetzliche Rechengrößen – `src/data/params-de-2026.ts`

Alle Werte wurden am 18.10.2026 gegen die Primärquelle geprüft. Gesetzestexte von
<https://www.gesetze-im-internet.de/> (Bundesamt für Justiz).

| Parameter                                         | Wert                                                                                                                        | Primärquelle                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Einkommensteuertarif 2026                         | Grundfreibetrag 12.348 €; Zonen bis 17.799 / 69.878 / 277.825 €; Formeln laut Gesetz                                        | § 32a Abs. 1 EStG (Fassung ab VZ 2026)                      |
| Solidaritätszuschlag                              | 5,5 %; Freigrenze 20.350 € (Einzelveranlagung); Milderung 11,9 %                                                            | §§ 3 Abs. 3, 4 SolZG 1995                                   |
| Abgeltungsteuer                                   | 25 %; mit Kirchensteuer `e / (4 + k)`                                                                                       | § 32d Abs. 1 EStG                                           |
| Sparer-Pauschbetrag                               | 1.000 € (Default im Plan)                                                                                                   | § 20 Abs. 9 EStG                                            |
| Verlustverrechnung                                | Verluste mindern spätere Kapitalerträge                                                                                     | § 20 Abs. 6 EStG                                            |
| Günstigerprüfung                                  | auf Antrag, einheitlich für alle Kapitalerträge                                                                             | § 32d Abs. 6 EStG                                           |
| Vorabpauschale                                    | Basisertrag = Rücknahmepreis zu Jahresbeginn · 70 % des Basiszinses, begrenzt auf den Wertzuwachs                           | § 18 Abs. 1 InvStG                                          |
| Anrechnung der Vorabpauschale                     | mindert den Veräußerungsgewinn in voller Höhe                                                                               | § 19 Abs. 1 InvStG                                          |
| Teilfreistellung Aktienfonds                      | 30 %                                                                                                                        | § 20 Abs. 1 InvStG                                          |
| Basiszins 2026 (Default)                          | 3,20 %                                                                                                                      | BMF-Schreiben vom 13.01.2026, IV C 1 - S 1980/00230/012/001 |
| Besteuerungsanteil der Rente                      | Tabelle 2005 (50 %) bis 2058 (100 %); 2026: 84 %                                                                            | § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG           |
| Werbungskosten-Pauschbetrag Renten                | 102 €                                                                                                                       | § 9a Satz 1 Nr. 3 EStG                                      |
| Sonderausgaben-Pauschbetrag                       | 36 €                                                                                                                        | § 10c EStG                                                  |
| Zugangsfaktor                                     | −0,3 % je Monat vorzeitig, +0,5 % je Monat später                                                                           | § 77 Abs. 2 SGB VI                                          |
| RV-Zuschuss freiwillig GKV- bzw. PKV-Versicherter | halber allgemeiner Satz + halber Zusatzbeitrag auf die Rente, höchstens die Hälfte des Beitrags                             | § 106 Abs. 2 SGB VI                                         |
| Allgemeiner Beitragssatz KV                       | 14,6 %                                                                                                                      | § 241 SGB V                                                 |
| Ermäßigter Beitragssatz KV                        | 14,0 %                                                                                                                      | § 243 SGB V                                                 |
| Beitragstragung KVdR                              | Rentner und RV je zur Hälfte                                                                                                | § 249a SGB V                                                |
| Satz auf Renten freiwillig Versicherter           | allgemeiner Satz                                                                                                            | § 240 Abs. 2 Satz 5 i. V. m. § 247 Satz 1 SGB V             |
| Durchschnittlicher Zusatzbeitrag 2026             | 2,9 %                                                                                                                       | Bekanntmachung des BMG vom 7.11.2025, BAnz AT 10.11.2025 B7 |
| Beitragssatz Pflegeversicherung                   | 3,6 % (seit 1.1.2025, 2026 unverändert)                                                                                     | § 1 Abs. 1 PBAV 2025; § 55 Abs. 1 SGB XI                    |
| Kinderlosenzuschlag PV                            | +0,6 Prozentpunkte                                                                                                          | § 55 Abs. 3 SGB XI                                          |
| PV aus der Rente                                  | trägt der Rentner allein                                                                                                    | § 59 Abs. 1 SGB XI                                          |
| Mindestbemessungsgrundlage                        | 1/90 der monatlichen Bezugsgröße je Kalendertag; Bezugsgröße 2026 3.955 €/Monat → 1.318,33 €/Monat                          | § 240 Abs. 4 SGB V; § 1 SVBezGrV 2026                       |
| Beitragsbemessungsgrenze KV/PV                    | 69.750 €/Jahr = 5.812,50 €/Monat                                                                                            | § 6 Abs. 7 SGB V; § 2 Abs. 2 SVBezGrV 2026                  |
| Ertragsanteil privater Leibrenten                 | Tabelle nach vollendetem Lebensjahr bei Beginn, z. B. 60–61: 22 %, 65–66: 18 %, 67: 17 %                                    | § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG           |
| Leistungen aus bAV-Versicherungen, Riester        | voll steuerpflichtig, soweit auf geförderten Beiträgen beruhend                                                             | § 22 Nr. 5 Satz 1 EStG                                      |
| Versorgungsfreibetrag und Zuschlag                | Tabelle nach Jahr des Versorgungsbeginns, 2026: 12,8 %, höchstens 960 €, Zuschlag 288 €; 0 ab 2058                          | § 19 Abs. 2 Satz 3 EStG (Fassung Wachstumschancengesetz)    |
| Versorgungsbezüge wegen Alters                    | erst ab Vollendung des 63. Lebensjahres                                                                                     | § 19 Abs. 2 Satz 2 Nr. 2 EStG                               |
| Pauschbeträge Versorgungsbezüge / Arbeitslohn     | 102 € / 1.230 €                                                                                                             | § 9a Satz 1 Nr. 1 EStG                                      |
| Fünftelregelung                                   | Fünffaches der Mehrsteuer auf ein Fünftel der außerordentlichen Einkünfte                                                   | § 34 Abs. 1, 2 Nr. 4 EStG                                   |
| Versicherungserträge                              | Unterschied Leistung − Beiträge; hälftig nach 60 und 12 Jahren, für Verträge ab 2012 nach 62; fondsgebunden 15 % steuerfrei | § 20 Abs. 1 Nr. 6 EStG; § 52 Abs. 28 Satz 7 EStG            |
| Hälftiger Versicherungsertrag                     | persönlicher Steuersatz statt Abgeltungsteuer, keine Verlustverrechnung                                                     | § 32d Abs. 2 Nr. 2 EStG                                     |
| Versicherungen vor 2005                           | alte Rechtslage (§ 20 Abs. 1 Nr. 6 a. F.)                                                                                   | § 52 Abs. 28 Satz 5 EStG                                    |
| Versorgungsbezüge in der KV                       | Betriebsrenten; ohne Riester-Vermögen und privat fortgeführte Teile; Kapitalleistung 1/120 je Monat für 120 Monate          | § 229 Abs. 1 SGB V                                          |
| Beitragssatz Versorgungsbezüge                    | allgemeiner Beitragssatz                                                                                                    | § 248 Satz 1 SGB V; § 240 Abs. 2 Satz 5 SGB V               |
| Freigrenze und Freibetrag Betriebsrenten          | 1/20 der monatlichen Bezugsgröße: 3.955 € / 20 = 197,75 €/Monat; Freibetrag nur in der KV                                   | § 226 Abs. 2 SGB V; § 57 Abs. 1 SGB XI                      |

Die Regeln zu weiteren Einkünften wurden am 18.10.2026 gegen die Gesetzestexte geprüft. Zum
Altersvorsorgedepot (Altersvorsorgereformgesetz, BGBl. I 2026 Nr. 156, Produkte ab 2027) lagen nur
Sekundärquellen vor: die Meldung des Bundestags
<https://www.bundestag.de/dokumente/textarchiv/2026/kw13-de-altersvorsorge-1156798> sowie
Ratgeberseiten zu Auszahlung und Besteuerung; siehe A83.

Für den Pflegeversicherungssatz 2026 gibt es keine eigene Verordnung; dass der Satz von 3,6 %
unverändert gilt, bestätigen die Übersicht des vdek „Änderungen Gesundheitswesen 2026“ und die
Einordnung von sozialversicherung-kompetent.de.

## Szenario-Vorlagen

Die Marktannahmen der Vorlagen „Pessimistisch“ und „Optimistisch“ stammen aus der Spezifikation
(Abschnitt 12.3), nicht aus einer externen Quelle. Vorbelegungen beim Wechsel einer Variante sind
in `ASSUMPTIONS.md` (A58) beschrieben. Weitere Datenquellen verwendet die App nicht.

## Sterbetafeln – `src/data/mortality-de.json`

| Angabe              | Wert                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quelle              | Statistisches Bundesamt (Destatis), Statistischer Bericht „Kohortensterbetafeln für Deutschland 1926–2026“, Artikelnummer 5126101269005, erschienen 16.09.2026 |
| URL                 | <https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Sterbefaelle-Lebenserwartung/kohortensterbetafeln.html>                                    |
| Abruf               | 18.10.2026; SHA-256 der Quelldatei in `meta.sha256`                                                                                                            |
| Nutzungsbedingungen | „© Statistisches Bundesamt (Destatis), 2026. Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet.“                                |
| Inhalt              | einjährige Sterbewahrscheinlichkeiten q_x, Tabellen csv-12621-b05 (männlich) und csv-12621-b06 (weiblich), Variante 3 (hohe Lebenserwartung)                   |
| Auszug              | Geburtsjahrgänge 1926–2008, Alter 18–99; für 100 Jahre und mehr gilt q = 1                                                                                     |

Die Tafeln liegen in drei Varianten vor (niedrige, mittlere, hohe Lebenserwartung nach der 16. koordinierten Bevölkerungsvorausberechnung). Verwendet wird Variante 3, weil ein längeres Leben
für die Ruhestandsplanung das ungünstigere Szenario ist.

Erzeugung (benötigt Python 3 mit `openpyxl`):

```bash
python -I scripts/build_mortality_de.py statistischer-bericht-kohortensterbetafeln-5126101269005.xlsx src/data/mortality-de.json
```
