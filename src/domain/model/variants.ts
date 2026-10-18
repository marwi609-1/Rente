import { createDefaultPlan } from './defaults'
import type {
  Basiszins,
  BridgeHealthInsurance,
  HealthInsurance,
  Household,
  Longevity,
  PensionHealthInsurance,
  StrategyConfig,
  WithdrawalRule,
} from './types'

/**
 * Vorbelegungen beim Wechsel einer Variante in der Eingabe (Strategie, Entnahmeregel, …). Es sind
 * Startwerte zum Weiterbearbeiten, keine Empfehlungen; Herkunft siehe docs/ASSUMPTIONS.md (A58).
 */

const reference = createDefaultPlan(2026)

export function defaultWithdrawalRule(type: WithdrawalRule['type']): WithdrawalRule {
  switch (type) {
    case 'fixed-real':
      return { type }
    case 'percent-of-portfolio':
      return { type, rate: 0.04 }
    case 'guyton-klinger':
      // Guyton/Klinger (2006): Leitplanken ±20 %, Anpassung 10 %
      return { type, initialRate: 0.05, guardBand: 0.2, adjustment: 0.1 }
    case 'vpw':
      return { type, expectedRealReturn: 0.03 }
    case 'floor-ceiling':
      return { type, rate: 0.04, floorFactor: 0.8, ceilingFactor: 1.2 }
  }
}

/** Neue Strategie; der Cash-Anteil der bisherigen Strategie bleibt erhalten, wo es einen gibt. */
export function defaultStrategy(
  type: StrategyConfig['type'],
  household: Household,
  previous: StrategyConfig,
): StrategyConfig {
  const cash = previous.type === 'bucket' ? 0.05 : previous.cash
  switch (type) {
    case 'fixed':
      return { type, equity: 0.6, cash }
    case 'glidepath':
      return reference.strategy.type === 'glidepath'
        ? { ...reference.strategy, points: reference.strategy.points.map((p) => ({ ...p })), cash }
        : { type, points: [{ age: household.retirementAge, equity: 0.6 }], cash }
    case 'bond-tent': {
      const start = Math.min(household.currentAge, household.retirementAge)
      return {
        type,
        startAge: start,
        startEquity: 0.7,
        peakAge: household.retirementAge,
        peakEquity: 0.4,
        endAge: Math.max(household.retirementAge + 15, start + 1),
        endEquity: 0.7,
        cash,
      }
    }
    case 'bucket':
      return {
        type,
        cashYears: 2,
        bondYears: 5,
        refillRule: 'equity-up-only',
        equityUpThreshold: 0,
      }
  }
}

export function defaultLongevity(type: Longevity['type']): Longevity {
  switch (type) {
    case 'fixed':
      return { type }
    case 'gompertz':
      return reference.household.longevity.type === 'gompertz'
        ? { ...reference.household.longevity }
        : { type, modalAge: 88, dispersion: 10 }
    case 'table':
      return { type }
  }
}

/** Beim Wechsel in die PKV ist der Beitrag einzutragen; die Steigerung folgt den KV-Rechengrößen. */
export function defaultBridgeInsurance(
  type: BridgeHealthInsurance['type'],
  health: HealthInsurance,
): BridgeHealthInsurance {
  return type === 'pkv' ? { type, monthlyPremium: 0, premiumGrowth: health.paramsGrowth } : { type }
}

/**
 * Beim Wechsel in die PKV ab Rentenbeginn gilt zunächst der Beitrag der Überbrückung, sofern dort
 * PKV gewählt ist; sonst ist er einzutragen.
 */
export function defaultPensionInsurance(
  type: PensionHealthInsurance['type'],
  health: HealthInsurance,
): PensionHealthInsurance {
  if (type === 'gkv') return { type }
  const bridge = health.bridgePhase
  return bridge.type === 'pkv'
    ? { type, monthlyPremium: bridge.monthlyPremium, premiumGrowth: bridge.premiumGrowth }
    : { type, monthlyPremium: 0, premiumGrowth: health.paramsGrowth }
}

/** Fester Basiszins: der veröffentlichte Wert des Startjahres aus dem Default-Szenario. */
export function defaultBasiszins(type: Basiszins['type']): Basiszins {
  return type === 'fixed' ? { ...reference.tax.basiszins } : { type }
}
