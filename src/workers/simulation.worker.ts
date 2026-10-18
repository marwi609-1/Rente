import { expose, transfer } from 'comlink'

import { blockBuffers, type PathBlock } from '@/domain/engine/monteCarlo'
import type { RetirementPlan } from '@/domain/model/types'
import { simulationTasks } from './tasks'

const api = {
  simulateBlock(plan: RetirementPlan, start: number, end: number): PathBlock {
    const block = simulationTasks.simulateBlock(plan, start, end)
    // Puffer ohne Kopie an den Hauptthread übergeben
    return transfer(block, blockBuffers(block))
  },
  summarize: simulationTasks.summarize,
  countSuccess: simulationTasks.countSuccess,
  perfectWithdrawal(plan: RetirementPlan, start: number, end: number): Float64Array {
    const rates = simulationTasks.perfectWithdrawal(plan, start, end)
    return transfer(rates, [rates.buffer as ArrayBuffer])
  },
}

export type SimulationWorkerApi = typeof api

expose(api)
