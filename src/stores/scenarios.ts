import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { MonteCarloSummary } from '@/domain/engine/summary'
import { createPresetScenarios, type PresetScenario } from '@/domain/model/presets'
import { exportPlan, importPlan } from '@/domain/model/scenarioFile'
import type { RetirementPlan } from '@/domain/model/types'
import { validatePlan, type PlanIssue } from '@/domain/model/validation'
import {
  deleteScenario,
  getScenario,
  listScenarios,
  openScenarioDb,
  putScenario,
  type ScenarioDb,
  type StoredScenario,
} from '@/persistence/scenarioDb'
import { simulationBackends } from '@/workers/backends'
import { runMonteCarlo } from '@/workers/runner'
import { usePlanStore } from './plan'
import { snapshot } from './planKey'

/** Höchstens so viele Szenarien im Vergleich (Spezifikation 12.1). */
export const MAX_COMPARED = 3

/** Kennung des aktuell bearbeiteten Plans im Vergleich. */
export const CURRENT_PLAN_ID = 'current'

export interface ComparedScenario {
  id: string
  name: string
  plan: RetirementPlan
  summary: MonteCarloSummary
}

export type ComparisonStatus = 'idle' | 'running' | 'done' | 'aborted' | 'error'

let openDb: () => Promise<ScenarioDb> = () => openScenarioDb()

