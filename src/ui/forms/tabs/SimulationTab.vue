<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { usePlanStore } from '@/stores/plan'
import NumberField from '../NumberField.vue'
import SwitchField from '../SwitchField.vue'

const { plan } = storeToRefs(usePlanStore())
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.simulation.paths"
        label="Anzahl Pfade"
        unit="count"
        path="simulation.paths"
        help="Zahl der simulierten Marktverläufe (1.000–100.000). Der Standardfehler der Erfolgsquote sinkt mit der Wurzel der Pfadzahl. Historische Sequenzen rechnen je Startjahr einen Pfad."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.simulation.seed"
        label="Seed"
        unit="integer"
        path="simulation.seed"
        help="Startwert des Zufallsgenerators. Gleicher Seed ergibt bitgleiche Ergebnisse; Varianten mit gleichem Seed nutzen dieselben Renditepfade."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.simulation.successTargetRate"
        label="Ziel-Erfolgsquote"
        unit="percent"
        path="simulation.successTargetRate"
        help="Mindestens angestrebte Erfolgsquote; das Dashboard markiert, ob sie erreicht wird."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SwitchField
        v-model="plan.simulation.outputReal"
        label="Ausgabe in Euro von heute"
        path="simulation.outputReal"
        help="Ergebnisse real (Kaufkraft des Startjahres) statt nominal anzeigen; entspricht dem Schalter „Real/Nominal“ oben."
      />
    </v-col>
  </v-row>
</template>
