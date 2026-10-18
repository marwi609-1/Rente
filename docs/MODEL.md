# Modell und Formeln

Stand: Meilenstein 6 (deterministische Engine, Zufallszahlen, Marktmodelle, Monte Carlo, Steuern,
gesetzliche Rente, Kranken- und Pflegeversicherung, Langlebigkeit, Strategien und Entnahmeregeln,
Auswertungen für Dashboard und Diagramme, sichere Entnahme, FIRE-Status, Heatmap, Perfect
Withdrawal Rate, Szenarien).
Rechtsstand und Quellen: `DATA_SOURCES.md`.

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
Einstand `B = (B_A, B_B)` und Zielallokation `w_t` der Strategie (siehe „Strategien“):

1. **Phase** nach Alter (siehe oben). Ruhestand: `a_t ≥ retirementAge`.
2. **Bedarf zu Jahresbeginn** (nominal):
   - Regelbetrag `K_t = Regel_t · f(a_t)` im Ruhestand, sonst 0 (`f` = Ausgabenprofil).
     Bei `fixed-real` ist `K_t` der gesamte Netto-Konsum; bei den übrigen Regeln ist `K_t` der
     depotfinanzierte Konsum, der Gesamtkonsum ist `K_t` + Netto-Rente + laufende weitere Einkünfte
     netto. Die Regel sieht den Depotwert zu Jahresbeginn, `I_t` und die Portfoliorendite des
     Vorjahres.
   - Einmalausgaben `E_t = Σ amount(a_t) · I_t`, Sparrate (nur Erwerbsphase)
     `S_t = yearlyNet · (1 + realGrowth)^t · I_t`.
3. **Einkommen:** Rente brutto `R_t` (siehe unten); Netto-Rente `R_t − ESt_t − KV_Rente,t`.
   Weitere Einkünfte `W_t` (laufend und einmalig, siehe „Weitere Einkünfte“) zählen zu den
   Zuflüssen.
4. **Brutto-Hochrechnung:** Verkauf `V` (Aufteilung nach Zielallokation bzw. steueroptimiert, beim
   Bucket im Ruhestand der Reihe nach aus Cash, Anleihen, Aktien) so,
   dass `S_t + R_t + W_t + V = Konsum + E_t + G_t(V)`, wobei `G_t(V)` die bis dahin fälligen Steuern und
   KV-Beiträge des Jahres sind (Jahresabrechnung unten, mit den realisierten Gewinnen aus `V`).
   Gelöst als Fixpunkt `V = clamp(Konsum + E_t + G_t(V) − S_t − R_t, 0, Σh)` auf 1 Cent genau
   (Lösungsverfahren siehe „Fixpunktlöser“).
   Reicht das Depot nicht, hat laufender Konsum Vorrang vor Einmalausgaben.
5. **Überschuss** (Sparrate, Rente über Bedarf) wird gemäß Zielallokation investiert (mit `taxAware`
   und beim Bucket im Ruhestand in die untergewichteten Klassen); der Einstand steigt um den
   Kaufbetrag.
6. **Renditen** nach TER.
7. **Zum Jahresende:** Vorabpauschale je Fonds und Cash-Zinsen gehen in die Kapitalerträge ein, die
   Vorabpauschale erhöht den Einstand. Die Mehrsteuer (bzw. Erstattung) aus der Jahresabrechnung wird
   aus Cash bezahlt, reicht Cash nicht, durch einen hochgerechneten Verkauf.
8. **Rebalancing** bei Erreichen des Bands (siehe „Rebalancing“); beim Bucket im Ruhestand
   stattdessen das Auffüllen der Töpfe für das Folgejahr (siehe „Bucket“).
9. **Fortschreibung** von Verlustvortrag, Einstand und Preisindex `I_{t+1} = I_t · (1 + π_t)`.
10. **Erfolgsprüfung** (nur Ruhestand): `F_t = max(0, minimumAcceptableConsumption · I_t − K̂_t)` mit
    dem finanzierten Gesamtkonsum `K̂_t`; unter 1 Cent gilt 0. Ein leeres Depot läuft weiter.

Startdepot: `totalValue` nach Zielallokation im Startalter; Einstand `costBasisShare · Kurswert` je
Fonds; Verlustvortrag `lossCarryForward`.

### Fixpunktlöser

