<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { paramsDe2026 } from '@/data/params-de-2026'
import { accessFactor, claimAtExit } from '@/domain/social/pension'
import { taxableShare } from '@/domain/tax/pensionTax'
import { usePlanStore } from '@/stores/plan'
import { formatEuro, formatPercent } from '@/utils/format'
import NumberField from '../NumberField.vue'
import SwitchField from '../SwitchField.vue'

const store = usePlanStore()
const { plan } = storeToRefs(store)
const pension = computed(() => plan.value.statePension)

/** Kennzahlen der Rente, sobald die Eingaben dafür gültig sind. */
const derived = computed(() => {
  if (!store.validation.ok) {
    const prefixes = ['statePension', 'household.currentAge', 'household.retirementAge']
    if (store.validation.issues.some((i) => prefixes.some((p) => i.path.startsWith(p)))) return null
  }
  const { household } = plan.value
  const factor = accessFactor(pension.value, paramsDe2026)
  const startYear = household.startYear + pension.value.startAge - household.currentAge
  return {
    factor: formatPercent(factor, 1),
    monthly: formatEuro(claimAtExit(household, pension.value) * factor),
    startYear,
    taxable: formatPercent(taxableShare(startYear, paramsDe2026), 1),
  }
})
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="pension.monthlyGrossCurrent"
        label="Anspruch bisher"
        unit="eur-month"
        path="statePension.monthlyGrossCurrent"
        help="Bisher erworbener Rentenanspruch brutto laut Renteninformation („Höhe Ihrer künftigen Regelaltersrente ohne weitere Beiträge“), heutige Werte."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="pension.monthlyGrossProjected"
        label="Hochrechnung bis Regelalter"
        unit="eur-month"
        path="statePension.monthlyGrossProjected"
        help="Hochgerechnete Monatsrente brutto bei Beiträgen bis zur Regelaltersgrenze laut Renteninformation. Beim früheren Ausstieg wird linear zwischen beiden Werten interpoliert."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="pension.adjustmentRate"
        label="Rentenanpassung"
        unit="percent-year"
        path="statePension.adjustmentRate"
        help="Nominale jährliche Rentenerhöhung ab heute. Liegt sie unter der Inflation, sinkt die Kaufkraft der Rente."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="pension.regularAge"
        label="Regelaltersgrenze"
        unit="age"
        path="statePension.regularAge"
        help="Alter für die abschlagsfreie Regelaltersrente; für Jahrgänge ab 1964 sind es 67 Jahre."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="pension.startAge"
        label="Rentenbeginn"
        unit="age"
        path="statePension.startAge"
        help="Gewünschter Rentenbeginn. Früher als die Regelaltersgrenze: 0,3 % Abschlag je Monat (frühestens 63, mit 35 Jahren Wartezeit); später: 0,5 % Zuschlag je Monat."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SwitchField
        v-model="pension.earlyStartAllowed"
        label="35 Jahre Wartezeit erfüllt"
        path="statePension.earlyStartAllowed"
        help="Voraussetzung für die Altersrente für langjährig Versicherte, also einen Rentenbeginn vor der Regelaltersgrenze."
      />
    </v-col>
  </v-row>

  <v-alert v-if="derived" type="info" variant="tonal" density="compact" data-testid="pension-info">
    Zugangsfaktor {{ derived.factor }} · Monatsrente bei Beginn {{ derived.monthly }} (heutige
    Werte) · Rentenbeginn {{ derived.startYear }}, Besteuerungsanteil {{ derived.taxable }}
  </v-alert>
</template>
