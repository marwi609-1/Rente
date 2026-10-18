# Modell und Formeln

Stand: Meilenstein 3 (deterministische Engine, Zufallszahlen, Marktmodelle, Monte Carlo, Steuern,
gesetzliche Rente, Kranken- und Pflegeversicherung, Langlebigkeit). Weitere Strategien und
Entnahmeregeln folgen mit Meilenstein 4. Rechtsstand und Quellen: `DATA_SOURCES.md`.

## Zeitachse und Einheiten

- Startjahr ist das aktuelle Kalenderjahr. Simulationsjahr `t = 0 … N−1` entspricht dem Alter
  `a_t = currentAge + t`.
- Simuliert wird bis **einschließlich** des Horizontalters `H = planningHorizonAge`:
  `N = H − currentAge + 1` (siehe `ASSUMPTIONS.md`, A1).
- Phase: `work` für `a < retirementAge`, `bridge` für `a < statePension.startAge`, sonst `pension`.
- Preisindex: `I_0 = 1` zu Beginn des Startjahres, `I_{t+1} = I_t · (1 + π_t)`.
  Eingabebeträge `x` in heutiger Kaufkraft werden im Jahr `t` nominal zu `x · I_t`.
- Raten sind Dezimalzahlen, Beträge Euro.

## Renditen

### Lognormalparameter

Für ein arithmetisches Mittel `μ` und eine Volatilität `σ` der einfachen Jahresrendite gilt mit
`1 + r = exp(μ_ln + σ_ln · z)`, `z ~ N(0, 1)`:

```
σ_ln² = ln(1 + σ² / (1 + μ)²)
μ_ln  = ln(1 + μ) − σ_ln² / 2
```

Damit sind `E[r] = μ` und `Var[r] = σ²` exakt.

### Geometrische Rendite und deterministischer Referenzpfad

```
g = exp(μ_ln) − 1 = (1 + μ) / √(1 + σ² / (1 + μ)²) − 1  ≈  μ − σ²/2
```

`g` ist der Median von `1 + r` unter der Lognormalannahme. Der deterministische Referenzpfad
verwendet in jedem Jahr `g` für Aktien, Anleihen, Cash und Inflation – unabhängig vom gewählten
`market.type`. Bei `σ = 0` ist `g = μ`.

Beispiel Default: Aktien `μ = 8 %`, `σ = 15 %` → `g = 6,97 %` (Näherung `μ − σ²/2 = 6,875 %`).

### Laufende Kosten

```
r_netto = (1 + r) · (1 − TER) − 1
```

Die TER gilt für Aktien- und Anleihe-ETFs, nicht für Cash.

## Jahresschritt

Für jedes Jahr `t` mit Bestand `h = (h_A, h_B, h_C)` (Aktien-ETF, Anleihe-ETF, Cash, nominal),
Einstand `B = (B_A, B_B)` und Zielallokation `w`:

1. **Phase** nach Alter (siehe oben). Ruhestand: `a_t ≥ retirementAge`.
2. **Bedarf zu Jahresbeginn** (nominal):
   - Regelbetrag `K_t = Regel_t · f(a_t)` im Ruhestand, sonst 0 (`f` = Ausgabenprofil).
     Bei `fixed-real` ist `K_t` der gesamte Netto-Konsum; bei den übrigen Regeln ist `K_t` der
     depotfinanzierte Konsum, der Gesamtkonsum ist `K_t + Netto-Rente`.
   - Einmalausgaben `E_t = Σ amount(a_t) · I_t`, Sparrate (nur Erwerbsphase)
     `S_t = yearlyNet · (1 + realGrowth)^t · I_t`.
3. **Einkommen:** Rente brutto `R_t` (siehe unten); Netto-Rente `R_t − ESt_t − KV_Rente,t`.
4. **Brutto-Hochrechnung:** Verkauf `V` (Aufteilung nach Zielallokation bzw. steueroptimiert) so,
   dass `S_t + R_t + V = Konsum + E_t + G_t(V)`, wobei `G_t(V)` die bis dahin fälligen Steuern und
   KV-Beiträge des Jahres sind (Jahresabrechnung unten, mit den realisierten Gewinnen aus `V`).
   Gelöst per Fixpunktiteration `V ← clamp(Konsum + E_t + G_t(V) − S_t − R_t, 0, Σh)` bis
   `|ΔV| < 1 Cent`; nach 30 Iterationen wird eine Restabweichung bis 1 € akzeptiert, sonst Fehler.
   Reicht das Depot nicht, hat laufender Konsum Vorrang vor Einmalausgaben.
