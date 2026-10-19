import { defaultEngineContext } from '@/data/engineContext'
import { createLongevityModel } from '@/domain/longevity/longevity'
import {
  HEATMAP_EQUITY,
  HEATMAP_PATHS,
  heatmapCellPlan,
  heatmapConfigSchema,
  heatmapRows,
  type HeatmapConfig,
  type HeatmapResult,
} from '@/domain/engine/heatmap'
import { monteCarloPathCount, type PathBlock } from '@/domain/engine/monteCarlo'
import { createPathSimulator } from '@/domain/engine/path'
import { pwrStartYears, summarizePwr, type PwrSummary } from '@/domain/engine/pwr'
import {
  findFireAge,
  findSafeWithdrawal,
  type FireResult,
  type SafeWithdrawalResult,
} from '@/domain/engine/search'
import type { SuccessCount } from '@/domain/engine/success'
import type { MonteCarloSummary } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import { parsePlan } from '@/domain/model/validation'

/** Ausführungsort der Rechenaufgaben, z. B. ein Web Worker. */
export interface SimulationBackend {
  simulateBlock(plan: RetirementPlan, start: number, end: number): Promise<PathBlock>
  summarize(plan: RetirementPlan, blocks: PathBlock[]): Promise<MonteCarloSummary>
  countSuccess(plan: RetirementPlan, start: number, end: number): Promise<SuccessCount>
  perfectWithdrawal(plan: RetirementPlan, start: number, end: number): Promise<Float64Array>
}

export interface MonteCarloProgress {
  completedPaths: number
  totalPaths: number
}

export interface RunOptions {
  /** Pfade je Arbeitspaket; bestimmt die Feinheit von Fortschritt und Abbruch */
  chunkSize?: number
  signal?: AbortSignal
}

export interface MonteCarloRunOptions extends RunOptions {
  onProgress?: (progress: MonteCarloProgress) => void
}

export const DEFAULT_CHUNK_SIZE = 250

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Die Simulation wurde abgebrochen.', 'AbortError')
}

/** Zerlegt `0 … total` in Pakete zu höchstens `chunkSize` Pfaden. */
export function pathChunks(total: number, chunkSize = DEFAULT_CHUNK_SIZE): [number, number][] {
  const size = Math.max(1, Math.floor(chunkSize))
  const chunks: [number, number][] = []
  for (let s = 0; s < total; s += size) chunks.push([s, Math.min(total, s + size)])
  return chunks
}

/**
 * Verteilt Aufgaben auf die Backends: Jedes Backend holt sich die nächste freie Aufgabe. Nach einem
 * Abbruch werden keine Aufgaben mehr vergeben und das Ergebnis wird mit dem Abbruchgrund verworfen.
 */