/** Ersetzt die Datenbank (Tests). */
export function setScenarioDbFactory(factory: () => Promise<ScenarioDb>): void {
  openDb = factory
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Szenarien: gespeicherte Pläne in IndexedDB, mitgelieferte Vorlagen, JSON-Export und -Import sowie
 * der Vergleich von bis zu drei Szenarien mit denselben Zufallspfaden.
 */
export const useScenariosStore = defineStore('scenarios', () => {
  const planStore = usePlanStore()
  let db: Promise<ScenarioDb> | null = null
  const database = () => (db ??= openDb())

  // flach: die Pläne bleiben einfache Objekte (übertragbar an Worker und IndexedDB)
  const saved = shallowRef<StoredScenario[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)
  /** gespeichertes Szenario, das gerade bearbeitet wird */
  const activeId = ref<string | null>(null)
  const presets = computed<PresetScenario[]>(() =>
    createPresetScenarios(planStore.plan.household.startYear),
  )

  const selected = ref<string[]>([])
  const comparisonStatus = ref<ComparisonStatus>('idle')
  const comparisonError = ref<string | null>(null)
  const comparisonProgress = ref({ done: 0, total: 0 })
  const comparison = shallowRef<ComparedScenario[]>([])
  let comparisonController: AbortController | null = null

  async function guard<T>(work: () => Promise<T>): Promise<T | undefined> {
    try {
      error.value = null
      return await work()
    } catch (e) {
      error.value = `Speicherzugriff fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`
      return undefined
    }
  }

  async function refresh(): Promise<void> {
    await guard(async () => {
      saved.value = await listScenarios(await database())
      loaded.value = true
    })
  }

  /** Gültige Momentaufnahme des aktuellen Plans oder die Meldungen der Validierung. */
  function currentPlan(): { plan: RetirementPlan } | { issues: PlanIssue[] } {
    const result = validatePlan(snapshot(planStore.plan))
    return result.ok ? { plan: result.plan } : { issues: result.issues }
  }

  async function store(scenario: StoredScenario): Promise<void> {
    await guard(async () => {
      await putScenario(await database(), scenario)
      saved.value = await listScenarios(await database())
    })
  }

  /**
   * Speichert den aktuellen Plan: über das gerade bearbeitete Szenario oder (`asNew`) als neues.
   * Liefert eine Fehlermeldung, wenn der Plan ungültig ist.
   */
  async function saveCurrent(asNew = false): Promise<string | null> {
    const current = currentPlan()
    if ('issues' in current) return 'Ungültige Pläne können nicht gespeichert werden.'
    const id = !asNew && activeId.value !== null ? activeId.value : newId()
    await store({ id, name: current.plan.name, plan: current.plan, updatedAt: Date.now() })
    if (error.value === null) activeId.value = id
    return error.value
  }

  /** Lädt ein gespeichertes Szenario oder eine Vorlage in die Eingabe. */
  async function load(id: string): Promise<string | null> {
    const preset = presets.value.find((p) => p.id === id)
    const plan = preset
      ? preset.plan
      : (await guard(async () => getScenario(await database(), id)))?.plan
    if (!plan) return error.value ?? 'Das Szenario wurde nicht gefunden.'
    const result = validatePlan(plan)
    if (!result.ok) return 'Das gespeicherte Szenario ist ungültig und wurde nicht geladen.'
    planStore.plan = structuredClone(result.plan)
    activeId.value = preset ? null : id
    return null
  }

  /** Legt eine Kopie an („… (Kopie)“); Vorlagen werden so zu eigenen Szenarien. */
  async function duplicate(id: string): Promise<void> {
    const preset = presets.value.find((p) => p.id === id)
    const source = preset
      ? { name: preset.plan.name, plan: preset.plan }
      : await guard(async () => getScenario(await database(), id))
    if (!source) return
    const plan = structuredClone(source.plan)
    plan.name = `${source.name} (Kopie)`.slice(0, 100)
    await store({ id: newId(), name: plan.name, plan, updatedAt: Date.now() })
  }

  async function remove(id: string): Promise<void> {
    await guard(async () => {
      await deleteScenario(await database(), id)
      saved.value = await listScenarios(await database())
    })
    if (activeId.value === id) activeId.value = null
    selected.value = selected.value.filter((s) => s !== id)
  }

  /** JSON-Datei eines Szenarios bzw. des aktuellen Plans. */
  function exportScenario(id: string): { fileName: string; content: string } | null {
    const plan =
      id === CURRENT_PLAN_ID
        ? (() => {
            const current = currentPlan()
            return 'plan' in current ? current.plan : null
          })()
        : (presets.value.find((p) => p.id === id)?.plan ??
          saved.value.find((s) => s.id === id)?.plan)
    if (!plan) return null
    const safeName =
      plan.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'szenario'
    return { fileName: `${safeName}.json`, content: exportPlan(plan) }
  }

  /**
   * Importiert eine Szenario-Datei als neues gespeichertes Szenario und lädt es in die Eingabe.
   */
  async function importScenario(
    text: string,
  ): Promise<{ ok: true; name: string } | { ok: false; message: string; issues: PlanIssue[] }> {
    const result = importPlan(text)
    if (!result.ok) return result
    const id = newId()
    await store({ id, name: result.plan.name, plan: result.plan, updatedAt: Date.now() })
    if (error.value !== null) return { ok: false, message: error.value, issues: [] }
    planStore.plan = structuredClone(result.plan)
    activeId.value = id
    return { ok: true, name: result.plan.name }
  }

  function toggleSelected(id: string): void {
    if (selected.value.includes(id)) selected.value = selected.value.filter((s) => s !== id)
    else if (selected.value.length < MAX_COMPARED) selected.value = [...selected.value, id]
  }

  async function planFor(id: string): Promise<{ name: string; plan: RetirementPlan } | null> {
    if (id === CURRENT_PLAN_ID) {
      const current = currentPlan()
      return 'plan' in current
        ? { name: `${current.plan.name} (aktuell)`, plan: current.plan }
        : null
    }
    const preset = presets.value.find((p) => p.id === id)
    if (preset) return { name: preset.plan.name, plan: preset.plan }
    const stored = saved.value.find((s) => s.id === id)
    return stored ? { name: stored.name, plan: stored.plan } : null
  }

  /**
   * Rechnet die ausgewählten Szenarien nacheinander. Alle verwenden den Seed des ersten Szenarios,
   * damit Unterschiede nicht vom Zufall der Pfade herrühren (Common Random Numbers).
   */
  async function compare(): Promise<void> {
    comparisonController?.abort()
    const controller = new AbortController()
    comparisonController = controller
    comparisonStatus.value = 'running'
    comparisonError.value = null
    comparison.value = []
    const ids = [...selected.value]
    comparisonProgress.value = { done: 0, total: ids.length }
    try {
      const entries = []
      for (const id of ids) {
        const entry = await planFor(id)
        if (!entry) throw new Error('Ein ausgewähltes Szenario ist ungültig oder fehlt.')
        entries.push({ id, ...entry })
      }
      const seed = entries[0]?.plan.simulation.seed
      const results: ComparedScenario[] = []
      for (const entry of entries) {
        const plan = structuredClone(entry.plan)
        plan.simulation.seed = seed
        const summary = await runMonteCarlo(plan, simulationBackends(), {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        results.push({ id: entry.id, name: entry.name, plan, summary })
        comparisonProgress.value = { done: results.length, total: ids.length }
      }
      comparison.value = results
      comparisonStatus.value = 'done'
    } catch (e) {
      if (comparisonController !== controller) return
      if (e instanceof Error && e.name === 'AbortError') {
        comparisonStatus.value = 'aborted'
      } else {
        comparisonStatus.value = 'error'
        comparisonError.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      if (comparisonController === controller) comparisonController = null
    }
  }

  function cancelComparison(): void {
    if (!comparisonController) return
    comparisonController.abort()
    comparisonController = null
    comparisonStatus.value = 'aborted'
  }

  return {
    saved,
    loaded,
    error,
    activeId,
    presets,
    selected,
    comparison,
    comparisonStatus,
    comparisonError,
    comparisonProgress,
    refresh,
    saveCurrent,
    load,
    duplicate,
    remove,
    exportScenario,
    importScenario,
    toggleSelected,
    compare,
    cancelComparison,
  }
})
