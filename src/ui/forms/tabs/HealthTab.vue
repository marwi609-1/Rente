<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type { BridgeHealthInsurance, PensionHealthInsurance } from '@/domain/model/types'
import { defaultBridgeInsurance, defaultPensionInsurance } from '@/domain/model/variants'
import { usePlanStore } from '@/stores/plan'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import SwitchField from '../SwitchField.vue'

const { plan } = storeToRefs(usePlanStore())
const health = computed(() => plan.value.health)

const bridgeType = computed({
  get: () => health.value.bridgePhase.type,
  set: (type: BridgeHealthInsurance['type']) =>
    (health.value.bridgePhase = defaultBridgeInsurance(type, health.value)),
})

const pensionType = computed({
  get: () => health.value.pensionPhase.type,
  set: (type: PensionHealthInsurance['type']) =>
    (health.value.pensionPhase = defaultPensionInsurance(type, health.value)),
})
</script>

<template>
  <v-alert type="info" variant="tonal" density="compact" class="mb-4">
    In der Erwerbsphase sind die Beiträge im Netto-Gehalt enthalten und werden nicht modelliert.
  </v-alert>

  <h3 class="text-subtitle-1 mb-2">Vom Ruhestand bis zum Rentenbeginn</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="bridgeType"
        label="Versicherung"
        path="health.bridgePhase.type"
        :items="[
          { title: 'GKV freiwillig', value: 'gkv-voluntary' },
          { title: 'PKV', value: 'pkv' },
        ]"
        help="Freiwillig gesetzlich Versicherte zahlen auf Kapitalerträge den ermäßigten Satz plus Zusatzbeitrag und Pflege, mindestens auf die Mindestbemessungsgrundlage. In der PKV gilt der feste Beitrag."
      />
    </v-col>
    <template v-if="health.bridgePhase.type === 'pkv'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="health.bridgePhase.monthlyPremium"
          label="PKV-Beitrag"
          unit="eur-month"
          path="health.bridgePhase.monthlyPremium"
          help="Monatsbeitrag für Kranken- und Pflegeversicherung laut Versicherungsschein, heutiger Stand."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="health.bridgePhase.premiumGrowth"
          label="Beitragssteigerung"
          unit="percent-year"
          path="health.bridgePhase.premiumGrowth"
          help="Nominale jährliche Steigerung des PKV-Beitrags."
        />
      </v-col>
    </template>
  </v-row>
  <v-alert
    v-if="health.bridgePhase.type === 'pkv' && health.bridgePhase.monthlyPremium === 0"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-4"
  >
    Bitte den Monatsbeitrag laut Versicherungsschein eintragen.
  </v-alert>

  <h3 class="text-subtitle-1 mb-2">Ab Rentenbeginn</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="pensionType"
        label="Versicherung"
        path="health.pensionPhase.type"
        :items="[
          { title: 'GKV (KVdR oder freiwillig)', value: 'gkv' },
          { title: 'PKV', value: 'pkv' },
        ]"
        help="Wer privat versichert ist, bleibt in der Regel auch als Rentner in der PKV. Dann gilt der feste Beitrag abzüglich des Zuschusses der Rentenversicherung; Renten, Betriebsrenten und Kapitalerträge sind beitragsfrei."
      />
    </v-col>
    <template v-if="health.pensionPhase.type === 'pkv'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="health.pensionPhase.monthlyPremium"
          label="PKV-Beitrag im Ruhestand"
          unit="eur-month"
          path="health.pensionPhase.monthlyPremium"
          help="Monatsbeitrag für Kranken- und Pflegeversicherung im Ruhestand, heutiger Stand (ohne Krankentagegeld; der gesetzliche Zuschlag entfällt ab 60). Die Rentenversicherung zahlt einen Zuschuss von 8,75 % der gesetzlichen Rente, höchstens die Hälfte des Beitrags (§ 106 SGB VI)."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="health.pensionPhase.premiumGrowth"
          label="Beitragssteigerung"
          unit="percent-year"
          path="health.pensionPhase.premiumGrowth"
          help="Nominale jährliche Steigerung des PKV-Beitrags ab heute."
        />
      </v-col>
    </template>
    <v-col v-else cols="12" sm="6" md="4">
      <SwitchField
        v-model="health.kvdrEligible"
        label="KVdR-Vorversicherungszeit erfüllt"
        path="health.kvdrEligible"
        help="Pflichtversicherte Rentner (KVdR) zahlen Beiträge nur auf die Rente, nicht auf Kapitalerträge. Sonst gilt die freiwillige GKV mit Beiträgen auch auf Kapitalerträge."
      />
    </v-col>
  </v-row>
  <v-alert
    v-if="health.pensionPhase.type === 'pkv' && health.pensionPhase.monthlyPremium === 0"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-4"
  >
    Bitte den Monatsbeitrag im Ruhestand eintragen.
  </v-alert>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SwitchField
        v-model="plan.household.childless"
        label="Kinderlos"
        path="household.childless"
        help="Kinderlose ab 23 Jahren zahlen einen Zuschlag von 0,6 Prozentpunkten zur Pflegeversicherung."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="health.paramsGrowth"
        label="Wachstum der Rechengrößen"
        unit="percent-year"
        path="health.paramsGrowth"
        help="Jährliche Fortschreibung von Mindestbemessungsgrundlage und Beitragsbemessungsgrenze (folgt historisch den Löhnen)."
      />
    </v-col>
  </v-row>
</template>
