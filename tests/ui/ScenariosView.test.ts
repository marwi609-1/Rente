// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'

import { createDefaultPlan } from '@/domain/model/defaults'
import { exportPlan } from '@/domain/model/scenarioFile'
import { openScenarioDb } from '@/persistence/scenarioDb'
import { usePlanStore } from '@/stores/plan'
import { setScenarioDbFactory, useScenariosStore } from '@/stores/scenarios'
import ScenariosView from '@/ui/views/ScenariosView.vue'
import { inApp, mountWithApp } from '../helpers/mount'

let counter = 0
let current: VueWrapper | null = null
afterEach(() => {
  current?.unmount()
  current = null
})

async function open() {
  const name = `view-scenarios-${++counter}`
  setScenarioDbFactory(() => openScenarioDb(name))
  const pinia = createPinia()
  const { wrapper } = await mountWithApp(inApp(ScenariosView), pinia, '/szenarien')
  current = wrapper
  await flushPromises()
  return { wrapper, store: useScenariosStore(pinia), plan: usePlanStore(pinia) }
}

/** Wartet, bis IndexedDB (fake) geantwortet hat. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function chooseFile(wrapper: VueWrapper, content: string) {
  const input = wrapper.get('[data-testid="import-input"]')
  const file = new File([content], 'szenario.json', { type: 'application/json' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await settle()
}

describe('Szenario-Ansicht', () => {
  it('zeigt die drei mitgelieferten Vorlagen', async () => {
    const { wrapper } = await open()
    for (const id of ['preset-basis', 'preset-pessimistisch', 'preset-optimistisch']) {
      expect(wrapper.find(`[data-testid="scenario-${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('Student-t ν = 5')
  })

  it('speichert den aktuellen Plan und löscht ihn nach Rückfrage', async () => {
    const { wrapper, store, plan } = await open()
    plan.plan.name = 'Ausstieg mit 60'
    await wrapper.get('[data-testid="save-new"]').trigger('click')
    await settle()
    expect(wrapper.get('[data-testid="scenario-message"]').text()).toContain('gespeichert')
    expect(store.saved.map((s) => s.name)).toEqual(['Ausstieg mit 60'])
    const id = store.saved[0].id
    expect(wrapper.text()).toContain('in Bearbeitung')

    await wrapper.get(`[aria-label="Ausstieg mit 60 löschen"]`).trigger('click')
    await flushPromises()
    const confirm = document.querySelector('[data-testid="confirm-delete"]') as HTMLElement
    confirm.click()
    await settle()
    expect(store.saved).toHaveLength(0)
    expect(wrapper.find(`[data-testid="scenario-${id}"]`).exists()).toBe(false)
  })

  it('importiert gültige Dateien und meldet Fehler verständlich', async () => {
    const { wrapper, store } = await open()
    const plan = createDefaultPlan(2026)
    plan.name = 'Importiert'
    await chooseFile(wrapper, exportPlan(plan))
    expect(store.saved.map((s) => s.name)).toEqual(['Importiert'])
    expect(store.saved[0].plan).toEqual(plan)

    await chooseFile(wrapper, JSON.stringify({ schemaVersion: 1, yearlyWithdrawal: 100_000 }))
    expect(wrapper.get('[data-testid="scenario-message"]').text()).toContain('schemaVersion 1')

    const invalid = createDefaultPlan(2026)
    invalid.household.retirementAge = 40
    await chooseFile(wrapper, exportPlan(invalid))
    const message = wrapper.get('[data-testid="scenario-message"]').text()
    expect(message).toContain('ungültige Eingaben')
    expect(message).toContain('household.retirementAge')
  })

  it('lädt eine Vorlage in die Eingabe', async () => {
    const { wrapper, plan } = await open()
    await wrapper.get('[aria-label="Pessimistisch laden"]').trigger('click')
    await settle()
    expect(plan.plan.name).toBe('Pessimistisch')
    expect(plan.plan.market.type).toBe('student-t')
  })

  it('erlaubt den Vergleich erst ab zwei und höchstens drei Szenarien', async () => {
    const { wrapper, store } = await open()
    const button = () => wrapper.get('[data-testid="compare-run"]')
    expect(button().attributes('disabled')).toBeDefined()
    store.toggleSelected('preset-basis')
    store.toggleSelected('preset-optimistisch')
    await flushPromises()
    expect(button().attributes('disabled')).toBeUndefined()
    store.toggleSelected('preset-pessimistisch')
    store.toggleSelected('current')
    expect(store.selected).toHaveLength(3)
  })
})
