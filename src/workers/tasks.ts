import { defaultEngineContext } from '@/data/engineContext'
import { mergeBlocks, simulateBlock, type PathBlock } from '@/domain/engine/monteCarlo'
import { perfectWithdrawalRates } from '@/domain/engine/pwr'
import { countSuccess, type SuccessCount } from '@/domain/engine/success'
import { summarize, type MonteCarloSummary } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'

/** Rechenaufgaben des Simulations-Workers; ohne Worker-Bezug, damit sie direkt testbar sind. */
export const simulationTasks = {
  simulateBlock(plan: RetirementPlan, start: number, end: number): PathBlock {
    return simulateBlock(plan, start, end, defaultEngineContext)
  },

  summarize(plan: RetirementPlan, blocks: PathBlock[]): MonteCarloSummary {
    return summarize(plan, mergeBlocks(blocks))
  },

  countSuccess(plan: RetirementPlan, start: number, end: number): SuccessCount {
    return countSuccess(plan, start, end, defaultEngineContext)
  },

  perfectWithdrawal(plan: RetirementPlan, start: number, end: number): Float64Array {
    return perfectWithdrawalRates(plan, start, end, defaultEngineContext)
  },
}
