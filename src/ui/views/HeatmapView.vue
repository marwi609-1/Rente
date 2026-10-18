<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import {
  HEATMAP_EQUITY,
  HEATMAP_PATHS,
  heatmapConfigSchema,
  heatmapRows,
  type HeatmapConfig,
} from '@/domain/engine/heatmap'
import { DEFAULT_HEATMAP_CONFIG, useAnalysisStore } from '@/stores/analysis'
import { usePlanStore } from '@/stores/plan'
import ChartCard from '@/ui/charts/ChartCard.vue'
import { heatmapChartData } from '@/ui/charts/data'
import { heatmapOption } from '@/ui/charts/options'
import { heatmapTable } from '@/ui/charts/tables'
import NumberField from '@/ui/forms/NumberField.vue'
import SelectField from '@/ui/forms/SelectField.vue'
import { formatNumber, formatPercent } from '@/utils/format'

const planStore = usePlanStore()
const analysis = useAnalysisStore()
const { heatmapConfig, heatmap, heatmapStale } = storeToRefs(analysis)

const mode = computed({
  get: () => heatmapConfig.value.mode,
  set: (next: HeatmapConfig['mode']) => {
    if (next === heatmapConfig.value.mode) return
    if (next === 'rate') {
      heatmapConfig.value = { ...DEFAULT_HEATMAP_CONFIG }
    } else {
      // um den geplanten Netto-Konsum, in Schritten von rund 10 %
      const base = Math.max(10_000, planStore.plan.spending.netConsumption || 0)
      const step = Math.max(1_000, Math.round(base / 10 / 1_000) * 1_000)
      heatmapConfig.value = {
        mode: 'consumption',
        from: Math.max(0, base - 4 * step),
        to: base + 4 * step,
        step,
      }
    }
  },
})

const configIssues = computed(() => {
  const result = heatmapConfigSchema.safeParse(heatmapConfig.value)
  const byField: Record<'from' | 'to' | 'step', string[]> = { from: [], to: [], step: [] }
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (field === 'from' || field === 'to' || field === 'step') byField[field].push(issue.message)
    }
  }
  return { ok: result.success, byField }
})

const cells = computed(() =>
  configIssues.value.ok ? heatmapRows(heatmapConfig.value).length * HEATMAP_EQUITY.length : 0,
)

const unit = computed(() => (heatmapConfig.value.mode === 'rate' ? 'percent' : 'eur-year'))
const running = computed(() => heatmap.value.status === 'running')
const chart = computed(() => (heatmap.value.result ? heatmapChartData(heatmap.value.result) : null))
const percentDone = computed(() =>
  heatmap.value.progress.total > 0
    ? (100 * heatmap.value.progress.done) / heatmap.value.progress.total
    : 0,
)
</script>

<template>
  <v-container class="py-4">
    <h1 class="text-h5">Heatmap</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Erfolgsquote je Aktienquote (feste Allokation, 0–100 %) und Entnahme, mit
      {{ formatNumber(HEATMAP_PATHS) }} Pfaden je Zelle und denselben Renditepfaden in allen Zellen.
      Jede Zeile setzt eine feste reale Entnahme; der Mindestkonsum wird im Verhältnis des Plans
      mitgeführt. Die übrigen Eingaben stammen aus dem aktuellen Plan.
    </p>

    <v-card variant="outlined" class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <SelectField
              v-model="mode"
              label="Zeilen"
              path="heatmap.mode"
              :items="[
                { title: 'Entnahmerate', value: 'rate' },
                { title: 'Netto-Konsum', value: 'consumption' },
              ]"
              help="Entnahmerate: Netto-Konsum p. a. in Prozent des heutigen Depotwerts. Netto-Konsum: Betrag p. a. in heutiger Kaufkraft."
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <NumberField
              v-model="heatmapConfig.from"
              label="von"
              :unit="unit"
              path="heatmap.from"
              :messages="configIssues.byField.from"
              help="Erste Zeile des Rasters."
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <NumberField
              v-model="heatmapConfig.to"
              label="bis"
              :unit="unit"
              path="heatmap.to"
              :messages="configIssues.byField.to"
              help="Letzte Zeile des Rasters (einschließlich)."
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <NumberField
              v-model="heatmapConfig.step"
              label="Schritt"
              :unit="unit"
              path="heatmap.step"
              :messages="configIssues.byField.step"
              help="Abstand der Zeilen; höchstens 25 Zeilen."
            />
          </v-col>
        </v-row>
        <div class="d-flex flex-wrap align-center ga-2">
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!configIssues.ok || running"
            data-testid="heatmap-run"
            @click="analysis.computeHeatmap()"
          >
            Heatmap berechnen
          </v-btn>
          <v-btn v-if="running" variant="tonal" @click="analysis.cancel('heatmap')">
            Abbrechen
          </v-btn>
          <span class="text-body-2 text-medium-emphasis">
            {{ formatNumber(cells) }} Zellen · {{ formatNumber(cells * HEATMAP_PATHS) }} simulierte
            Pfade
          </span>
        </div>
        <v-progress-linear
          v-if="running"
          :model-value="percentDone"
          color="primary"
          height="4"
          class="mt-3"
          aria-label="Fortschritt der Heatmap"
        />
        <p v-if="running" class="text-body-2 mt-1" role="status">
          {{ heatmap.progress.done }} von {{ heatmap.progress.total }} Zellen fertig
        </p>
        <v-alert
          v-if="heatmap.status === 'invalid'"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Die Eingaben des Plans enthalten Fehler.
        </v-alert>
        <v-alert
          v-else-if="heatmap.status === 'error'"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Die Berechnung ist fehlgeschlagen: {{ heatmap.error }}
        </v-alert>
        <p v-else-if="heatmap.status === 'aborted'" class="text-body-2 mt-3" role="status">
          Berechnung abgebrochen.
        </p>
      </v-card-text>
    </v-card>

    <v-alert
      v-if="chart && heatmapStale"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      Die Heatmap gehört zu früheren Eingaben.
    </v-alert>

    <ChartCard
      v-if="chart && heatmap.result"
      title="Erfolgsquote nach Aktienquote und Entnahme"
      :subtitle="`${chart.rowName} (Zeilen) × Aktienquote (Spalten), ${formatNumber(heatmap.result.pathsPerCell)} Pfade je Zelle; Ziel-Erfolgsquote des Plans ${formatPercent(planStore.plan.simulation.successTargetRate, 0)}`"
      :option="(theme, layout) => heatmapOption(chart!, theme, layout)"
      :table="() => heatmapTable(chart!)"
      :height="Math.max(320, 120 + 32 * chart.rows.length)"
      test-id="chart-heatmap"
    />
  </v-container>
</template>
