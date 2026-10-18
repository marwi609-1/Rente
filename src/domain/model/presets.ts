import { createDefaultPlan } from './defaults'
import type { RetirementPlan } from './types'

export interface PresetScenario {
  id: string
  plan: RetirementPlan
  description: string
}

/**
 * Mitgelieferte Szenarien (Spezifikation 12.3): „Basis“ ist das Default-Szenario, „Pessimistisch“
 * und „Optimistisch“ ändern nur Marktannahmen.
 */
export function createPresetScenarios(startYear: number): PresetScenario[] {
  const basis = createDefaultPlan(startYear)

  const pessimistic = createDefaultPlan(startYear)
  pessimistic.name = 'Pessimistisch'
  pessimistic.market.type = 'student-t'
  pessimistic.market.studentDf = 5
  pessimistic.market.equity = { ...pessimistic.market.equity, mean: 0.06, vol: 0.18 }
  pessimistic.market.inflation = { ...pessimistic.market.inflation, mean: 0.03 }

  const optimistic = createDefaultPlan(startYear)
  optimistic.name = 'Optimistisch'
  optimistic.market.equity = { ...optimistic.market.equity, mean: 0.09 }
  optimistic.market.inflation = { ...optimistic.market.inflation, mean: 0.02 }

  return [
    { id: 'preset-basis', plan: basis, description: 'Default-Szenario' },
    {
      id: 'preset-pessimistisch',
      plan: pessimistic,
      description: 'Aktien μ 6 %, σ 18 %, Student-t ν = 5, Inflation 3 %',
    },
    {
      id: 'preset-optimistisch',
      plan: optimistic,
      description: 'Aktien μ 9 %, Inflation 2 %',
    },
  ]
}
