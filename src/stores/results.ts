import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'

import { defaultEngineContext } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import type { FireResult, SafeWithdrawalResult } from '@/domain/engine/search'
import type { MonteCarloSummary } from '@/domain/engine/summary'
import type { YearResult } from '@/domain/engine/types'
import type { RetirementPlan } from '@/domain/model/types'
import { validatePlan } from '@/domain/model/validation'
import { simulationBackends } from '@/workers/backends'
import { runFireStatus, runMonteCarlo, runSafeWithdrawal } from '@/workers/runner'
import { usePlanStore } from './plan'
import { simulationKey, snapshot } from './planKey'

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

/** Zustand der nachgelagerten Suchen (sichere Entnahme, FIRE-Status). */
export type ExtrasStatus = 'idle' | 'running' | 'done' | 'aborted' | 'error'

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Ergebnisse des aktuellen Plans: startet die Monte-Carlo-Simulation im Worker automatisch nach
 * jeder Eingabeänderung (mit Wartezeit), bricht veraltete Läufe ab und hält den deterministischen
 * Referenzpfad. Danach folgen im Hintergrund die Suchen nach sicherer Entnahme und FIRE-Alter.
 * Rechnet nicht selbst, sondern orchestriert Domäne und Worker.
 */
export const useResultsStore = defineStore('results', () => {
  const planStore = usePlanStore()

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

  const extrasStatus = ref<ExtrasStatus>('idle')
  const extrasError = ref<string | null>(null)
  const safeWithdrawal = shallowRef<SafeWithdrawalResult | null>(null)
  const fire = shallowRef<FireResult | null>(null)

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

  /** Sichere Entnahme und FIRE-Status zum gerade fertigen Lauf. */
  async function runExtras(plan: RetirementPlan, result: MonteCarloSummary, id: number) {
    const signal = controller?.signal
    extrasStatus.value = 'running'
    extrasError.value = null
    safeWithdrawal.value = null
    fire.value = null
    try {
      const backends = simulationBackends()
      const withdrawal = await runSafeWithdrawal(plan, backends, { signal })
      if (id !== runId) return
      safeWithdrawal.value = withdrawal
      const fireResult = await runFireStatus(plan, result.successRate, backends, { signal })
      if (id !== runId) return
      fire.value = fireResult
      extrasStatus.value = 'done'
    } catch (e) {
      if (id !== runId) return
      extrasStatus.value = isAbort(e) ? 'aborted' : 'error'
      if (!isAbort(e)) extrasError.value = messageOf(e)
    }
  }

  async function run(): Promise<void> {
    stopRunning()
    const id = ++runId
    const validation = validatePlan(snapshot(planStore.plan))
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
      const result = await runMonteCarlo(plan, simulationBackends(), {
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
      void runExtras(plan, result, id)
    } catch (e) {
      if (id !== runId) return
      if (isAbort(e)) {
        status.value = 'aborted'
      } else {
        status.value = 'error'
        error.value = messageOf(e)
      }
    }
  }

  function markExtrasStopped(): void {
    if (extrasStatus.value === 'running') extrasStatus.value = 'aborted'
  }

  /** Plant eine Berechnung nach der Wartezeit; ungültige Pläne werden sofort gemeldet. */
  function schedule(): void {
    stopRunning()
    runId++
    markExtrasStopped()
    if (!planStore.validation.ok) {
      status.value = 'invalid'
      return
    }
    status.value = 'scheduled'
    timer = setTimeout(() => void run(), RECALC_DEBOUNCE_MS)
  }

  /** Bricht eine geplante oder laufende Berechnung samt Suchen ab. */
  function cancel(): void {
    const active = status.value === 'running' || status.value === 'scheduled'
    if (!active && extrasStatus.value !== 'running') return
    stopRunning()
    runId++
    markExtrasStopped()
    if (active) status.value = 'aborted'
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
    extrasStatus,
    extrasError,
    safeWithdrawal,
    fire,
    run,
    cancel,
  }
})
