import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import { simulateBlock } from '@/domain/engine/monteCarlo'
import { summarize, type MonteCarloSummary } from '@/domain/engine/summary'
import type { YearResult } from '@/domain/engine/types'
import type { RetirementPlan } from '@/domain/model/types'
import { enginePlan } from './plans'

export interface Fixture {
  plan: RetirementPlan
  summary: MonteCarloSummary
  reference: YearResult[]
}

/** Kleiner Monte-Carlo-Lauf (1.000 Pfade) mit Rente und Gompertz-Sterblichkeit. */
export function smallRun(adjust: (plan: RetirementPlan) => void = () => {}): Fixture {
  const plan = enginePlan((p) => {
    p.simulation.paths = 1_000
    p.market.type = 'lognormal'
    p.spending.netConsumption = 85_000
    p.household.longevity = { type: 'gompertz', modalAge: 88, dispersion: 10 }
    adjust(p)
  })
  return {
    plan,
    summary: summarize(plan, simulateBlock(plan, 0, 1_000, ctx)),
    reference: runDeterministic(plan, ctx),
  }
}
