import { computed, ref, shallowRef, watch, type ShallowRef } from 'vue'
import { defineStore } from 'pinia'

import type { HeatmapConfig, HeatmapResult } from '@/domain/engine/heatmap'
import type { PwrSummary } from '@/domain/engine/pwr'
import { validatePlan } from '@/domain/model/validation'
import { simulationBackends } from '@/workers/backends'
import { runHeatmap, runPerfectWithdrawal } from '@/workers/runner'
import { usePlanStore } from './plan'
import { simulationKey, snapshot } from './planKey'

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'aborted' | 'invalid' | 'error'

/** Zustand einer Analyse auf Knopfdruck; wird als Ganzes ersetzt (große Ergebnisse, keine Tiefenreaktivität). */
export interface AnalysisState<T> {
  status: AnalysisStatus
  error: string | null
  progress: { done: number; total: number }
  result: T | null
  /** Schlüssel des Plans, zu dem `result` gehört */
  planKey: string | null
}

function initialState<T>(): AnalysisState<T> {
  return {
    status: 'idle',
    error: null,
    progress: { done: 0, total: 0 },
    result: null,
    planKey: null,
  }
}

/** Voreinstellung: Entnahmerate 2–8 % des heutigen Depotwerts in Schritten von 1 %. */
export const DEFAULT_HEATMAP_CONFIG: HeatmapConfig = {
  mode: 'rate',
  from: 0.02,
  to: 0.08,
  step: 0.01,
}

/**
 * Heatmap und Perfect Withdrawal Rate: rechenintensiv, daher nur auf Knopfdruck. Eine
 * Eingabeänderung bricht laufende Analysen ab; fertige Ergebnisse bleiben als veraltet sichtbar.
 */
export const useAnalysisStore = defineStore('analysis', () => {
  const planStore = usePlanStore()
  const heatmapConfig = ref<HeatmapConfig>({ ...DEFAULT_HEATMAP_CONFIG })
  const heatmap = shallowRef(initialState<HeatmapResult>())
  const pwr = shallowRef(initialState<PwrSummary>())
  const controllers = new Map<'heatmap' | 'pwr', AbortController>()

  const currentKey = computed(() => simulationKey(planStore.plan))
  const heatmapStale = computed(
    () => heatmap.value.planKey !== null && heatmap.value.planKey !== currentKey.value,
  )
  const pwrStale = computed(
    () => pwr.value.planKey !== null && pwr.value.planKey !== currentKey.value,
  )

  async function start<T>(
    which: 'heatmap' | 'pwr',
    state: ShallowRef<AnalysisState<T>>,
    work: (
      plan: unknown,
      signal: AbortSignal,
      progress: (done: number, total: number) => void,
    ) => Promise<T>,
  ): Promise<void> {
    controllers.get(which)?.abort()
    const input = snapshot(planStore.plan)
    const update = (patch: Partial<AnalysisState<T>>) =>
      (state.value = { ...state.value, ...patch })
    if (!validatePlan(input).ok) {
      update({ status: 'invalid' })
      return
    }
    const controller = new AbortController()
    controllers.set(which, controller)
    const key = currentKey.value
    update({ status: 'running', error: null, progress: { done: 0, total: 0 } })
    try {
      const result = await work(input, controller.signal, (done, total) => {
        if (controllers.get(which) === controller) update({ progress: { done, total } })
      })
      if (controller.signal.aborted) return
      update({ status: 'done', result, planKey: key })
    } catch (e) {
      if (controllers.get(which) !== controller) return
      if (e instanceof Error && e.name === 'AbortError') update({ status: 'aborted' })
      else update({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    } finally {
      if (controllers.get(which) === controller) controllers.delete(which)
    }
  }

  function computeHeatmap(): Promise<void> {
    const config = { ...heatmapConfig.value }
    return start('heatmap', heatmap, (plan, signal, progress) =>
      runHeatmap(plan, config, simulationBackends(), {
        signal,
        onProgress: (p) => progress(p.completedCells, p.totalCells),
      }),
    )
  }

  function computePwr(): Promise<void> {
    return start('pwr', pwr, (plan, signal, progress) =>
      runPerfectWithdrawal(plan, simulationBackends(), {
        signal,
        onProgress: (p) => progress(p.completedPaths, p.totalPaths),
      }),
    )
  }

  function cancel(which: 'heatmap' | 'pwr'): void {
    const controller = controllers.get(which)
    if (!controller) return
    controller.abort()
    controllers.delete(which)
    const state = which === 'heatmap' ? heatmap : pwr
    state.value = { ...state.value, status: 'aborted' }
  }

  // Analysen zu veralteten Eingaben werden nicht mehr gebraucht.
  watch(currentKey, () => {
    cancel('heatmap')
    cancel('pwr')
  })

  return {
    heatmapConfig,
    heatmap,
    pwr,
    heatmapStale,
    pwrStale,
    computeHeatmap,
    computePwr,
    cancel,
  }
})
