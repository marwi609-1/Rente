import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createDefaultPlan } from '@/domain/model/defaults'
import type { RetirementPlan } from '@/domain/model/types'
import { validatePlan } from '@/domain/model/validation'

/** Aktueller Plan; die Validierung erfolgt über das zod-Schema der Domäne. */
export const usePlanStore = defineStore('plan', () => {
  const plan = ref<RetirementPlan>(createDefaultPlan(new Date().getFullYear()))
  const validation = computed(() => validatePlan(plan.value))
  return { plan, validation }
})