5. **Überschuss** (Sparrate, Rente über Bedarf) wird gemäß Zielallokation investiert; der Einstand
   steigt um den Kaufbetrag.
6. **Renditen** nach TER.
7. **Zum Jahresende:** Vorabpauschale je Fonds und Cash-Zinsen gehen in die Kapitalerträge ein, die
   Vorabpauschale erhöht den Einstand. Die Mehrsteuer (bzw. Erstattung) aus der Jahresabrechnung wird
   aus Cash bezahlt, reicht Cash nicht, durch einen hochgerechneten Verkauf.
8. **Rebalancing** bei Erreichen des Bands auf `w · (Σh − ΔG)`; `ΔG` sind die Steuern und
   KV-Beiträge auf die Rebalancing-Gewinne (Fixpunktiteration).
9. **Fortschreibung** von Verlustvortrag, Einstand und Preisindex `I_{t+1} = I_t · (1 + π_t)`.
10. **Erfolgsprüfung** (nur Ruhestand): `F_t = max(0, minimumAcceptableConsumption · I_t − K̂_t)` mit
    dem finanzierten Gesamtkonsum `K̂_t`; unter 1 Cent gilt 0. Ein leeres Depot läuft weiter.

Startdepot: `totalValue` nach Zielallokation im Startalter; Einstand `costBasisShare · Kurswert` je
Fonds; Verlustvortrag `lossCarryForward`.

## Jahresabrechnung: Steuern und Krankenversicherung

Die Abrechnung betrachtet stets das ganze Jahr: `G_t(x)` ist die Summe aus Steuern und KV zu den
bis dahin angefallenen Kapitalerträgen `x`. Jedes weitere Ereignis (Verkauf, Vorabpauschale,
Rebalancing) zahlt die Differenz zum bereits Gezahlten bzw. erhält sie erstattet – wie die laufende
Verlustverrechnung einer Bank.

### Kapitalerträge

- Gewinn eines Fondsverkaufs `V_k`: `V_k · (1 − B_k / h_k) · (1 − TF_k)` (Durchschnittsmethode,
  Teilfreistellung TF Aktien 30 %, Anleihen 0 %); Verluste negativ. Der Einstand sinkt um
  `V_k · B_k / h_k`.
- Vorabpauschale je Fonds: `VP = min(h_nach Flüssen · Basiszins · 0,7; max(0, Wertzuwachs))`,
  0 bei Basiszins ≤ 0; steuerpflichtig `VP · (1 − TF)`; Einstand `+ VP`. Basiszins fest oder
  `market.bonds.mean` (`bond-mean`).
- Zinsen `h_C · r_C` voll.
- Summe `x` des Jahres; Verrechnung: `nach Verlust = max(0, x − LV)`, `LV' = LV − min(LV, x)` bzw.
  `LV' = LV − x` bei `x < 0`; steuerpflichtig `x⁺ = max(0, nach Verlust − Sparer-Pauschbetrag)`.
- Abgeltungsteuer: `x⁺ · 25 % / (1 + 25 % · k) · (1 + 5,5 % + k)` mit Kirchensteuersatz `k`.

### Einkommensteuer auf die Rente

- Einkünfte: `R − Rentenfreibetrag − min(102 €, R − Rentenfreibetrag)`.
- zvE `= max(0, Einkünfte − 36 € − abziehbare KV/PV)`; Tarif § 32a EStG (zvE und Steuer auf volle
  Euro abgerundet), Soli mit Freigrenze und Milderungszone, Kirchensteuer `k · ESt`.
- Fortschreibung der Eckwerte (optional): `Steuer_t(zvE) = I_t · Steuer₂₀₂₆(zvE / I_t)`; die
  Soli-Freigrenze wird ebenso fortgeschrieben, Pauschbeträge nicht.
- Günstigerprüfung (außerhalb der Erwerbsphase): `min(ESt(zvE) + Abgeltungsteuer; ESt(zvE + x⁺))`.
- Ausweis: `incomeTax` = Steuer auf die Rente allein; `capitalTax` = Gesamtsteuer − `incomeTax`.

### Gesetzliche Rente

