import { computed, inject, onBeforeUnmount, provide, reactive, watch, type InjectionKey } from 'vue'

import type { PlanIssue } from '@/domain/model/validation'
import type { InputTab } from '@/router'
import { usePlanStore } from '@/stores/plan'

/** Felder, die ihre Validierungsmeldungen selbst anzeigen. */
interface FieldRegistry {
  paths: Map<string, number>
}

const REGISTRY: InjectionKey<FieldRegistry> = Symbol('field-registry')

/** Meldungen der zod-Validierung des aktuellen Plans. */
export function usePlanIssues() {
  const store = usePlanStore()
  const issues = computed<PlanIssue[]>(() => (store.validation.ok ? [] : store.validation.issues))
  const messagesFor = (path: string) =>
    issues.value.filter((i) => i.path === path).map((i) => i.message)
  return { issues, messagesFor }
}

/** Stellt die Registrierung der Felder für eine Eingabeansicht bereit. */
export function provideFieldRegistry(): FieldRegistry {
  const registry = reactive<FieldRegistry>({ paths: new Map() })
  provide(REGISTRY, registry)
  return registry
}

/** Meldet ein Feld an, das die Meldungen zu `path` selbst anzeigt (solange es eingeblendet ist). */
export function useFieldRegistration(path: () => string | undefined): void {
  const registry = inject(REGISTRY, null)
  if (!registry) return
  let registered: string | undefined
  const update = () => {
    const next = path()
    if (next === registered) return
    if (registered !== undefined) release(registered)
    if (next !== undefined) registry.paths.set(next, (registry.paths.get(next) ?? 0) + 1)
    registered = next
  }
  const release = (p: string) => {
    const count = (registry.paths.get(p) ?? 1) - 1
    if (count <= 0) registry.paths.delete(p)
    else registry.paths.set(p, count)
  }
  watch(path, update, { immediate: true })
  onBeforeUnmount(() => {
    if (registered !== undefined) release(registered)
  })
}

/** Ordnet eine Meldung dem Eingabe-Tab zu, in dem das Feld steht. */
export function tabOfIssue(path: string): InputTab {
  if (path === 'household.churchTaxRate') return 'steuern'
  if (path === 'household.childless') return 'krankenversicherung'
  const head = path.split('.')[0]
  switch (head) {
    case 'name':
    case 'household':
      return 'haushalt'
    case 'portfolio':
    case 'savings':
      return 'vermoegen'
    case 'spending':
      return 'konsum'
    case 'statePension':
      return 'rente'
    case 'additionalIncome':
      return 'einkuenfte'
    case 'health':
      return 'krankenversicherung'
    case 'tax':
      return 'steuern'
    case 'strategy':
    case 'rebalancing':
      return 'strategie'
    case 'market':
      return 'markt'
    default:
      return 'simulation'
  }
}
