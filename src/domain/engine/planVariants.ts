import type { RetirementPlan, StrategyConfig } from '../model/types'

/**
 * Abwandlungen eines Plans für Suchen, Heatmap und PWR. Alle Varianten behalten Seed und Pfadzahl,
 * sodass sie dieselben Renditepfade nutzen (Common Random Numbers).
 */

function copy(plan: RetirementPlan): RetirementPlan {
  return structuredClone(plan)
}

/** Regeln, deren Konsumhöhe `netConsumption` festlegt (feste reale Entnahme, Floor & Ceiling). */
export function consumptionDrivesRule(plan: RetirementPlan): boolean {
  return plan.spending.rule.type === 'fixed-real' || plan.spending.rule.type === 'floor-ceiling'
}

/**
 * Verhältnis Mindestkonsum / Netto-Konsum des Plans; bei Netto-Konsum 0 gilt 1 (der Mindestkonsum
 * kann dann nicht im Verhältnis fortgeführt werden).
 */
export function minimumRatio(plan: RetirementPlan): number {
  const { netConsumption, minimumAcceptableConsumption } = plan.spending
  return netConsumption > 0 ? minimumAcceptableConsumption / netConsumption : 1
}

/**
 * Plan mit Netto-Konsum `amount`; der Mindestkonsum wird im Verhältnis des Ausgangsplans mitgeführt.
 * Sonst wäre jede Konsumhöhe unter dem Mindestkonsum per Definition ein Fehlschlag.
 */
export function withNetConsumption(plan: RetirementPlan, amount: number): RetirementPlan {
  const ratio = minimumRatio(plan)
  const next = copy(plan)
  next.spending.netConsumption = amount
  next.spending.minimumAcceptableConsumption = ratio * amount
  return next
}

export function withRetirementAge(plan: RetirementPlan, age: number): RetirementPlan {
  const next = copy(plan)
  next.household.retirementAge = age
  return next
}

function cashShare(strategy: StrategyConfig): number {
  return strategy.type === 'bucket' ? 0 : strategy.cash
}

/**
 * Feste Allokation mit Aktienquote `equity`; der Cash-Anteil der Strategie bleibt, soweit neben der
 * Aktienquote Platz ist, der Rest sind Anleihen (Bucket: kein Cash).
 */
export function withEquityShare(plan: RetirementPlan, equity: number): RetirementPlan {
  const next = copy(plan)
  next.strategy = { type: 'fixed', equity, cash: Math.min(cashShare(plan.strategy), 1 - equity) }
  return next
}

/** Feste reale Entnahme `amount` ohne Mindestkonsum (Grundlage der Perfect Withdrawal Rate). */
export function withFixedRealConsumption(plan: RetirementPlan, amount: number): RetirementPlan {
  const next = copy(plan)
  next.spending.rule = { type: 'fixed-real' }
  next.spending.netConsumption = amount
  next.spending.minimumAcceptableConsumption = 0
  return next
}
