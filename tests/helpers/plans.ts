import { createDefaultPlan } from '@/domain/model/defaults'
import type { RetirementPlan } from '@/domain/model/types'

/**
 * Plan im Funktionsumfang der deterministischen Engine: fixe Allokation, Konsum `fixed-real`,
 * ohne Steuern und ohne Rente, jährliches Rebalancing auf das Ziel. `adjust` verändert die Kopie.
 */
export function enginePlan(adjust: (plan: RetirementPlan) => void = () => {}): RetirementPlan {
  const plan = createDefaultPlan(2026)
  plan.strategy = { type: 'fixed', equity: 0.6, cash: 0.05 }
  plan.rebalancing = { band: 0, taxAware: false }
  plan.tax.enabled = false
  plan.statePension.monthlyGrossCurrent = 0
  plan.statePension.monthlyGrossProjected = 0
  plan.market.type = 'deterministic'
  adjust(plan)
  return plan
}