Alle Hochrechnungen (Entnahme, Steuerzahlung zum Jahresende, Steuer auf das Rebalancing) lösen
`x = clamp(b(x), lower, upper)` mit dem Bedarf `b`:

1. Iteration `x ← clamp(b(x))` ab `start`, beschleunigt durch einen Sekantenschritt auf
   `g(x) = clamp(b(x)) − x`, solange sich die Kandidaten der Lösung von derselben Seite nähern und
   `g` fällt (höchstens 30 Schritte). Gelöst ist `x` bei `|g(x)| < 1 Cent`. Weil Steuer und KV je
   Tarifzone linear im Verkauf sind, trifft die Sekante die Lösung meist im ersten Versuch.
2. Wechselt `g` das Vorzeichen, ist die Lösung eingeschlossen: Regula falsi (Illinois-Variante)
   innerhalb des Intervalls bis 1 Cent. Hat `g` dort eine Sprungstelle statt einer Nullstelle, wird
   der deckende Rand (`b(x) ≤ x`) genommen, sofern seine Überdeckung `x − b(x)` höchstens 10 €
   beträgt. Sprungstellen entstehen, weil zvE und Steuer auf volle Euro abgerundet werden und der
   realisierte Gewinn nicht streng mit dem Verkaufsbetrag steigt (mit dem Betrag ändert sich die
   Aufteilung auf die Anlageklassen).
3. Sonst wird eine Restabweichung `|b(x) − x|` bis 1 € akzeptiert, darüber ein Fehler gemeldet.

Die Entnahme startet beim Verkauf des Vorjahres in Preisen des laufenden Jahres, die übrigen
Hochrechnungen bei 0 bzw. der offenen Zahlung. Umschichtungen unter 1 Cent unterbleiben.

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
- Ausweis: `incomeTax` = Steuer auf Rente und weitere Einkünfte; `capitalTax` = Gesamtsteuer −
  `incomeTax`.
- Mit weiteren Einkünften in Schichten: laufende Einkünfte `L` (Rente und laufende weitere
  Einkünfte nach Frei- und Pauschbeträgen), Einmalzahlungen `M`, Kapitalabfindungen `F`
  (Fünftelregelung), Kapitalerträge `x⁺`: `ESt_lfd = ESt(L − 36 € − KV)`,
  `ESt = ESt(L + M − 36 € − KV; F)` mit `ESt(z; F) = ESt(z) + 5 · (ESt(z + F/5) − ESt(z))` bzw.
  `5 · ESt((z + F)/5)` bei `z < 0` (§ 34 Abs. 1 EStG); Günstigerprüfung auf `L + M + x⁺`. Der
  Werbungskosten-Pauschbetrag von 102 € gilt einmal für alle Einkünfte nach § 22 EStG. Die Steuer
  auf laufende Einkünfte wird nach steuerpflichtigem Betrag auf Rente und weitere Einkünfte
  aufgeteilt (Ausweis der Netto-Beträge).

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
- Versorgungsbezüge `B` (Betriebsrenten, Kapitalleistungen zu je einem Zehntel über zehn Jahre):
  KVdR: 0 bis zur Freigrenze `Fr_t = 197,75 · 12 · (1+g)^t` (1/20 der Bezugsgröße), darüber
  `min(B − Fr_t, BBG − R̃) · (14,6 % + ZB) + min(B, BBG − R̃) · p` (§§ 226 Abs. 2, 229, 248 SGB V,
  § 57 Abs. 1 SGB XI). Freiwillig: nach der Rente und vor den übrigen Einnahmen, `(14,6 % + ZB + p)`
  ohne Freibetrag. Weitere Einnahmen (private Renten, Riester, Versicherungsleistungen mit dem
  Zahlbetrag) zählen nur bei freiwillig Versicherten zu `X`.
- Rente in der PKV (`pensionPhase = pkv`): `monthlyPremium · 12 · (1 + premiumGrowth)^t` abzüglich
  RV-Zuschuss `min(R̃ · (14,6 % + ZB)/2; Beitrag/2)` (§ 106 SGB VI); keine Beiträge auf
  Versorgungsbezüge, weitere Einnahmen oder Kapitalerträge.
- Abziehbar als Basis-Vorsorgeaufwendungen: GKV-Beiträge voll, PKV nicht (Annahme).

## Weitere Einkünfte

