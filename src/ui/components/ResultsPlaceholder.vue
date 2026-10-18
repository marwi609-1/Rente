<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useResultsStore } from '@/stores/results'

const { status, error } = storeToRefs(useResultsStore())
</script>

<template>
  <v-card variant="tonal" class="pa-6 text-center" data-testid="results-placeholder">
    <template v-if="status === 'invalid'">
      <p class="mb-2">Die Eingaben enthalten Fehler; Ergebnisse gibt es nach der Korrektur.</p>
      <v-btn color="primary" variant="flat" :to="{ name: 'inputs' }">Zu den Eingaben</v-btn>
    </template>
    <template v-else-if="status === 'error'">
      <p>Die Berechnung ist fehlgeschlagen: {{ error }}</p>
    </template>
    <template v-else-if="status === 'aborted'">
      <p>Die Berechnung wurde abgebrochen. Über „Neu berechnen“ oben startet sie erneut.</p>
    </template>
    <template v-else>
      <v-progress-circular indeterminate color="primary" class="mb-2" />
      <p>Die Simulation läuft …</p>
    </template>
  </v-card>
</template>
