import type { RetirementPlan } from '@/domain/model/types'

/** Schlüssel der rechenrelevanten Eingaben; die Ausgabeeinheit ändert nur die Darstellung. */
export function simulationKey(plan: RetirementPlan): string {
  return JSON.stringify({ ...plan, simulation: { ...plan.simulation, outputReal: null } })
}

/** Momentaufnahme ohne reaktive Hülle, damit sie an Worker übertragen werden kann. */
export function snapshot(plan: RetirementPlan): unknown {
  return JSON.parse(JSON.stringify(plan))
}
