<script setup lang="ts">
import { computed } from 'vue'

import type { MonteCarloSummary } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import KpiCard from './KpiCard.vue'
import { buildKpis } from './kpis'

const props = defineProps<{
  summary: MonteCarloSummary
  plan: RetirementPlan
  real: boolean
  mortalityWeighted: boolean
}>()

const kpis = computed(() =>
  buildKpis(props.summary, props.plan, {
    real: props.real,
    mortalityWeighted: props.mortalityWeighted,
  }),
)
</script>

<template>
  <v-row>
    <v-col v-for="kpi in kpis" :key="kpi.id" cols="12" sm="6" lg="4">
      <KpiCard :kpi="kpi" />
    </v-col>
  </v-row>
</template>