- Anspruch bei Ausstieg (heutige Werte): `current + (projected − current) ·
min(1, (retirementAge − currentAge) / (regularAge − currentAge))`.
- Zugangsfaktor `1 − 0,003 · Monate vorzeitig` bzw. `1 + 0,005 · Monate später`.
- `R_t = Anspruch · Zugangsfaktor · 12 · (1 + adjustmentRate)^t` ab `startAge`, nicht in Jahren mit
  Erwerbseinkommen.
- Rentenfreibetrag `(1 − Besteuerungsanteil(Jahr des Rentenbeginns)) · R` im ersten Rentenjahr,
  danach nominal fest; Besteuerungsanteil nach Tabelle § 22 EStG.

### Kranken- und Pflegeversicherung

Rechengrößen wachsen mit `paramsGrowth`: `Min_t = 1.318,33 · 12 · (1+g)^t`,
`BBG_t = 5.812,50 · 12 · (1+g)^t`. PV-Satz `p = 3,6 %` (+0,6 Punkte kinderlos).

- Erwerbsphase: nicht modelliert.
- Überbrückung, GKV freiwillig: `clamp(x_KV, Min_t, BBG_t) · (14,0 % + ZB + p)` mit
  `x_KV = x⁺` (bzw. Erträge nach Verlust, Parameter `capitalBaseAfterSaverAllowance`).
- Überbrückung, PKV: `monthlyPremium · 12 · (1 + premiumGrowth)^t`.
- Rente mit KVdR: `min(R, BBG) · ((14,6 % + ZB)/2 + p)`.
- Rente ohne KVdR: Rente zuerst bis zur BBG `R̃ = min(R, BBG)`, dann Kapitalerträge
  `X = min(x_KV, BBG − R̃)`, Aufstockung auf die Mindestgrundlage `A = max(0, Min − R̃ − X)`:
  `R̃ · (14,6 % + ZB) + (X + A) · (14,0 % + ZB) + (R̃ + X + A) · p − R̃ · (14,6 % + ZB)/2`.
- Abziehbar als Basis-Vorsorgeaufwendungen: GKV-Beiträge voll, PKV nicht (Annahme).

## Langlebigkeit

- `fixed`: kein Sterbealter, die sterblichkeitsgewichtete Sicht entspricht dem festen Horizont.
- `gompertz` (Modalalter `m`, Dispersion `b`): `S(x | a) = exp(e^{(a−m)/b} · (1 − e^{(x−a)/b}))`;
  Sterbealter durch Inversion `D = a + b · ln(1 − ln(u) · e^{(m−a)/b})`, ganzzahlig abgerundet.
- `table`: `S(a + k) = Π_{j<k} (1 − q_{a+j})` aus der Kohortentafel des Jahrgangs
  `startYear − currentAge`; Sterbealter = erstes `a + k` mit `S(a + k + 1) < u`; ab 100 gilt `q = 1`.
- `u` stammt aus einem eigenen Strom: `SplitMix32(pathSeed(seed, p) XOR 0x6C8E9CF5)`.
- Ein Pfad erlebt alle Jahre bis einschließlich des Sterbealters. Sterblichkeitsgewichtet
  erfolgreich ist er, wenn das erste Fehljahr nach dem Sterbealter liegt oder keines auftritt.

## Zu- und Abflüsse

### Proportional zur Zielallokation (`taxAware = false`)

- Kauf: `Δ_k = x · w_k`.
- Verkauf: `Δ_k = x · w_k`, höchstens `h_k`. Reicht eine Klasse nicht, wird der Rest anteilig nach
  `w` auf die übrigen verteilt; haben alle übrigen Gewicht 0, nach ihrem Bestand.

### Über- und untergewichtete Klassen (`taxAware = true`)

Mit dem Gesamtwert nach dem Fluss `V' = Σh ± x`:

- Kauf: Lücken `d_k = max(0, w_k · V' − h_k)`, Aufteilung `Δ_k = x · d_k / Σd`.
  Es gilt `Σd ≥ x`, weil `Σ max(h_k, w_k V') ≥ Σ w_k V' = Σh + x`.
- Verkauf: Überhänge `u_k = max(0, h_k − w_k · V')`, Aufteilung `Δ_k = x · u_k / Σu`.
  Es gilt `Σu ≥ x` und damit `Δ_k ≤ u_k ≤ h_k`.

Ist das Depot im Ziel, sind beide Varianten identisch.

