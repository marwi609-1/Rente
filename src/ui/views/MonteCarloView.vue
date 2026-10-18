<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useResultsStore } from '@/stores/results'
import ChartCard from '@/ui/charts/ChartCard.vue'
import { ageDistributionData, histogramData, wealthFanData } from '@/ui/charts/data'
import { categoryBarOption, fanChartOption } from '@/ui/charts/options'
import { categoryTable, fanTable } from '@/ui/charts/tables'
import PwrSection from '@/ui/components/PwrSection.vue'
import ResultsPlaceholder from '@/ui/components/ResultsPlaceholder.vue'
import { marketModelLabels } from '@/ui/labels'
import { formatNumber, formatPercent } from '@/utils/format'

const { summary, reference, resultPlan, outputReal, stale, status } = storeToRefs(useResultsStore())

const unitLabel = computed(() => (outputReal.value ? 'Euro von heute' : 'nominal'))
const updating = computed(
  () => stale.value && (status.value === 'running' || status.value === 'scheduled'),
)

const fan = computed(() =>
  summary.value && resultPlan.value
    ? wealthFanData(summary.value, reference.value, resultPlan.value, outputReal.value, [
        [5, 95],
        [10, 90],
        [25, 75],
      ])
    : null,
)

const ages = computed(() =>
  summary.value && resultPlan.value ? ageDistributionData(summary.value, resultPlan.value) : null,
)

const terminal = computed(() =>
  summary.value
    ? histogramData(
        outputReal.value ? summary.value.terminalWealth.real : summary.value.terminalWealth.nominal,
        'Pfade',
      )
    : null,
)

const ageNote = computed(() => {
  const s = summary.value
  const p = resultPlan.value
  if (!s || !p) return ''
  const never = `${formatNumber(s.neverDepleted)} Pfade (${formatPercent(s.neverDepleted / s.paths, 1)}) erschöpfen das Depot bis zum Horizont nicht`
  return p.household.longevity.type === 'fixed'
    ? `${never}. Beim festen Horizont gibt es kein Sterbealter.`
    : `${never}; ${formatNumber(s.survivingHorizon)} Pfade (${formatPercent(s.survivingHorizon / s.paths, 1)}) erleben den Horizont.`
})
</script>

<template>
  <v-container class="py-4">
    <h1 class="text-h5">Monte Carlo</h1>
    <p v-if="summary && resultPlan" class="text-body-2 text-medium-emphasis mb-4">
      {{ marketModelLabels[resultPlan.market.type] }} · {{ formatNumber(summary.paths) }} Pfade ·
      Seed {{ resultPlan.simulation.seed }} · Beträge {{ unitLabel }}
    </p>

    <ResultsPlaceholder v-if="!summary || !resultPlan" />

    <v-row v-else :class="{ updating }">
      <v-col v-if="fan" cols="12">
        <ChartCard
          title="Fan Chart des Depotwerts"
          :subtitle="`Perzentile 5–95, 10–90 und 25–75 je Alter, Median und deterministischer Referenzpfad, ${unitLabel}`"
          :option="(theme, layout) => fanChartOption(fan!, theme, layout)"
          :table="() => fanTable(fan!)"
          :height="400"
          test-id="chart-fan"
        />
      </v-col>
      <v-col v-if="ages" cols="12" md="6">
        <ChartCard
          title="Erschöpfungs- und Sterbealter"
          :subtitle="ageNote"
          :option="(theme, layout) => categoryBarOption(ages!, theme, layout, 'Alter')"
          :table="() => categoryTable(ages!, 'Alter')"
          test-id="chart-ages"
        />
      </v-col>
      <v-col v-if="terminal && resultPlan" cols="12" md="6">
        <ChartCard
          title="Verteilung des Endvermögens"
          :subtitle="`Depotwert mit ${resultPlan.household.planningHorizonAge}, ${unitLabel}; Klassen bis zum 99. Perzentil, darüber zusammengefasst`"
          :option="(theme, layout) => categoryBarOption(terminal!, theme, layout, 'Endvermögen')"
          :table="() => categoryTable(terminal!, 'Endvermögen')"
          test-id="chart-terminal"
        />
      </v-col>
      <v-col cols="12">
        <PwrSection />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.updating {
  opacity: 0.6;
  transition: opacity 0.2s;
}
</style>
