<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useAnalysisStore } from '@/stores/analysis'
import ChartCard from '@/ui/charts/ChartCard.vue'
import { histogramData, pwrStartYearData } from '@/ui/charts/data'
import { categoryBarOption, startYearBarOption } from '@/ui/charts/options'
import { categoryTable, startYearTable } from '@/ui/charts/tables'
import { formatEuro, formatNumber, formatPercent } from '@/utils/format'

const analysis = useAnalysisStore()
const { pwr, pwrStale } = storeToRefs(analysis)

const running = computed(() => pwr.value.status === 'running')
const histogram = computed(() =>
  pwr.value.result ? histogramData(pwr.value.result.histogram, 'Pfade') : null,
)
const byStartYear = computed(() => (pwr.value.result ? pwrStartYearData(pwr.value.result) : null))
const belowPlan = computed(() =>
  byStartYear.value ? byStartYear.value.values.filter((v) => v < byStartYear.value!.reference) : [],
)
const startYearSubtitle = computed(() => {
  const data = byStartYear.value
  const result = pwr.value.result
  if (!data || !result) return ''
  const cyclic =
    result.cyclicFromYear === null
      ? ''
      : ` Ab Startjahr ${result.cyclicFromYear} reicht die Folge über das Datenende und wird mit dem ersten Datenjahr fortgesetzt (grau hinterlegt).`
  return `Historische Sequenzen: PWR, wenn die Renditefolge im jeweiligen Jahr beginnt (erstes Planjahr = Startjahr), Euro von heute; orange = unter dem geplanten Netto-Konsum (${formatNumber(belowPlan.value.length)} von ${formatNumber(data.values.length)} Startjahren).${cyclic}`
})
const percentDone = computed(() =>
  pwr.value.progress.total > 0 ? (100 * pwr.value.progress.done) / pwr.value.progress.total : 0,
)
const quantiles = computed(() => {
  const result = pwr.value.result
  if (!result) return []
  return result.percentiles
    .filter((q) => [10, 50, 90].includes(q.p))
    .map((q) => ({
      label: q.p === 50 ? 'Median' : `${q.p}. Perzentil`,
      amount: formatEuro(q.amount),
      rate: result.portfolioValue > 0 ? formatPercent(q.amount / result.portfolioValue, 1) : '–',
    }))
})
</script>

<template>
  <v-card variant="outlined" data-testid="pwr-section">
    <v-card-item>
      <v-card-title class="text-subtitle-1">Perfect Withdrawal Rate</v-card-title>
      <v-card-subtitle class="text-wrap">
        Je Pfad der konstante reale Netto-Konsum, mit dem das Depot genau zum Horizont bis auf das
        Zielvermögen aufgebraucht ist (feste reale Entnahme, Steuern, Rente und KV wie im Plan)
      </v-card-subtitle>
    </v-card-item>
    <v-card-text>
      <div class="d-flex flex-wrap align-center ga-2 mb-2">
        <v-btn
          color="primary"
          variant="flat"
          :disabled="running"
          data-testid="pwr-run"
          @click="analysis.computePwr()"
        >
          {{ pwr.result ? 'PWR neu berechnen' : 'PWR berechnen' }}
        </v-btn>
        <v-btn v-if="running" variant="tonal" @click="analysis.cancel('pwr')">Abbrechen</v-btn>
        <span v-if="running" class="text-body-2" role="status">
          {{ formatNumber(pwr.progress.done) }} von {{ formatNumber(pwr.progress.total) }} Pfaden
        </span>
      </div>
      <v-progress-linear
        v-if="running"
        :model-value="percentDone"
        color="primary"
        height="4"
        class="mb-2"
        aria-label="Fortschritt der PWR-Berechnung"
      />
      <v-alert
        v-if="pwr.status === 'invalid'"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        Die Eingaben des Plans enthalten Fehler.
      </v-alert>
      <v-alert
        v-else-if="pwr.status === 'error'"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        Die Berechnung ist fehlgeschlagen: {{ pwr.error }}
      </v-alert>
      <p v-else-if="pwr.status === 'aborted'" class="text-body-2 mb-2" role="status">
        Berechnung abgebrochen.
      </p>
      <v-alert
        v-if="pwr.result && pwrStale"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-2"
      >
        Die PWR gehört zu früheren Eingaben.
      </v-alert>

      <template v-if="pwr.result && histogram">
        <dl class="pwr-list text-body-2 mb-4" data-testid="pwr-quantiles">
          <template v-for="q in quantiles" :key="q.label">
            <dt class="text-medium-emphasis">{{ q.label }}</dt>
            <dd>{{ q.amount }} p. a.</dd>
            <dd class="text-medium-emphasis">{{ q.rate }} des Depots</dd>
          </template>
        </dl>
        <ChartCard
          title="Verteilung der PWR"
          :subtitle="`Netto-Konsum p. a. in heutiger Kaufkraft, ${formatNumber(pwr.result.paths)} Pfade; Klassen bis zum 99. Perzentil`"
          :option="(theme, layout) => categoryBarOption(histogram!, theme, layout, 'PWR')"
          :table="() => categoryTable(histogram!, 'PWR')"
          test-id="chart-pwr"
        />
        <p
          v-if="pwr.result.targetWealth > 0"
          class="text-body-2 text-medium-emphasis mt-2"
          data-testid="pwr-target"
        >
          Zielvermögen am Horizont: {{ formatEuro(pwr.result.targetWealth) }} (Euro von heute).
        </p>
        <ChartCard
          v-if="byStartYear"
          class="mt-4"
          title="PWR je Startjahr"
          :subtitle="startYearSubtitle"
          :option="(theme, layout) => startYearBarOption(byStartYear!, theme, layout)"
          :table="() => startYearTable(byStartYear!)"
          test-id="chart-pwr-start-year"
        />
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.pwr-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 2px 16px;
  margin: 0;
}

.pwr-list dd {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
</style>
