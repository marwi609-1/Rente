import type { Household, Rate, Spending, WithdrawalRule } from '../model/types'

export interface WithdrawalContext {
  age: number
  /** Depotwert zu Jahresbeginn vor der Entnahme, nominal */
  portfolioValue: number
  /** Preisindex zu Jahresbeginn (Startjahr = 1) */
  inflationIndex: number
  /** nominale Portfoliorendite des Vorjahres; `null` ohne Vorjahr oder ohne investiertes Kapital */
  previousReturn: number | null
}

/**
 * Liefert den Betrag des Jahres laut Entnahmeregel, nominal und vor Ausgabenprofil. Wird je Pfad in
 * jedem Ruhestandsjahr genau einmal in zeitlicher Reihenfolge aufgerufen.
 */
export type WithdrawalPolicy = (ctx: WithdrawalContext) => number

/** Erzeugt je Pfad eine neue Regel; Guyton-Klinger führt Zustand über die Jahre. */
export type WithdrawalPolicyFactory = () => WithdrawalPolicy

/** Guyton-Klinger setzt Kürzungen in den letzten 15 Jahren vor dem Horizont aus. */
const GK_NO_CUT_YEARS = 15
/** Relative Toleranz an den Schwellen gegen Gleitkommarauschen. */
const THRESHOLD_TOLERANCE = 1e-12

/**
 * Entnahmefaktor der vorschüssigen Annuität über n Jahre mit Rendite r:
 * W/P = r / (1 − (1+r)^−n) / (1+r); für r = 0 gilt 1/n.
 */
export function vpwFactor(r: Rate, n: number): number {
  if (!(n >= 1))
    throw new RangeError('Die Restlaufzeit der Annuität muss mindestens ein Jahr betragen.')
  if (!(r > -1)) throw new RangeError('Die reale Rendite muss größer als −100 % sein.')
  if (Math.abs(r) < 1e-12) return 1 / n
  return r / (-Math.expm1(-n * Math.log1p(r)) * (1 + r))
}

/**
 * Bei `fixed-real` ist der Betrag der Regel der gesamte Netto-Konsum; das Depot deckt die Lücke zur
 * Netto-Rente. Bei allen anderen Regeln ist er der depotfinanzierte Konsum, die Netto-Rente kommt
 * hinzu (Spezifikation 9.2).
 */
export function ruleSetsTotalConsumption(rule: WithdrawalRule): boolean {
  return rule.type === 'fixed-real'
}

/** Verbleibende Entnahmejahre einschließlich des laufenden; das Horizontjahr zählt mit. */
export function remainingYears(household: Household, age: number): number {
  return household.planningHorizonAge - age + 1
}

export function withdrawalPolicy(
  spending: Spending,
  household: Household,
): WithdrawalPolicyFactory {
  const rule = spending.rule
  switch (rule.type) {
    case 'fixed-real':
      return () =>
        ({ inflationIndex }) =>
          spending.netConsumption * inflationIndex
    case 'percent-of-portfolio':
      return () =>
        ({ portfolioValue }) =>
          rule.rate * portfolioValue
    case 'vpw':
      // Nominaler Depotwert × Faktor mit realem r ergibt die nominale Entnahme dieses Jahres.
      return () =>
        ({ age, portfolioValue }) =>
          portfolioValue * vpwFactor(rule.expectedRealReturn, remainingYears(household, age))
    case 'floor-ceiling':
      return () =>
        ({ portfolioValue, inflationIndex }) => {
          const base = spending.netConsumption * inflationIndex
          return Math.min(
            rule.ceilingFactor * base,
            Math.max(rule.floorFactor * base, rule.rate * portfolioValue),
          )
        }
    case 'guyton-klinger':
      return () => guytonKlinger(rule, household)
  }
}

/**
 * Guyton-Klinger (Spezifikation 9.2): Start mit `initialRate` × Depotwert im ersten Ruhestandsjahr.
 * Danach Inflationsausgleich, außer nach einem Jahr mit negativer Portfoliorendite, wenn die Rate
 * über der Anfangsrate liegt. Liegt die Rate über `initialRate · (1 + guardBand)`, sinkt die
 * Entnahme um `adjustment` (nicht in den letzten 15 Jahren vor dem Horizont); liegt sie unter
 * `initialRate · (1 − guardBand)`, steigt sie um `adjustment`.
 */
function guytonKlinger(
  rule: Extract<WithdrawalRule, { type: 'guyton-klinger' }>,
  household: Household,
): WithdrawalPolicy {
  const upper = rule.initialRate * (1 + rule.guardBand) * (1 + THRESHOLD_TOLERANCE)
  const lower = rule.initialRate * (1 - rule.guardBand) * (1 - THRESHOLD_TOLERANCE)
  let previous: { amount: number; index: number } | null = null
  return ({ age, portfolioValue, inflationIndex, previousReturn }) => {
    const rateOf = (amount: number) =>
      portfolioValue > 0 ? amount / portfolioValue : Number.POSITIVE_INFINITY
    let amount: number
    if (previous === null) {
      amount = rule.initialRate * portfolioValue
    } else {
      const inflated = (previous.amount * inflationIndex) / previous.index
      const skipInflation =
        previousReturn !== null && previousReturn < 0 && rateOf(inflated) > rule.initialRate
      amount = skipInflation ? previous.amount : inflated
      const rate = rateOf(amount)
      if (rate > upper && remainingYears(household, age) > GK_NO_CUT_YEARS) {
        amount *= 1 - rule.adjustment
      } else if (rate < lower) {
        amount *= 1 + rule.adjustment
      }
    }
    previous = { amount, index: inflationIndex }
    return amount
  }
}
