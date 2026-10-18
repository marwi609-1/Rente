import { historicalUs } from '@/data/historical'
import { mergeBlocks, simulateBlock, type PathBlock } from '@/domain/engine/monteCarlo'
import { summarize, type MonteCarloSummary } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'

/** Rechenaufgaben des Simulations-Workers; ohne Worker-Bezug, damit sie direkt testbar sind. */
export const simulationTasks = {
  simulateBlock(plan: RetirementPlan, start: number, end: number): PathBlock {
    return simulateBlock(plan, start, end, { historical: historicalUs })
  },

  summarize(plan: RetirementPlan, blocks: PathBlock[]): MonteCarloSummary {
    return summarize(plan, mergeBlocks(blocks))
  },
}
