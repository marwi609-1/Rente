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
