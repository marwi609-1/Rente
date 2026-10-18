import type { PathBlock } from '@/domain/engine/monteCarlo'
import type { SimulationBackend } from '@/workers/runner'
import { simulationTasks } from '@/workers/tasks'

/** Backend im selben Prozess; zählt die angeforderten Simulationspakete. */
export function inProcessBackend() {
  const calls: [number, number][] = []
  const backend: SimulationBackend = {
    async simulateBlock(plan, start, end) {
      calls.push([start, end])
      return simulationTasks.simulateBlock(plan, start, end)
    },
    async summarize(plan, blocks) {
      return simulationTasks.summarize(plan, blocks)
    },
    async countSuccess(plan, start, end) {
      return simulationTasks.countSuccess(plan, start, end)
    },
    async perfectWithdrawal(plan, start, end) {
      return simulationTasks.perfectWithdrawal(plan, start, end)
    },
  }
  return { backend, calls }
}

/** Backend, dessen Pakete nie fertig werden (für Oberflächentests ohne Rechenlast). */
export function pendingBackend(): SimulationBackend {
  return {
    simulateBlock: () => new Promise<PathBlock>(() => {}),
    summarize: () => new Promise(() => {}),
    countSuccess: () => new Promise(() => {}),
    perfectWithdrawal: () => new Promise(() => {}),
  }
}
