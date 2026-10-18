import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { openScenarioDb } from '@/persistence/scenarioDb'
import { usePlanStore } from '@/stores/plan'
import { CURRENT_PLAN_ID, setScenarioDbFactory, useScenariosStore } from '@/stores/scenarios'
import { setSimulationBackendFactory } from '@/workers/backends'
import { inProcessBackend } from '../helpers/backends'

let counter = 0

function setup() {
  const name = `store-scenarios-${++counter}`
  setScenarioDbFactory(() => openScenarioDb(name))
  setSimulationBackendFactory(() => [inProcessBackend().backend])
  setActivePinia(createPinia())
  const planStore = usePlanStore()
  planStore.plan.simulation.paths = 1_000
  planStore.plan.household.planningHorizonAge = 70
  return { planStore, scenarios: useScenariosStore() }
}

describe('Szenario-Store', () => {
  it('speichert den aktuellen Plan und lädt ihn unverändert zurück', async () => {
    const { planStore, scenarios } = setup()
    planStore.plan.name = 'Mein Plan'
    planStore.plan.spending.netConsumption = 77_000
    const saved = structuredClone(JSON.parse(JSON.stringify(planStore.plan)))
    expect(await scenarios.saveCurrent()).toBeNull()
    expect(scenarios.saved.map((s) => s.name)).toEqual(['Mein Plan'])
    const id = scenarios.activeId!

    planStore.plan.spending.netConsumption = 10_000
    expect(await scenarios.saveCurrent(true)).toBeNull()
    expect(scenarios.saved).toHaveLength(2)

    expect(await scenarios.load(id)).toBeNull()
    expect(planStore.plan).toEqual(saved)
    expect(scenarios.activeId).toBe(id)

    // Neu öffnen: die Daten liegen in IndexedDB
    setActivePinia(createPinia())
    const reopened = useScenariosStore()
    await reopened.refresh()
    expect(reopened.saved).toHaveLength(2)
  })

  it('überschreibt beim Speichern das bearbeitete Szenario', async () => {
    const { planStore, scenarios } = setup()
    await scenarios.saveCurrent()
    planStore.plan.spending.netConsumption = 55_000
    await scenarios.saveCurrent()
    expect(scenarios.saved).toHaveLength(1)
    expect(scenarios.saved[0].plan.spending.netConsumption).toBe(55_000)
  })

  it('dupliziert Vorlagen und löscht Szenarien', async () => {
    const { scenarios } = setup()
    await scenarios.duplicate('preset-pessimistisch')
    expect(scenarios.saved.map((s) => s.name)).toEqual(['Pessimistisch (Kopie)'])
    await scenarios.duplicate(scenarios.saved[0].id)
    expect(scenarios.saved).toHaveLength(2)
    await scenarios.remove(scenarios.saved[0].id)
    expect(scenarios.saved).toHaveLength(1)
  })

  it('lädt Vorlagen in die Eingabe', async () => {
    const { planStore, scenarios } = setup()
    expect(await scenarios.load('preset-optimistisch')).toBeNull()
    expect(planStore.plan.name).toBe('Optimistisch')
    expect(planStore.plan.market.equity.mean).toBe(0.09)
    expect(scenarios.activeId).toBeNull()
  })

  it('exportiert und importiert Szenarien identisch', async () => {
    const { scenarios } = setup()
    const file = scenarios.exportScenario('preset-pessimistisch')!
    expect(file.fileName).toBe('Pessimistisch.json')
    const result = await scenarios.importScenario(file.content)
    expect(result).toEqual({ ok: true, name: 'Pessimistisch' })
    expect(scenarios.saved[0].plan).toEqual(scenarios.presets[1].plan)
    const rejected = await scenarios.importScenario(JSON.stringify({ schemaVersion: 1 }))
    expect(rejected.ok).toBe(false)
  })

  it('vergleicht bis zu drei Szenarien mit demselben Seed', async () => {
    const { planStore, scenarios } = setup()
    // gespeicherte Kopie mit anderem Seed: im Vergleich gilt der Seed des ersten Szenarios
    await scenarios.saveCurrent()
    const copyId = scenarios.saved[0].id
    planStore.plan.simulation.seed = 7
    scenarios.toggleSelected(copyId)
    scenarios.toggleSelected(CURRENT_PLAN_ID)
    scenarios.toggleSelected('preset-basis')
    scenarios.toggleSelected('preset-optimistisch')
    expect(scenarios.selected).toEqual([copyId, CURRENT_PLAN_ID, 'preset-basis'])
    scenarios.toggleSelected('preset-basis')
    await scenarios.compare()
    expect(scenarios.comparisonStatus).toBe('done')
    const [first, second] = scenarios.comparison
    expect(second.plan.simulation.seed).toBe(first.plan.simulation.seed)
    expect(second.summary.successRate).toBe(first.summary.successRate)
    expect(second.summary.bands.totalReal).toEqual(first.summary.bands.totalReal)
  }, 120_000)

  it('verweigert das Speichern ungültiger Pläne', async () => {
    const { planStore, scenarios } = setup()
    planStore.plan.household.retirementAge = 40
    expect(await scenarios.saveCurrent()).toContain('Ungültige')
    expect(scenarios.saved).toHaveLength(0)
  })
})
