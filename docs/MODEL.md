# Modell und Formeln

Stand: Meilenstein 1 (deterministische Engine). Spätere Meilensteine ergänzen Zufallsmodelle,
Steuern, Rente, Krankenversicherung und Langlebigkeit.

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

## Jahresschritt (Meilenstein 1)

Abgebildet sind Zielallokation, Sparrate, Konsum, Einmalausgaben, Renditen, Rebalancing und die
Erfolgsprüfung. Steuern, gesetzliche Rente sowie Kranken- und Pflegeversicherung sind noch nicht Teil
des Jahresschritts; der Pfad ist in M1 ein Bruttopfad.

Für jedes Jahr `t` mit Bestand `h = (h_A, h_B, h_C)` (Aktien, Anleihen, Cash, nominal) und
Zielallokation `w = (w_A, w_B, w_C)`:

1. **Phase** nach Alter (siehe oben). Ruhestand: `a_t ≥ retirementAge`.
2. **Bedarf zu Jahresbeginn** (nominal):
   - Konsum `K_t = Regel_t · f(a_t)` im Ruhestand, sonst 0. `f` ist das Ausgabenprofil.
   - Einmalausgaben `E_t = Σ amount(a_t) · I_t`.
   - Sparrate (nur Erwerbsphase) `S_t = yearlyNet · (1 + realGrowth)^t · I_t`.
3. **Saldierung**: Bedarf `B_t = K_t + E_t`.
   - `S_t ≥ B_t`: `S_t − B_t` wird gemäß Zielallokation investiert.
   - sonst: Verkauf von `B_t − S_t` (höchstens der gesamte Bestand). Verfügbar sind `S_t + Erlös`.
   - Laufender Konsum hat Vorrang: `K̂_t = min(K_t, verfügbar)`,
     `Ê_t = min(E_t, verfügbar − K̂_t)`.
4. **Renditen**: `h_k ← h_k · (1 + r_netto,k,t)`.
5. **Rebalancing**: Ist `max_k |h_k / Σh − w_k| ≥ band`, wird vollständig auf `w · Σh` umgeschichtet.
6. **Preisindex**: `I_{t+1} = I_t · (1 + π_t)`.
7. **Erfolgsprüfung** (nur Ruhestand): Fehlbetrag
   `F_t = max(0, minimumAcceptableConsumption · I_t − K̂_t)`; Beträge unter 1 Cent gelten als 0.
   `F_t > 0` kennzeichnet ein Fehljahr. Ein leeres Depot läuft mit Kapital 0 weiter.

Das Startdepot `totalValue` wird gemäß Zielallokation im Startalter aufgeteilt.

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

- Zahlungen zu Jahresbeginn (`contributions`, `grossSales`, `netConsumption`, `oneOffSpending`,
  `shortfall`) durch `I_t` (`inflationIndex`),
- Bestände und Rebalancing zum Jahresende (`equity`, `bonds`, `cash`, `total`, `rebalanceSales`)
  durch `I_{t+1}` (`inflationIndexEnd`)

geteilt. Die Rückrechnung multipliziert mit denselben Indizes.

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
