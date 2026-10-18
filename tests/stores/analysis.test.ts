import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { useAnalysisStore } from '@/stores/analysis'
import { usePlanStore } from '@/stores/plan'
import { setSimulationBackendFactory } from '@/workers/backends'
import { inProcessBackend, pendingBackend } from '../helpers/backends'

function setup(backend = inProcessBackend().backend) {
  setSimulationBackendFactory(() => [backend])
  setActivePinia(createPinia())
  const plan = usePlanStore()
  plan.plan.simulation.paths = 1_000
  plan.plan.household.planningHorizonAge = 70
  return { plan, analysis: useAnalysisStore() }
}

afterEach(() => vi.useRealTimers())

describe('Analyse-Store', () => {
  it('rechnet die Heatmap auf Knopfdruck und markiert sie nach Eingabeänderungen als veraltet', async () => {
    const { plan, analysis } = setup()
    analysis.heatmapConfig = { mode: 'consumption', from: 60_000, to: 120_000, step: 30_000 }
    await analysis.computeHeatmap()
    expect(analysis.heatmap.status).toBe('done')
    expect(analysis.heatmap.result?.rows).toEqual([60_000, 90_000, 120_000])
    expect(analysis.heatmap.progress).toEqual({ done: 33, total: 33 })
    expect(analysis.heatmapStale).toBe(false)
    plan.plan.spending.netConsumption = 80_000
    await nextTick()
    expect(analysis.heatmapStale).toBe(true)
  }, 120_000)

  it('bricht laufende Analysen bei einer Eingabeänderung ab', async () => {
    const { plan, analysis } = setup(pendingBackend())
    const running = analysis.computePwr()
    expect(analysis.pwr.status).toBe('running')
    plan.plan.spending.netConsumption = 80_000
    await nextTick()
    expect(analysis.pwr.status).toBe('aborted')
    await running
    expect(analysis.pwr.status).toBe('aborted')
  })

  it('rechnet ungültige Pläne nicht', async () => {
    const { plan, analysis } = setup()
    plan.plan.household.retirementAge = 40
    await analysis.computePwr()
    expect(analysis.pwr.status).toBe('invalid')
  })
})