Liste von Einkunftsquellen mit Produkt, Auszahlungsform (Einmalzahlung, lebenslange Rente bis zum
Horizont, befristet über `n` Jahre), Beginnalter, Monatsbetrag bzw. Betrag und jährlicher Steigerung
`s`: `W_t = 12 · b · (1+s)^(t−t₀)`. Beträge sind nominal laut Vertrag; Beträge in heutiger Kaufkraft
werden mit der erwarteten Inflation `π̄` (geometrisches Mittel) umgerechnet:
`W_t = 12 · b · (1+π̄)^t₀ · ((1+s)(1+π̄))^(t−t₀)`. Der Zahlungsplan ist damit in allen Pfaden gleich.
Laufende Zahlungen decken den Konsum, Einmalzahlungen fließen nach Abzug der Steuern ins Depot.

| Produkt                                                    | Einkommensteuer                                                                                                                                                                       | KV/PV                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Betriebsrente: Direktversicherung, Pensionskasse, -fonds   | voll (§ 22 Nr. 5 Satz 1 EStG), Einmalzahlung ohne Fünftelregelung                                                                                                                     | Versorgungsbezug             |
| Betriebsrente: Direktzusage, Unterstützungskasse           | § 19 EStG: ab 63 Versorgungsfreibetrag `min(Höchstbetrag, % · Bezug im ersten Jahr)` + Zuschlag nach Jahr des Versorgungsbeginns und 102 €, vorher 1.230 €; Kapitalabfindung mit § 34 | Versorgungsbezug             |
| Riester, Altersvorsorgedepot                               | voll (§ 22 Nr. 5 Satz 1 EStG)                                                                                                                                                         | nur freiwillig Versicherte   |
| Basisrente                                                 | Besteuerungsanteil nach Beginnjahr, Rentenfreibetrag aus dem ersten Jahr                                                                                                              | nur freiwillig Versicherte   |
| Private Rentenversicherung, Lebensversicherung: lebenslang | Ertragsanteil nach Alter bei Beginn (§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG)                                                                                               | nur freiwillig Versicherte   |
| dto. Kapital- oder Ratenzahlung                            | Ertrag `W · max(0, 1 − Beiträge / Σ W)` (fondsgebunden · 0,85); hälftig zum Tarif ab 62 (Vertrag bis 2011: 60) und 12 Jahren, sonst Abgeltungsteuer; Vertrag vor 2005 steuerfrei      | nur freiwillig Versicherte   |
| Sonstige Einnahme                                          | voll zum Tarif bzw. steuerfrei                                                                                                                                                        | steuerpflichtige: freiwillig |

In der Erwerbsphase werden steuerpflichtige Teile mit 42 % zuzüglich Soli und Kirchensteuer
angesetzt, weil das Erwerbseinkommen nicht modelliert ist; KV/PV entfällt dort.

## Langlebigkeit

- `fixed`: kein Sterbealter, die sterblichkeitsgewichtete Sicht entspricht dem festen Horizont.
- `gompertz` (Modalalter `m`, Dispersion `b`): `S(x | a) = exp(e^{(a−m)/b} · (1 − e^{(x−a)/b}))`;
  Sterbealter durch Inversion `D = a + b · ln(1 − ln(u) · e^{(m−a)/b})`, ganzzahlig abgerundet.
- `table`: `S(a + k) = Π_{j<k} (1 − q_{a+j})` aus der Kohortentafel des Jahrgangs
  `startYear − currentAge`; Sterbealter = erstes `a + k` mit `S(a + k + 1) < u`; ab 100 gilt `q = 1`.
- Vorschlag für `gompertz` in der Eingabe: m und b per kleinsten Quadraten auf `ln S(x | a)`,
  `x = a + 1 … 95`, an die Kohortentafel des Jahrgangs und Geschlechts angepasst (Gitter 0,5,
  dann 0,05; gerundet auf eine Nachkommastelle).
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

### Rebalancing

Erreicht `max_k |h_k / Σh − w_k|` das Band, wird auf das Zielvolumen

```
V = Σh + Z − ΔG
```

umgeschichtet. `ΔG` sind die Steuern und KV-Beiträge auf die Gewinne der Verkäufe
(Fixpunktiteration). `Z` ist mit `taxAware` die bekannte Netto-Sparrate des Folgejahres, sofern es
noch zur Erwerbsphase gehört: `Z = max(0, yearlyNet · (1 + realGrowth)^{t+1} − E_{t+1}) · I_{t+1}`;
sonst `Z = 0`.

