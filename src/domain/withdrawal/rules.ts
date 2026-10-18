import { UnsupportedFeatureError } from '../model/errors'
import type { Household, Rate, Spending, WithdrawalRule } from '../model/types'

export interface WithdrawalContext {
  age: number
  /** Depotwert zu Jahresbeginn vor der Entnahme, nominal */
  portfolioValue: number
  /** Preisindex zu Jahresbeginn (Startjahr = 1) */
  inflationIndex: number
}

/** Liefert den Netto-Konsum des Jahres laut Entnahmeregel, nominal und vor Ausgabenprofil. */
export type WithdrawalPolicy = (ctx: WithdrawalContext) => number

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

export function withdrawalPolicy(spending: Spending, household: Household): WithdrawalPolicy {
  const rule = spending.rule
  switch (rule.type) {
    case 'fixed-real':
      return ({ inflationIndex }) => spending.netConsumption * inflationIndex
    case 'vpw':
      // Nominaler Depotwert × Faktor mit realem r ergibt die nominale Entnahme dieses Jahres.
      return ({ age, portfolioValue }) =>
        portfolioValue * vpwFactor(rule.expectedRealReturn, remainingYears(household, age))
    case 'percent-of-portfolio':
    case 'guyton-klinger':
    case 'floor-ceiling':
      throw new UnsupportedFeatureError(`Die Entnahmeregel „${rule.type}“`)
  }
}
