<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiRefresh } from '@mdi/js'

import { useResultsStore } from '@/stores/results'
import { formatNumber } from '@/utils/format'

const results = useResultsStore()
const { status, progress, error, outputReal, mortalityWeighted, stale } = storeToRefs(results)

const unit = computed({
  get: () => (outputReal.value ? 'real' : 'nominal'),
  set: (value: string) => (outputReal.value = value === 'real'),
})

const view = computed({
  get: () => (mortalityWeighted.value ? 'mortality' : 'horizon'),
  set: (value: string) => (mortalityWeighted.value = value === 'mortality'),
})

const percentDone = computed(() =>
  progress.value.totalPaths > 0
    ? Math.round((100 * progress.value.completedPaths) / progress.value.totalPaths)
    : 0,
)

const statusText = computed(() => {
  switch (status.value) {
    case 'idle':
      return ''
    case 'scheduled':
      return 'Berechnung startet gleich …'
    case 'running':
      return progress.value.totalPaths > 0
        ? `Berechnung läuft: ${formatNumber(progress.value.completedPaths)} von ${formatNumber(progress.value.totalPaths)} Pfaden`
        : 'Berechnung läuft …'
    case 'done':
      return 'Ergebnisse aktuell'
    case 'aborted':
      return stale.value
        ? 'Berechnung abgebrochen – angezeigt werden die Ergebnisse der vorherigen Eingaben.'
        : 'Berechnung abgebrochen.'
    case 'invalid':
      return 'Die Eingaben enthalten Fehler; berechnet wird erst nach der Korrektur.'
    case 'error':
      return `Die Berechnung ist fehlgeschlagen: ${error.value ?? 'unbekannter Fehler'}`
  }
  return ''
})
</script>

<template>
  <div class="results-toolbar px-4 pt-3" data-testid="results-toolbar">
    <div class="d-flex flex-wrap ga-2 align-center">
      <v-btn-toggle
        v-model="unit"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        aria-label="Ausgabe in Euro von heute oder nominal"
      >
        <v-btn value="real" size="small">Real</v-btn>
        <v-btn value="nominal" size="small">Nominal</v-btn>
      </v-btn-toggle>
      <v-btn-toggle
        v-model="view"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        aria-label="Fester Horizont oder sterblichkeitsgewichtet"
      >
        <v-btn value="horizon" size="small">Fester Horizont</v-btn>
        <v-btn value="mortality" size="small">Sterblichkeit</v-btn>
      </v-btn-toggle>
    </div>

    <div class="d-flex flex-wrap align-center ga-2 mt-2 text-body-2" role="status">
      <v-icon v-if="status === 'done'" :icon="mdiCheckCircleOutline" color="success" size="small" />
      <v-icon
        v-else-if="status === 'invalid' || status === 'error'"
        :icon="mdiAlertCircleOutline"
        color="error"
        size="small"
      />
      <span class="status-text" data-testid="run-status">{{ statusText }}</span>
      <router-link v-if="status === 'invalid'" :to="{ name: 'inputs' }"
        >Zu den Eingaben</router-link
      >
      <v-btn
        v-if="status === 'running' || status === 'scheduled'"
        size="small"
        variant="tonal"
        color="primary"
        data-testid="cancel-run"
        @click="results.cancel()"
      >
        Abbrechen
      </v-btn>
      <v-btn
        v-if="status === 'aborted' || status === 'error'"
        size="small"
        variant="tonal"
        color="primary"
        :prepend-icon="mdiRefresh"
        @click="results.run()"
      >
        Neu berechnen
      </v-btn>
    </div>
    <v-progress-linear
      :active="status === 'running' || status === 'scheduled'"
      :indeterminate="status === 'scheduled' || progress.totalPaths === 0"
      :model-value="percentDone"
      color="primary"
      height="3"
      class="mt-2"
      aria-label="Fortschritt der Berechnung"
    />
  </div>
</template>

<style scoped>
.status-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