## Entnahmeregeln

- `fixed-real`: `Regel_t = netConsumption · I_t`.
- `vpw`: vorschüssige Annuität über die Restjahre einschließlich des laufenden,
  `n_t = H − a_t + 1`, mit realem `r = expectedRealReturn` auf den nominalen Depotwert `P_t` zu
  Jahresbeginn:

  ```
  Regel_t = P_t · r / ((1 − (1 + r)^(−n_t)) · (1 + r)),   für r = 0: P_t / n_t
  ```

  Im Horizontjahr ist `n = 1`, also wird der gesamte Restbestand entnommen. Entspricht `r` der
  tatsächlichen realen Portfoliorendite, ist die reale Entnahme konstant.

Ausgabenprofil `f(a)`: lineare Interpolation zwischen den Stützstellen, vor der ersten und nach der
letzten konstant, leeres Profil `f ≡ 1`.

## Real/nominal

Jede Jahreszeile ist nominal. Für die reale Darstellung (Euro von heute) werden

- Zahlungen zu Jahresbeginn und dem Jahr zugeordnete Beträge (`contributions`, `grossSales`,
  `netConsumption`, `oneOffSpending`, `shortfall`, `pensionGross`, `pensionNet`, `capitalTax`,
  `incomeTax`, `healthInsurance`) durch `I_t` (`inflationIndex`),
- Bestände und Vorgänge zum Jahresende (`equity`, `bonds`, `cash`, `total`, `taxSales`,
  `rebalanceSales`, `lossCarryForward`) durch `I_{t+1}` (`inflationIndexEnd`)

geteilt. Die Rückrechnung multipliziert mit denselben Indizes. `portfolioReturn` ist eine nominale
Rate und wird nicht umgerechnet.

## Zufallszahlen

- **Generator:** xoshiro128** (Blackman/Vigna), 128 Bit Zustand, initialisiert aus einem 32-Bit-Seed
  über vier Werte von SplitMix32 (`state += 0x9E3779B9`, Finalisierer mit den Konstanten
  `0x85EBCA6B`, `0xC2B2AE35` aus MurmurHash3).
- **Pfad-Seed:** `pathSeed(seed, p) = SplitMix32(seed + p)`, erster Wert. Jeder Pfad hat damit einen
  eigenen Strom, der nur von `simulation.seed` und dem Pfadindex abhängt.
- **Gleichverteilung:** `u = (⌊x₁/2⁵⌋ · 2²⁶ + ⌊x₂/2⁶⌋ + ½) / 2⁵³ ∈ (0, 1)` aus zwei 32-Bit-Werten.
- **Normalverteilung:** Box-Muller, `z₁ = √(−2 ln u₁) · cos(2π u₂)`, `z₂ = √(−2 ln u₁) · sin(2π u₂)`;
  `z₂` wird für den nächsten Aufruf gepuffert.
- **Gamma/Chi-Quadrat:** Marsaglia/Tsang (2000) für Formparameter ≥ 1, sonst
  `Gamma(a) = Gamma(a+1) · U^(1/a)`; `χ²_ν = 2 · Gamma(ν/2)`.

## Marktmodelle

Alle Modelle erzeugen je Jahr gemeinsam Aktien, Anleihen, Cash und Inflation.

- **deterministic:** jährlich die geometrische Rendite (siehe oben); im Monte Carlo genügt ein Pfad.
- **lognormal:** `L` = Cholesky-Faktor der Korrelationsmatrix (Reihenfolge Aktien, Anleihen, Cash,
  Inflation). Je Jahr vier unabhängige Standardnormale `z`, `x = L z`,
  `1 + r_k = exp(μ_ln,k + σ_ln,k · x_k)`. Die Korrelation gilt damit exakt für die Log-Renditen; für
  einfache Renditen weicht sie bei den Default-Parametern um weniger als 0,001 ab.
- **student-t:** wie lognormal, zusätzlich je Jahr eine gemeinsame Variable `W ~ χ²_ν`:
  `x = L z · √((ν − 2) / W)`. `x` ist multivariat t-verteilt mit Varianz 1 je Komponente und
  derselben Korrelationsmatrix.
- **historical-sequence:** Datenfenster `fromYear … toYear` (aus `market.bootstrap`, sonst alle
  Daten) mit `n` Jahren. Pfad `p` nutzt im Jahr `t` die Jahreszeile `(p + t) mod n`; es gibt `n`
  Pfade, `simulation.paths` wird ignoriert.
