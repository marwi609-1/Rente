import { transfer, wrap } from 'comlink'

import { blockBuffers } from '@/domain/engine/monteCarlo'
import type { SimulationBackend } from './runner'
import type { SimulationWorkerApi } from './simulation.worker'

export interface WorkerPool {
  backends: SimulationBackend[]
  /** beendet alle Worker sofort, auch mitten in einem Paket */
  terminate(): void
}

/** Ein Worker je verfügbarem Kern abzüglich des UI-Threads, höchstens vier. */
export function defaultPoolSize(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2
  return Math.max(1, Math.min(4, cores - 1))
}

export function createWorkerPool(size = defaultPoolSize()): WorkerPool {
  const workers = Array.from(
    { length: size },
    () => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }),
  )
  const backends = workers.map((worker): SimulationBackend => {
    const remote = wrap<SimulationWorkerApi>(worker)
    return {
      simulateBlock: (plan, start, end) => remote.simulateBlock(plan, start, end),
      // Blöcke ohne Kopie an den auswertenden Worker übergeben
      summarize: (plan, blocks) =>
        remote.summarize(plan, transfer(blocks, blocks.flatMap(blockBuffers))),
    }
  })
  return {
    backends,
    terminate: () => workers.forEach((w) => w.terminate()),
  }
}
