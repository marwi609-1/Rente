<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { historicalUsMeta } from '@/data/historical'
import { usePlanStore } from '@/stores/plan'
import { useResultsStore } from '@/stores/results'
import ChartCard from '@/ui/charts/ChartCard.vue'
import { allocationData, incomeData, wealthFanData } from '@/ui/charts/data'
import { fanChartOption, stackedAreaOption, stackedBarOption } from '@/ui/charts/options'
import { fanTable, stackedTable } from '@/ui/charts/tables'
import KpiCards from '@/ui/dashboard/KpiCards.vue'
import ResultsPlaceholder from '@/ui/components/ResultsPlaceholder.vue'
import { historicalDataNotice } from '@/ui/texts'
import { formatNumber } from '@/utils/format'
import { APP_VERSION } from '@/utils/version'

const { plan } = storeToRefs(usePlanStore())
const {
  summary,
  reference,
  resultPlan,
  outputReal,
  mortalityWeighted,
  stale,
  status,
  extrasStatus,
  extrasError,
  safeWithdrawal,
  fire,
} = storeToRefs(useResultsStore())

const extras = computed(() => ({
  status: extrasStatus.value,
  error: extrasError.value,
  safeWithdrawal: safeWithdrawal.value,
  fire: fire.value,
}))

const unitLabel = computed(() => (outputReal.value ? 'Euro von heute' : 'nominal'))
const updating = computed(
  () => stale.value && (status.value === 'running' || status.value === 'scheduled'),
)

const wealth = computed(() =>
  summary.value && resultPlan.value
    ? wealthFanData(summary.value, reference.value, resultPlan.value, outputReal.value)
    : null,
)
const income = computed(() => (summary.value ? incomeData(summary.value, outputReal.value) : null))
const allocation = computed(() =>
  summary.value && resultPlan.value ? allocationData(resultPlan.value, summary.value) : null,
)

const historicalNotice = computed(() =>
  resultPlan.value?.market.type === 'historical-sequence' ||
  resultPlan.value?.market.type === 'block-bootstrap'
    ? historicalDataNotice(historicalUsMeta.firstYear, historicalUsMeta.lastYear)
    : null,
)
</script>

<template>
  <v-container class="py-4">
    <div class="d-flex flex-wrap align-baseline justify-space-between ga-2">
      <h1 class="text-h5">Dashboard</h1>
      <span class="text-body-2 text-medium-emphasis" data-testid="app-version">
        Version {{ APP_VERSION }}
      </span>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Plan „{{ plan.name }}“<template v-if="summary">
        · {{ formatNumber(summary.paths) }} Pfade · Beträge {{ unitLabel }}</template
      >
    </p>

    <ResultsPlaceholder v-if="!summary || !resultPlan" />

    <div v-else :class="{ updating }" data-testid="dashboard-results">
      <v-alert
        v-if="stale"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-4"
        data-testid="stale-notice"
      >
        Die Ergebnisse gehören zu den vorherigen Eingaben.
      </v-alert>
      <v-alert v-if="historicalNotice" type="info" variant="tonal" density="compact" class="mb-4">
        {{ historicalNotice }}
      </v-alert>

      <KpiCards
        :summary="summary"
        :plan="resultPlan"
        :real="outputReal"
        :mortality-weighted="mortalityWeighted"
        :extras="extras"
      />

      <v-row class="mt-2">
        <v-col v-if="wealth" cols="12">
          <ChartCard
            title="Vermögensentwicklung"
            :subtitle="`Depotwert zum Jahresende, ${unitLabel}: Median, Bänder der Perzentile 10–90 und 25–75, deterministischer Referenzpfad`"
            :option="(theme, layout) => fanChartOption(wealth!, theme, layout)"
            :table="() => fanTable(wealth!)"
            :height="380"
            test-id="chart-wealth"
          />
        </v-col>
        <v-col v-if="income" cols="12" md="6">
          <ChartCard
            title="Einkommen und Ausgaben"
            :subtitle="`Median-Pfad je Alter, ${unitLabel}: Netto-Rente und depotfinanzierter Konsum ergeben den Konsum, darauf Steuern und KV/PV`"
            :option="(theme, layout) => stackedBarOption(income!, theme, layout)"
            :table="() => stackedTable(income!)"
            test-id="chart-income"
          />
        </v-col>
        <v-col v-if="allocation" cols="12" md="6">
          <ChartCard
            title="Asset Allocation"
            :subtitle="
              allocation.source === 'target'
                ? 'Zielallokation der Strategie je Alter'
                : 'Bucket: Mediane der Anteile über alle Pfade, auf 100 % normiert'
            "
            :option="(theme, layout) => stackedAreaOption(allocation!, theme, layout)"
            :table="() => stackedTable(allocation!, (v) => `${formatNumber(v, 1)} %`)"
            test-id="chart-allocation"
          />
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<style scoped>
/* Während der Neuberechnung bleibt die vorherige Darstellung gedimmt stehen. */
.updating {
  opacity: 0.6;
  transition: opacity 0.2s;
}
</style>