- **block-bootstrap:** stationärer Bootstrap (Politis/Romano 1994) im selben Datenfenster. Start an
  zufälliger Zeile; danach mit Wahrscheinlichkeit `1/L` (`L = meanBlockLength`) Sprung an eine
  zufällige Zeile, sonst die Folgezeile `(i + 1) mod n`. Die Blocklänge ist geometrisch mit Mittel `L`.

Ziehungsreihenfolge je Jahr (parametrische Modelle): vier Normale, dann gegebenenfalls `W`.

## Monte Carlo und Kennzahlen

Die Pfade werden in Paketen (Standard 250 Pfade) auf einen Pool von Web Workern verteilt
(`min(4, Kerne − 1)`). Jeder Pfad hängt nur von Seed und Pfadindex ab, das Ergebnis ist daher
bitgleich unabhängig von Paketgröße und Worker-Zahl. Je Pfad und Jahr gespeichert werden
(`Float64Array`, Index `p · N + t`): `total` (nominal), `totalReal = total / I_{t+1}`,
`consumptionReal = K̂_t / I_t`, `shortfallReal = F_t / I_t`, Netto-Rente, Kapitalertragsteuer,
Einkommensteuer und KV/PV (jeweils `/ I_t`) sowie die Anteile von Aktien, Anleihen und Cash zum
Jahresende; je Pfad außerdem Alter des ersten Fehljahres und Sterbealter.

- **Perzentile** 5, 10, 25, 50, 75, 90, 95 je Jahr und Reihe, lineare Interpolation zwischen den
  Ordnungsstatistiken (Hyndman/Fan Typ 7): `h = (N − 1) p`, `x_⌊h⌋ + (h − ⌊h⌋)(x_⌊h⌋+1 − x_⌊h⌋)`.
- **Erfolgsquote** `p̂` = Anteil der Pfade ohne Fehljahr bis zum Horizont, Standardfehler
  `√(p̂(1 − p̂)/N)`.
- **Vermögen mit 90 / 95:** Median, P10 und P90 von `totalReal` am Ende des Jahres, in dem das Alter
  erreicht wird (nur innerhalb des Horizonts).
- **Frühester Kapitalverzehr:** Erschöpfungsalter je Pfad = erstes Jahresende mit Depot < 1 Cent
  (nie erschöpft = +∞); gemeldet wird die Ordnungsstatistik an Position `⌈0,1 · N⌉`, also das Alter,
  bis zu dem 10 % der Pfade erschöpft sind; +∞ wird als „nicht erreicht“ ausgegeben.
- **Fehlbetrag:** über die gescheiterten Pfade Median und P90 der Summe der realen Fehlbeträge sowie
  die mittlere Zahl der Fehljahre.
- **Expected Shortfall:** Mittel des realen Endvermögens der `⌈0,1 · N⌉` schlechtesten Pfade.
- **Sterblichkeitsgewichtet:** Erfolgsquote und Standardfehler wie oben, Fehlbeträge nur bis zum
  Sterbealter; dazu die Verteilung der Sterbealter bis zum Horizont.
- **Portfolio-CAGR:** je Pfad `exp(Σ ln(1 + r_p,t) / m) − 1` über die `m` Jahre mit investiertem
  Kapital, real mit `ln(1 + r_p,t) − ln(1 + π_t)`; ausgewiesen wird der Median über die Pfade.

## Geschlossene Formeln (Testanker)

Bei `σ = 0` und jährlichem Rebalancing auf das Ziel ist der reale Portfoliofaktor konstant:

```
R = Σ_k w_k · (1 + μ_k) · (1 − TER_k) / (1 + π)
```

- Sparphase, vorschüssiger Rentenendwert mit real wachsender Sparrate `S·(1+g)^t`:

  ```
  V_n = V_0 · R^n + S · R · (R^n − (1 + g)^n) / (R − (1 + g))
  ```

- Entnahmephase, vorschüssige Annuität `W` über `m` Jahre:

  ```
  V_m = V_R · R^m − W · R · (R^m − 1) / (R − 1)
  ```

Nominal: `V · (1 + π)^t`. Die Tests in `tests/domain/engine/closedForm.test.ts` prüfen beide Formeln
mit einer Toleranz von 0,01 €.
