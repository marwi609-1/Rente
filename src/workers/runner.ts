import { historicalUs } from '@/data/historical'
import { monteCarloPathCount, type PathBlock } from '@/domain/engine/monteCarlo'
import { createPathSimulator } from '@/domain/engine/path'
import type { MonteCarloSummary } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import { parsePlan } from '@/domain/model/validation'

/** Ausführungsort der Rechenaufgaben, z. B. ein Web Worker. */
export interface SimulationBackend {
  simulateBlock(plan: RetirementPlan, start: number, end: number): Promise<PathBlock>
  summarize(plan: RetirementPlan, blocks: PathBlock[]): Promise<MonteCarloSummary>
}

export interface MonteCarloProgress {
  completedPaths: number
  totalPaths: number
}

export interface MonteCarloRunOptions {
  /** Pfade je Arbeitspaket; bestimmt die Feinheit von Fortschritt und Abbruch */
  chunkSize?: number
  signal?: AbortSignal
  onProgress?: (progress: MonteCarloProgress) => void
}

export const DEFAULT_CHUNK_SIZE = 250

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Die Simulation wurde abgebrochen.', 'AbortError')
}

/**
 * Führt einen Monte-Carlo-Lauf aus: validiert den Plan, verteilt Pfadblöcke auf die Backends
 * (jedes holt sich das nächste freie Paket) und lässt das erste Backend auswerten. Weil jeder Pfad
 * nur von Seed und Pfadindex abhängt, ist das Ergebnis unabhängig von Paketgröße und Backend-Zahl.
 */
export async function runMonteCarlo(
  input: unknown,
  backends: readonly SimulationBackend[],
  options: MonteCarloRunOptions = {},
): Promise<MonteCarloSummary> {
  if (backends.length === 0) throw new RangeError('Es ist kein Simulations-Backend verfügbar.')
  const { signal, onProgress } = options
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE))
  const plan = parsePlan(input)
  // Nicht unterstützte Optionen schon hier melden, nicht erst im Worker.
  createPathSimulator(plan)
  const totalPaths = monteCarloPathCount(plan, { historical: historicalUs })

  const chunks: [number, number][] = []
  for (let s = 0; s < totalPaths; s += chunkSize)
    chunks.push([s, Math.min(totalPaths, s + chunkSize)])

  let aborted: (reason: unknown) => void = () => {}
  const abortion = new Promise<never>((_, reject) => (aborted = reject))
  const onAbort = () => aborted(abortReason(signal as AbortSignal))
  if (signal?.aborted) onAbort()
  signal?.addEventListener('abort', onAbort, { once: true })

  const blocks: PathBlock[] = []
  let next = 0
  let completedPaths = 0
  const drain = async (backend: SimulationBackend) => {
    while (next < chunks.length && !signal?.aborted) {
      const [start, end] = chunks[next++]
      const block = await backend.simulateBlock(plan, start, end)
      if (signal?.aborted) return
      blocks.push(block)
      completedPaths += block.paths
      onProgress?.({ completedPaths, totalPaths })
    }
  }

  try {
    const simulated = Promise.all(backends.map(drain))
    // Nach einem Abbruch laufende Pakete nicht als unbehandelten Fehler melden.
    simulated.catch(() => {})
    await Promise.race([simulated, abortion])
    const summary = backends[0].summarize(plan, blocks)
    summary.catch(() => {})
    return await Promise.race([summary, abortion])
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
