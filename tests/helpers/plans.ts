import { createDefaultPlan } from '@/domain/model/defaults'
import type { RetirementPlan } from '@/domain/model/types'

/**
 * Plan für Tests der Grundmechanik: fixe Allokation, Konsum `fixed-real`, ohne Steuern, ohne Rente
 * und ohne Kosten der Krankenversicherung (PKV mit Beitrag 0 in der Überbrückung, KVdR auf eine
 * Rente von 0), jährliches Rebalancing auf das Ziel. `adjust` verändert die Kopie.
 */
export function enginePlan(adjust: (plan: RetirementPlan) => void = () => {}): RetirementPlan {
  const plan = createDefaultPlan(2026)
  plan.strategy = { type: 'fixed', equity: 0.6, cash: 0.05 }
  plan.rebalancing = { band: 0, taxAware: false }
  plan.tax.enabled = false
  plan.statePension.monthlyGrossCurrent = 0
  plan.statePension.monthlyGrossProjected = 0
  plan.health = {
    bridgePhase: { type: 'pkv', monthlyPremium: 0, premiumGrowth: 0 },
    kvdrEligible: true,
    paramsGrowth: 0,
  }
  plan.market.type = 'deterministic'
  adjust(plan)
  return plan
}

/** Unveränderte Abschnitte des Default-Szenarios, z. B. um Steuern oder Rente wieder einzuschalten. */
enginePlan.defaults = () => createDefaultPlan(2026)
