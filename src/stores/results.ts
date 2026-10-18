import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'

import { defaultEngineContext } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import type { MonteCarloSummary } from '@/domain/engine/summary'
import type { YearResult } from '@/domain/engine/types'
import type { RetirementPlan } from '@/domain/model/types'
import { validatePlan } from '@/domain/model/validation'
import { createWorkerPool } from '@/workers/pool'
import { runMonteCarlo, type SimulationBackend } from '@/workers/runner'
import { usePlanStore } from './plan'

/** Wartezeit nach der letzten Eingabe, bevor die Berechnung startet (Spezifikation M5). */
export const RECALC_DEBOUNCE_MS = 500

export type RunStatus =
  /** noch nichts geplant */
  | 'idle'
  /** Eingabe geändert, Start nach der Wartezeit */
  | 'scheduled'
  | 'running'
  | 'done'
  /** vom Nutzer abgebrochen; frühere Ergebnisse bleiben sichtbar */
  | 'aborted'
  /** der Plan enthält ungültige Eingaben */
  | 'invalid'
  | 'error'

let backendFactory: () => readonly SimulationBackend[] = () => createWorkerPool().backends

/** Ersetzt die Simulations-Backends (Tests); wirkt für Stores, die danach entstehen. */
export function setSimulationBackendFactory(factory: () => readonly SimulationBackend[]): void {
  backendFactory = factory
}

/** Schlüssel der rechenrelevanten Eingaben; die Ausgabeeinheit ändert nur die Darstellung. */
function simulationKey(plan: RetirementPlan): string {
  return JSON.stringify({ ...plan, simulation: { ...plan.simulation, outputReal: null } })
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Ergebnisse des aktuellen Plans: startet die Monte-Carlo-Simulation im Worker automatisch nach
 * jeder Eingabeänderung (mit Wartezeit), bricht veraltete Läufe ab und hält den deterministischen
 * Referenzpfad. Rechnet nicht selbst, sondern orchestriert Domäne und Worker.
 */
export const useResultsStore = defineStore('results', () => {
  const planStore = usePlanStore()
  let backends: readonly SimulationBackend[] | null = null

  const status = ref<RunStatus>('idle')
  const progress = ref({ completedPaths: 0, totalPaths: 0 })
  const error = ref<string | null>(null)
  const summary = shallowRef<MonteCarloSummary | null>(null)
  /** deterministischer Referenzpfad, nominal */
  const reference = shallowRef<YearResult[] | null>(null)
  /** Plan, zu dem `summary` und `reference` gehören */
  const resultPlan = shallowRef<RetirementPlan | null>(null)
  /** Sicht: sterblichkeitsgewichtet statt fester Horizont */
  const mortalityWeighted = ref(false)

  const outputReal = computed({
    get: () => planStore.plan.simulation.outputReal,
    set: (value: boolean) => (planStore.plan.simulation.outputReal = value),
  })

  /** Die angezeigten Ergebnisse gehören nicht (mehr) zum aktuellen Plan. */
  const stale = computed(
    () =>
      resultPlan.value !== null &&
      simulationKey(resultPlan.value) !== simulationKey(planStore.plan),
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let runId = 0

  function stopRunning(): void {
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = null
  }

  async function run(): Promise<void> {
    stopRunning()
    const id = ++runId
    // Momentaufnahme ohne reaktive Hülle, damit sie an die Worker übertragen werden kann
    const validation = validatePlan(JSON.parse(JSON.stringify(planStore.plan)))
    if (!validation.ok) {
      status.value = 'invalid'
      return
    }
    const plan = validation.plan
    const current = new AbortController()
    controller = current
    status.value = 'running'
    error.value = null
    progress.value = { completedPaths: 0, totalPaths: 0 }
    try {
      const rows = runDeterministic(plan, defaultEngineContext)
      backends ??= backendFactory()
      const result = await runMonteCarlo(plan, backends, {
        signal: current.signal,
        onProgress: (p) => {
          if (id === runId) progress.value = p
        },
      })
      if (id !== runId) return
      summary.value = result
      reference.value = rows
      resultPlan.value = plan
      status.value = 'done'
    } catch (e) {
      if (id !== runId) return
      if (isAbort(e)) {
        status.value = 'aborted'
      } else {
        status.value = 'error'
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      if (controller === current) controller = null
    }
  }

  /** Plant eine Berechnung nach der Wartezeit; ungültige Pläne werden sofort gemeldet. */
  function schedule(): void {
    stopRunning()
    runId++
    if (!planStore.validation.ok) {
      status.value = 'invalid'
      return
    }
    status.value = 'scheduled'
    timer = setTimeout(() => void run(), RECALC_DEBOUNCE_MS)
  }

  /** Bricht eine geplante oder laufende Berechnung ab. */
  function cancel(): void {
    if (status.value !== 'running' && status.value !== 'scheduled') return
    stopRunning()
    runId++
    status.value = 'aborted'
  }

  watch(() => simulationKey(planStore.plan), schedule, { immediate: true })

  return {
    status,
    progress,
    error,
    summary,
    reference,
    resultPlan,
    stale,
    mortalityWeighted,
    outputReal,
    run,
    cancel,
  }
})