- Verkäufe `s_k = max(0, h_k − w_k · V)`, Lücken `d_k = max(0, w_k · V − h_k)`.
- Der Erlös nach Steuern `Σs − ΔG` füllt die Lücken anteilig: `Δ_k = (Σs − ΔG) · d_k / Σd`.
- Wegen `Σd − Σs = V − Σh = Z − ΔG` gehen die Lücken ohne Zufluss genau auf (Bestand `w · V`).
  Mit Zufluss bleibt die Lücke `Z` offen, die die Sparrate des Folgejahres schließt: Verkauft wird
  nur, was dieser Zufluss nicht ausgleichen kann. `s_k` fällt mit wachsendem `Z`.

## Strategien

Alle Aktienquoten werden mit `interpolateLinear` gebildet: lineare Interpolation zwischen nach Alter
sortierten Stützstellen, vor der ersten und nach der letzten konstant.

- `fixed`: `w = (equity, 1 − equity − cash, cash)`.
- `glidepath`: Aktienquote `e(a)` aus den Punkten, Cash fix, Anleihen der Rest.
- `bond-tent`: Stützstellen `(startAge, startEquity)`, `(peakAge, peakEquity)`,
  `(endAge, endEquity)`; das Schema verlangt `startAge ≤ peakAge < endAge` und
  `peakEquity ≤ min(startEquity, endEquity)`, damit liegt das Minimum bei `peakAge`.

Die Zielallokation gilt jeweils für das Alter zu Jahresbeginn.

### Bucket

- Zielbeträge: `Cash* = cashYears · L`, `Anleihen* = bondYears · L`, Aktien der Rest. `L` ist die
  erwartete Netto-Lücke:
  - `fixed-real`: `L = max(0, netConsumption · f(a) · I − R̂_net)` mit der Netto-Rente `R̂_net` aus
    Rente, Einkommensteuer und KV auf die Rente (ohne Kapitalerträge);
  - übrige Regeln: `L = K` (depotfinanzierter Konsum laut Regel).
- Allokation zum Depotwert `P`: `c = min(1, Cash*/P)`, `b = min(1 − c, Anleihen*/P)`,
  `e = 1 − c − b`.
- Ruhestand: Entnahmen und Steuerverkäufe der Reihe nach aus Cash, Anleihen, Aktien. Zum Jahresende
  Auffüllen auf die Ziele mit der Lücke des Folgejahres (`I_{t+1}`, Regelbetrag `K_t · I_{t+1}/I_t`):
  - Anleihen → Cash: `min(h_B, max(0, Cash* − h_C))`,
  - Aktien → Anleihen: `min(h_A, max(0, Anleihen* − h_B'))`, bei `equity-up-only` nur, wenn die
    Aktienrendite des Jahres nach TER größer als `equityUpThreshold` war.
  - Steuern auf die Verkäufe zahlt Cash; reicht es nicht, mindern sie den Anleihekauf.
  - Bestände über den Zielen bleiben stehen.
- Vor dem Ruhestand: feste Allokation aus den Zielen zu Ruhestandsbeginn. Dafür wird der Preisindex
  mit der geometrischen Inflation `g_π` fortgeschrieben, `I_R = I_t · (1 + g_π)^{R − t}`; bei
  `fixed-real` ist die Lücke `L(R, I_R) · I_t / I_R` (Kaufkraft des laufenden Jahres), bei den übrigen
  Regeln der Regelbetrag auf den aktuellen Depotwert.

## Entnahmeregeln

- `fixed-real`: `Regel_t = netConsumption · I_t`.
- `percent-of-portfolio`: `Regel_t = rate · P_t` (Depotwert zu Jahresbeginn).
- `floor-ceiling`: `Regel_t = clamp(rate · P_t, floorFactor · C_t, ceilingFactor · C_t)` mit
  `C_t = netConsumption · I_t`.
