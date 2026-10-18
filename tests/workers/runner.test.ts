import { describe, expect, it } from 'vitest'

import { PlanValidationError } from '@/domain/model/validation'
import { runMonteCarlo, type MonteCarloProgress, type SimulationBackend } from '@/workers/runner'
import { simulationTasks } from '@/workers/tasks'
import { enginePlan } from '../helpers/plans'

/** Backend im selben Prozess; `delay` würfelt die Reihenfolge der Fertigstellung durcheinander. */
function inProcessBackend(delay: (start: number) => number = () => 0) {
  const calls: [number, number][] = []
  const backend: SimulationBackend = {
    async simulateBlock(plan, start, end) {
      calls.push([start, end])
      await new Promise((resolve) => setTimeout(resolve, delay(start)))
      return simulationTasks.simulateBlock(plan, start, end)
    },
    async summarize(plan, blocks) {
      return simulationTasks.summarize(plan, blocks)
    },
  }
  return { backend, calls }
}

const plan = enginePlan((p) => {
  p.market.type = 'lognormal'
  p.simulation.paths = 1_000
  p.spending.netConsumption = 85_000
})

describe('runMonteCarlo', () => {
  it('liefert unabhängig von Paketgröße und Worker-Zahl dasselbe Ergebnis', async () => {
    const single = await runMonteCarlo(plan, [inProcessBackend().backend], { chunkSize: 1_000 })
    const pool = [0, 1, 2].map(
      (i) => inProcessBackend((start) => ((start * 7 + i) % 5) * 2).backend,
    )
    const parallel = await runMonteCarlo(plan, pool, { chunkSize: 37 })
    expect(parallel).toEqual(single)
    expect(single.paths).toBe(1_000)
  })

  it('verteilt die Pakete auf alle Backends und meldet monotonen Fortschritt', async () => {
    const backends = [inProcessBackend(), inProcessBackend()]
    const progress: MonteCarloProgress[] = []
    await runMonteCarlo(
      plan,
      backends.map((b) => b.backend),
      { chunkSize: 100, onProgress: (p) => progress.push(p) },
    )
    expect(backends.every((b) => b.calls.length > 0)).toBe(true)
    expect(backends.flatMap((b) => b.calls).sort((a, b) => a[0] - b[0])).toEqual(
      Array.from({ length: 10 }, (_, i) => [i * 100, (i + 1) * 100]),
    )
    expect(progress).toHaveLength(10)
    expect(progress.map((p) => p.completedPaths)).toEqual(
      Array.from({ length: 10 }, (_, i) => (i + 1) * 100),
    )
    expect(progress.every((p) => p.totalPaths === 1_000)).toBe(true)
  })

  it('bricht ab und vergibt danach keine Pakete mehr', async () => {
    const { backend, calls } = inProcessBackend(() => 1)
    const controller = new AbortController()
    const run = runMonteCarlo(plan, [backend], {
      chunkSize: 50,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.completedPaths === 100) controller.abort()
      },
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls.length).toBe(2)
  })

  it('bricht sofort ab, wenn das Signal schon gesetzt ist', async () => {
    const { backend, calls } = inProcessBackend()
    const controller = new AbortController()
    controller.abort()
    await expect(
      runMonteCarlo(plan, [backend], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(0)
  })

  it('validiert den Plan und meldet fehlende Daten vor der Verteilung', async () => {
    const { backend, calls } = inProcessBackend()
    const invalid = enginePlan((p) => (p.household.retirementAge = 40))
    await expect(runMonteCarlo(invalid, [backend])).rejects.toBeInstanceOf(PlanValidationError)
    // Die Sterbetafel beginnt mit 18 Jahren.
    const uncovered = enginePlan((p) => {
      p.household.currentAge = 10
      p.household.retirementAge = 60
      p.household.longevity = { type: 'table' }
    })
    await expect(runMonteCarlo(uncovered, [backend])).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })

  it('verlangt mindestens ein Backend', async () => {
    await expect(runMonteCarlo(plan, [])).rejects.toBeInstanceOf(RangeError)
  })
})
