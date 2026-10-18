import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { usePlanStore } from '@/stores/plan'
import { RECALC_DEBOUNCE_MS, setSimulationBackendFactory, useResultsStore } from '@/stores/results'
import type { SimulationBackend } from '@/workers/runner'
import { inProcessBackend, pendingBackend } from '../helpers/backends'

/** Kleiner, schneller Plan: 1.000 Pfade, kurzer Horizont. */
function setup(backend = inProcessBackend()) {
  setSimulationBackendFactory(() => [backend.backend])
  setActivePinia(createPinia())
  const planStore = usePlanStore()
  planStore.plan.simulation.paths = 1_000
  planStore.plan.household.planningHorizonAge = 70
  return { planStore, results: useResultsStore(), calls: backend.calls }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Ergebnis-Store', () => {
  it('startet die Berechnung erst nach der Wartezeit und fasst Eingaben zusammen', async () => {
    const { planStore, results, calls } = setup()
    expect(results.status).toBe('scheduled')
    planStore.plan.spending.netConsumption = 90_000
    await nextTick()
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS - 1)
    planStore.plan.spending.netConsumption = 95_000
    await nextTick()
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS - 1)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(results.status).toBe('done'))
    expect(results.summary?.paths).toBe(1_000)
    expect(results.resultPlan?.spending.netConsumption).toBe(95_000)
    expect(results.reference).toHaveLength(70 - 52 + 1)
    expect(results.progress).toEqual({ completedPaths: 1_000, totalPaths: 1_000 })
    expect(results.stale).toBe(false)
  })

  it('meldet ungültige Eingaben sofort und rechnet nicht', async () => {
    const { planStore, results, calls } = setup()
    planStore.plan.household.retirementAge = 40
    await nextTick()
    expect(results.status).toBe('invalid')
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(0)
  })

  it('bricht eine laufende Berechnung ab und behält die alten Ergebnisse', async () => {
    const fast = inProcessBackend()
    let active: SimulationBackend = fast.backend
    const { planStore, results } = setup({
      backend: {
        simulateBlock: (...args) => active.simulateBlock(...args),
        summarize: (...args) => active.summarize(...args),
      },
      calls: fast.calls,
    })
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    await vi.waitFor(() => expect(results.status).toBe('done'))
    const previous = results.summary

    active = pendingBackend()
    planStore.plan.spending.netConsumption = 50_000
    await nextTick()
    expect(results.stale).toBe(true)
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    expect(results.status).toBe('running')
    results.cancel()
    expect(results.status).toBe('aborted')
    await vi.advanceTimersByTimeAsync(0)
    expect(results.status).toBe('aborted')
    expect(results.summary).toBe(previous)
  })

  it('bricht eine geplante Berechnung vor dem Start ab', async () => {
    const { results, calls } = setup()
    results.cancel()
    expect(results.status).toBe('aborted')
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(0)
  })

  it('rechnet beim Umschalten von real auf nominal nicht neu', async () => {
    const { results, calls } = setup()
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    await vi.waitFor(() => expect(results.status).toBe('done'))
    const count = calls.length
    results.outputReal = false
    await nextTick()
    expect(results.status).toBe('done')
    expect(results.stale).toBe(false)
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(count)
  })

  it('verwirft das Ergebnis eines überholten Laufs', async () => {
    const { planStore, results } = setup()
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    const first = results.run()
    planStore.plan.spending.netConsumption = 60_000
    await nextTick()
    await first
    expect(results.status).toBe('scheduled')
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    await vi.waitFor(() => expect(results.status).toBe('done'))
    expect(results.resultPlan?.spending.netConsumption).toBe(60_000)
  })

  it('meldet Fehler der Berechnung mit Text', async () => {
    const { results } = setup({
      backend: {
        simulateBlock: () => Promise.reject(new Error('Worker abgestürzt')),
        summarize: () => Promise.reject(new Error('unerreichbar')),
      },
      calls: [],
    })
    await vi.advanceTimersByTimeAsync(RECALC_DEBOUNCE_MS)
    await vi.waitFor(() => expect(results.status).toBe('error'))
    expect(results.error).toBe('Worker abgestürzt')
  })
})