export async function runJobs<T>(
  jobs: readonly ((backend: SimulationBackend) => Promise<T>)[],
  backends: readonly SimulationBackend[],
  options: { signal?: AbortSignal; onResult?: (index: number, result: T) => void } = {},
): Promise<T[]> {
  if (backends.length === 0) throw new RangeError('Es ist kein Simulations-Backend verfügbar.')
  const { signal, onResult } = options
  let aborted: (reason: unknown) => void = () => {}
  const abortion = new Promise<never>((_, reject) => (aborted = reject))
  const onAbort = () => aborted(abortReason(signal as AbortSignal))
  if (signal?.aborted) onAbort()
  signal?.addEventListener('abort', onAbort, { once: true })

  const results = new Array<T>(jobs.length)
  let next = 0
  const drain = async (backend: SimulationBackend) => {
    while (next < jobs.length && !signal?.aborted) {
      const index = next++
      const result = await jobs[index](backend)
      if (signal?.aborted) return
      results[index] = result
      onResult?.(index, result)
    }
  }
  try {
    const all = Promise.all(backends.map(drain))
    // Nach einem Abbruch laufende Pakete nicht als unbehandelten Fehler melden.
    all.catch(() => {})
    await Promise.race([all, abortion])
    return results
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Validiert den Plan und meldet fehlende Daten schon hier, nicht erst im Worker. */
function prepare(input: unknown): RetirementPlan {
  const plan = parsePlan(input)
  createPathSimulator(plan, defaultEngineContext)
  createLongevityModel(plan.household, plan.simulation.seed, defaultEngineContext.mortality)
  return plan
}

/** Pfadzahl eines Laufs (bei historischen Sequenzen die Zahl der Startjahre). */
export function totalPathsOf(plan: RetirementPlan): number {
  return monteCarloPathCount(plan, defaultEngineContext)
}

/**
 * Führt einen Monte-Carlo-Lauf aus: validiert den Plan, verteilt Pfadblöcke auf die Backends und
 * lässt das erste Backend auswerten. Weil jeder Pfad nur von Seed und Pfadindex abhängt, ist das
 * Ergebnis unabhängig von Paketgröße und Backend-Zahl.
 */
export async function runMonteCarlo(
  input: unknown,
  backends: readonly SimulationBackend[],
  options: MonteCarloRunOptions = {},
): Promise<MonteCarloSummary> {
  if (backends.length === 0) throw new RangeError('Es ist kein Simulations-Backend verfügbar.')
  const plan = prepare(input)
  const totalPaths = totalPathsOf(plan)
  const chunks = pathChunks(totalPaths, options.chunkSize)
  let completedPaths = 0
  const blocks = await runJobs(
    chunks.map(
      ([start, end]) =>
        (b: SimulationBackend) =>
          b.simulateBlock(plan, start, end),
    ),
    backends,
    {
      signal: options.signal,
      onResult: (_, block) => {
        completedPaths += block.paths
        options.onProgress?.({ completedPaths, totalPaths })
      },
    },
  )
  const [summary] = await runJobs([(b) => b.summarize(plan, blocks)], backends.slice(0, 1), {
    signal: options.signal,
  })
  return summary
}

/** Erfolgsquote (fester Horizont) eines validierten Plans auf den ersten `paths` Pfaden. */
export async function successRateOn(
  plan: RetirementPlan,
  paths: number,
  backends: readonly SimulationBackend[],
  options: RunOptions = {},
): Promise<number> {
  const counts = await runJobs(
    pathChunks(paths, options.chunkSize).map(
      ([start, end]) =>
        (b: SimulationBackend) =>
          b.countSuccess(plan, start, end),
    ),
    backends,
    { signal: options.signal },
  )
  return counts.reduce((sum, c) => sum + c.succeeded, 0) / paths
}

/** Sichere Entnahme zur Ziel-Erfolgsquote des Plans (Suche im Worker-Pool). */
export async function runSafeWithdrawal(
  input: unknown,
  backends: readonly SimulationBackend[],
  options: RunOptions = {},
): Promise<SafeWithdrawalResult> {
  const plan = prepare(input)
  return findSafeWithdrawal(plan, (p, n) => successRateOn(p, n, backends, options), {
    target: plan.simulation.successTargetRate,
    fullPaths: totalPathsOf(plan),
  })
}

/** FIRE-Status; `successRate` ist die Erfolgsquote des Hauptlaufs beim gewählten Alter. */
export async function runFireStatus(
  input: unknown,
  successRate: number,
  backends: readonly SimulationBackend[],
  options: RunOptions = {},
): Promise<FireResult> {
  const plan = prepare(input)
  return findFireAge(plan, (p, n) => successRateOn(p, n, backends, options), {
    target: plan.simulation.successTargetRate,
    fullPaths: totalPathsOf(plan),
    successRate,
  })
}

export interface CellProgress {
  completedCells: number
  totalCells: number
}

/**
 * Heatmap: Erfolgsquote je Aktienquote und Entnahme auf je 2.000 Pfaden (bei historischen
 * Sequenzen allen Startjahren) mit denselben Renditepfaden in allen Zellen.
 */
export async function runHeatmap(
  input: unknown,
  configInput: HeatmapConfig,
  backends: readonly SimulationBackend[],
  options: RunOptions & { onProgress?: (progress: CellProgress) => void } = {},
): Promise<HeatmapResult> {
  const plan = prepare(input)
  const config = heatmapConfigSchema.parse(configInput)
  const rows = heatmapRows(config)
  const paths = Math.min(HEATMAP_PATHS, totalPathsOf(plan))
  const chunks = pathChunks(paths, options.chunkSize ?? 500)
  const cells = rows.flatMap((row) =>
    HEATMAP_EQUITY.map((equity) => parsePlan(heatmapCellPlan(plan, config, equity, row))),
  )
  const succeeded = new Array<number>(cells.length).fill(0)
  const pending = new Array<number>(cells.length).fill(chunks.length)
  let completedCells = 0
  const jobs = cells.flatMap((cell, index) =>
    chunks.map(([start, end]) => async (b: SimulationBackend) => ({
      index,
      count: await b.countSuccess(cell, start, end),
    })),
  )
  await runJobs(jobs, backends, {
    signal: options.signal,
    onResult: (_, { index, count }) => {
      succeeded[index] += count.succeeded
      if (--pending[index] === 0) {
        completedCells++
        options.onProgress?.({ completedCells, totalCells: cells.length })
      }
    },
  })
  const columns = HEATMAP_EQUITY.length
  return {
    config,
    equity: [...HEATMAP_EQUITY],
    rows,
    success: rows.map((_, r) => HEATMAP_EQUITY.map((__, c) => succeeded[r * columns + c] / paths)),
    pathsPerCell: paths,
  }
}

/** Perfect Withdrawal Rate je Pfad über alle Pfade des Laufs. */
export async function runPerfectWithdrawal(
  input: unknown,
  backends: readonly SimulationBackend[],
  options: MonteCarloRunOptions = {},
): Promise<PwrSummary> {
  const plan = prepare(input)
  const totalPaths = totalPathsOf(plan)
  const chunks = pathChunks(totalPaths, options.chunkSize ?? 100)
  let completedPaths = 0
  const parts = await runJobs(
    chunks.map(
      ([start, end]) =>
        (b: SimulationBackend) =>
          b.perfectWithdrawal(plan, start, end),
    ),
    backends,
    {
      signal: options.signal,
      onResult: (_, part) => {
        completedPaths += part.length
        options.onProgress?.({ completedPaths, totalPaths })
      },
    },
  )
  const all = new Float64Array(totalPaths)
  parts.forEach((part, i) => all.set(part, chunks[i][0]))
  return summarizePwr(all, plan, pwrStartYears(plan, defaultEngineContext))
}