- `guyton-klinger` mit Anfangsrate `r₀`, Band `β`, Anpassung `α`:
  - erstes Ruhestandsjahr: `W = r₀ · P`;
  - danach `W̃ = W_{t−1} · I_t / I_{t−1}`; nach einem Jahr mit negativer Portfoliorendite und
    `W̃ / P_t > r₀` entfällt der Inflationsausgleich (`W̃ = W_{t−1}`);
  - `W̃ / P_t > r₀ (1 + β)` und mehr als 15 Restjahre (`H − a_t + 1 > 15`): `W = W̃ · (1 − α)`;
  - `W̃ / P_t < r₀ (1 − β)`: `W = W̃ · (1 + α)`; sonst `W = W̃`.
  - Schwellen mit relativer Toleranz `10⁻¹²`; der Zustand (`W`, `I`) wird je Pfad geführt.
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
Einkommensteuer und KV/PV (jeweils `/ I_t`), die Anteile von Aktien, Anleihen und Cash zum
Jahresende und der Preisindex `I_t`; je Pfad außerdem Alter des ersten Fehljahres und Sterbealter.

- **Perzentile** 5, 10, 25, 50, 75, 90, 95 je Jahr für `total`, `totalReal` und die Anteile der
  Anlageklassen, lineare Interpolation zwischen den Ordnungsstatistiken (Hyndman/Fan Typ 7):
  `h = (N − 1) p`, `x_⌊h⌋ + (h − ⌊h⌋)(x_⌊h⌋+1 − x_⌊h⌋)`. Die Ordnungsstatistiken werden per
  Quickselect bestimmt statt durch vollständiges Sortieren (gleiches Ergebnis). Die übrigen Reihen
  speisen Median-Pfad und Kennzahlen.
- **Erfolgsquote** `p̂` = Anteil der Pfade ohne Fehljahr bis zum Horizont, Standardfehler
  `√(p̂(1 − p̂)/N)`.
- **Vermögen mit 90 / 95:** Median, P10 und P90 von `totalReal` bzw. `total` am Ende des Jahres, in
  dem das Alter erreicht wird (nur innerhalb des Horizonts).
- **Frühester Kapitalverzehr:** Erschöpfungsalter je Pfad = erstes Jahresende mit Depot < 1 Cent
  (nie erschöpft = +∞); gemeldet wird die Ordnungsstatistik an Position `⌈0,1 · N⌉`, also das Alter,
  bis zu dem 10 % der Pfade erschöpft sind; +∞ wird als „nicht erreicht“ ausgegeben.
- **Fehlbetrag:** über die gescheiterten Pfade Median und P90 der Summe der realen Fehlbeträge sowie
  die mittlere Zahl der Fehljahre.
- **Expected Shortfall:** Mittel des Endvermögens der `⌈0,1 · N⌉` schlechtesten Pfade, real und
  nominal getrennt sortiert.
- **Sterblichkeitsgewichtet:** Erfolgsquote und Standardfehler wie oben, Fehlbeträge nur bis zum
  Sterbealter; dazu die Verteilung der Sterbealter bis zum Horizont.
- **Portfolio-CAGR:** je Pfad `exp(Σ ln(1 + r_p,t) / m) − 1` über die `m` Jahre mit investiertem
  Kapital, real mit `ln(1 + r_p,t) − ln(1 + π_t)`; ausgewiesen wird der Median über die Pfade.
- **Median-Pfad:** Pfade aufsteigend nach realem Endvermögen sortiert, bei Gleichstand nach dem
  mittleren realen Vermögen über alle Jahre, dann nach Pfadindex; gewählt wird Rang `⌊(N − 1)/2⌋`.
  Seine Reihen speisen das Diagramm „Einkommen und Ausgaben“; nominal = real · `I_t`.
  Depotfinanzierter Konsum = `max(0, K̂_t − Netto-Rente_t − weitere Einkünfte netto_t)`. Für den
  Tooltip wird der Median-Pfad nachgerechnet (gleicher Seed und Pfadindex) und die
  Kapitalertragsteuer nach Anlass aufgeteilt: Verkäufe zu Jahresbeginn (mit Versicherungserträgen),
  Vorabpauschale und Zinsen samt Steuerverkauf, Rebalancing bzw. Auffüllen der Töpfe. Weil die
  Jahresabrechnung das ganze Jahr betrachtet, ist jeder Anteil die Mehrsteuer gegenüber dem
  vorigen Schritt; die Summe ergibt die Kapitalertragsteuer des Jahres.
- **Endvermögensverteilung:** Histogramm mit höchstens 30 gleich breiten Klassen „runder“ Breite
  (1, 2, 2,5 oder 5 · 10^k) vom Minimum bis zum 99. Perzentil; größere Werte bilden eine
  Überlaufklasse.

