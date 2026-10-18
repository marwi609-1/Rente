<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { mortalityDe } from '@/data/mortality'
import { simulationYears } from '@/domain/engine/timeline'
import { fitGompertz } from '@/domain/longevity/gompertzFit'
import { cohortQx } from '@/domain/longevity/mortalityTable'
import type { Longevity } from '@/domain/model/types'
import { defaultLongevity } from '@/domain/model/variants'
import { usePlanStore } from '@/stores/plan'
import { longevityLabels } from '@/ui/labels'
import { formatNumber } from '@/utils/format'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import TextField from '../TextField.vue'

const { plan } = storeToRefs(usePlanStore())
const household = computed(() => plan.value.household)

const longevityType = computed({
  get: () => household.value.longevity.type,
  set: (type: Longevity['type']) => (household.value.longevity = defaultLongevity(type)),
})

const longevityItems = (Object.keys(longevityLabels) as Longevity['type'][]).map((value) => ({
  title: longevityLabels[value],
  value,
}))

/** Gompertz-Werte, die die Destatis-Kohortentafel für Jahrgang und Geschlecht nachbilden. */
const fit = computed(() => {
  const { startYear, currentAge, sex } = household.value
  const cohort = startYear - currentAge
  if (
    !Number.isInteger(currentAge) ||
    cohort < mortalityDe.firstCohort ||
    cohort > mortalityDe.lastCohort ||
    currentAge < mortalityDe.firstAge ||
    currentAge >= 95
  ) {
    return null
  }
  return { cohort, sex, ...fitGompertz(cohortQx(mortalityDe, sex, cohort, currentAge), currentAge) }
})

const fitText = computed(() =>
  fit.value
    ? `Für den Jahrgang ${fit.value.cohort} (${fit.value.sex === 'm' ? 'männlich' : 'weiblich'}) bildet m = ${formatNumber(fit.value.modalAge, 1)}, b = ${formatNumber(fit.value.dispersion, 1)} die Destatis-Kohortensterbetafel (Variante 3, hohe Lebenserwartung) ab dem aktuellen Alter nach.`
    : 'Für diesen Jahrgang deckt die Destatis-Kohortensterbetafel keine Vergleichswerte ab.',
)

const fitApplied = computed(() => {
  const l = household.value.longevity
  return (
    fit.value !== null &&
    l.type === 'gompertz' &&
    l.modalAge === fit.value.modalAge &&
    l.dispersion === fit.value.dispersion
  )
})

function applyFit(): void {
  if (fit.value === null) return
  household.value.longevity = {
    type: 'gompertz',
    modalAge: fit.value.modalAge,
    dispersion: fit.value.dispersion,
  }
}

const years = computed(() => {
  const n = simulationYears(household.value)
  return Number.isFinite(n) && n > 0 ? n : null
})
</script>

<template>
  <v-row dense>
    <v-col cols="12" md="8">
      <TextField
        v-model="plan.name"
        label="Planname"
        path="name"
        help="Bezeichnung des Szenarios, z. B. „Basis“ oder „Ausstieg mit 60“."
      />
    </v-col>
  </v-row>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="household.currentAge"
        label="Aktuelles Alter"
        unit="age"
        path="household.currentAge"
        help="Alter im Startjahr. Ein Simulationsschritt entspricht einem Kalender- und einem Lebensjahr."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="household.retirementAge"
        label="Ruhestand ab"
        unit="age"
        path="household.retirementAge"
        help="Erstes Lebensjahr ohne Erwerbseinkommen. Ab diesem Alter endet die Sparrate, der Konsum wird aus Depot und Rente bestritten."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="household.planningHorizonAge"
        label="Planungshorizont"
        unit="age"
        path="household.planningHorizonAge"
        help="Fester Horizont: Das Jahr, in dem dieses Alter erreicht wird, wird noch simuliert. Die Erfolgsquote bezieht sich auf alle Jahre bis dahin."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="household.sex"
        label="Geschlecht"
        path="household.sex"
        :items="[
          { title: 'männlich', value: 'm' },
          { title: 'weiblich', value: 'w' },
        ]"
        help="Nur für die Sterbetafel: Frauen leben im Mittel einige Jahre länger."
      />
    </v-col>
  </v-row>
  <p class="text-body-2 text-medium-emphasis mb-4" data-testid="timeline-info">
    Startjahr {{ household.startYear
    }}<template v-if="years"> · {{ years }} simulierte Jahre</template>
  </p>

  <h3 class="text-subtitle-1 mb-2">Langlebigkeit</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="longevityType"
        label="Modell"
        path="household.longevity.type"
        :items="longevityItems"
        help="Bestimmt die sterblichkeitsgewichtete Sicht: Ein Pfad zählt dort als erfolgreich, wenn bis zum gezogenen Sterbealter kein Fehljahr auftritt."
      />
    </v-col>
    <template v-if="household.longevity.type === 'gompertz'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="household.longevity.modalAge"
          label="Modalalter m"
          unit="years"
          path="household.longevity.modalAge"
          :help="`Häufigstes Sterbealter der Gompertz-Verteilung. ${fitText}`"
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="household.longevity.dispersion"
          label="Dispersion b"
          unit="years"
          path="household.longevity.dispersion"
          help="Streuung der Gompertz-Verteilung; größere Werte verteilen die Sterbealter breiter um das Modalalter."
        />
      </v-col>
    </template>
  </v-row>
  <div
    v-if="household.longevity.type === 'gompertz' && fit"
    class="d-flex flex-wrap align-center ga-2 mb-4 text-body-2"
    data-testid="gompertz-fit"
  >
    <span class="text-medium-emphasis">{{ fitText }}</span>
    <v-btn v-if="!fitApplied" size="small" variant="tonal" color="primary" @click="applyFit">
      Übernehmen
    </v-btn>
  </div>
  <v-alert
    v-if="household.longevity.type === 'table'"
    type="info"
    variant="tonal"
    density="compact"
    class="mb-2"
  >
    Destatis-Kohortensterbetafel (Variante 3, hohe Lebenserwartung) für den Jahrgang
    {{ household.startYear - household.currentAge }}, Geschlecht laut Eingabe. Abgedeckt sind die
    Jahrgänge 1926–2008 ab Alter 18.
  </v-alert>
  <v-alert
    v-else-if="household.longevity.type === 'fixed'"
    type="info"
    variant="tonal"
    density="compact"
    class="mb-2"
  >
    Ohne Sterblichkeitsmodell entspricht die sterblichkeitsgewichtete Sicht dem festen Horizont.
  </v-alert>
</template>