## Suchen, Heatmap und Perfect Withdrawal Rate

Alle Verfahren rechnen Abwandlungen des Plans mit demselben Seed und denselben Pfadindizes, also
denselben Renditepfaden (Common Random Numbers). Unterschiede zwischen zwei Varianten stammen damit
nur aus der Abwandlung, nicht aus dem Zufall. Erfolgsquote ist jeweils die des festen Horizonts.

### Abwandlungen

- **Netto-Konsum `c`:** `netConsumption = c`, `minimumAcceptableConsumption = ρ · c` mit dem
  Verhältnis `ρ` = Mindestkonsum / Netto-Konsum des Plans (bei Netto-Konsum 0: `ρ = 1`).
- **Ruhestandsalter `a`:** `retirementAge = a`, alles andere unverändert.
- **Aktienquote `q`:** feste Allokation `(q, 1 − q − c', c')` mit `c' = min(Cash der Strategie,
1 − q)`; beim Bucket `c' = 0`.

### Sichere Entnahme

Für Regeln, deren Konsumhöhe der Netto-Konsum bestimmt (`fixed-real`, `floor-ceiling`). Gesucht ist
das größte `k` mit `p(100 € · k) ≥ p*` (Ziel-Erfolgsquote):

1. Obere Schranke: ab `k = ⌈netConsumption / 100⌉` verdoppeln, bis `p` auf 2.000 Pfaden unter `p*`
   fällt (`k = 0` ist ohne Konsum stets erfüllt).
2. Bisektion über ganze `k` auf 2.000 Pfaden.
3. Bestätigung mit der vollen Pfadzahl; verfehlt `k` dort das Ziel, Bisektion über `[0, k]` mit der
   vollen Pfadzahl. Ausgewiesen wird `p` mit voller Pfadzahl.

Bei historischen Sequenzen und Plänen mit weniger als 2.000 Pfaden sucht das Verfahren direkt mit
allen Pfaden.

### FIRE-Status

`p(R)` mit voller Pfadzahl stammt aus dem Hauptlauf. Ist `p(R) ≥ p*`: „erreicht“. Sonst Bisektion
über ganze Alter in `(R, H]` auf 2.000 Pfaden nach dem kleinsten Alter mit `p ≥ p*`, anschließend
Bestätigung mit voller Pfadzahl, bei Verfehlen schrittweise ein Jahr später. Erfüllt auch `a = H`
das Ziel nicht, ist kein Ausstieg bis zum Horizont möglich.

### Heatmap

Spalten: Aktienquoten 0, 10, …, 100 %. Zeilen: Entnahmerate `r` (Netto-Konsum `r · totalValue`)
oder Netto-Konsum von–bis in festen Schritten, höchstens 25 Zeilen. Je Zelle feste reale Entnahme
und die Abwandlungen Netto-Konsum und Aktienquote; Erfolgsquote auf 2.000 Pfaden.

### Perfect Withdrawal Rate

Je Pfad die konstante reale Entnahme `c` (feste reale Entnahme, Mindestkonsum 0, Ausgabenprofil
und Einmalausgaben wie im Plan), mit der das Depot genau zum Horizont aufgebraucht ist. Gelöst wird

```
g(c) = realer Depotwert am Ende des Horizontjahres − Σ_t max(0, c · f(a_t) − K̂_t / I_t) = 0
```

(Summe über die Ruhestandsjahre). `g` fällt in `c` und ist stetig bis auf die Rundungssprünge der
Steuer. Verfahren: obere Schranke durch Verdoppeln ab `max(netConsumption, 1.000 €)`, dann
Illinois-Verfahren (Regula falsi mit Halbierung des festsitzenden Endpunkts) bis `|g| < 0,50 €`
oder Intervallbreite < 0,50 €. Ausgewiesen werden Perzentile und Histogramm, die Rate relativ zum
heutigen Depotwert.

## Szenarien

Gespeichert wird in IndexedDB (Datenbank `ruhestandsplaner`, Objektspeicher `scenarios`, Schlüssel
`id`). Ein Eintrag enthält Name, Plan und Änderungszeitpunkt. Der JSON-Export ist der Plan selbst
mit `schemaVersion: 2`; beim Import wird er mit dem zod-Schema geprüft. Der Vergleich rechnet bis
zu drei Szenarien nacheinander mit dem Seed des ersten.

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
