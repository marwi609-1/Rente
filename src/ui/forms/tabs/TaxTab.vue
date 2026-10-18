<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type { Basiszins } from '@/domain/model/types'
import { defaultBasiszins } from '@/domain/model/variants'
import { usePlanStore } from '@/stores/plan'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import SwitchField from '../SwitchField.vue'

const { plan } = storeToRefs(usePlanStore())
const tax = computed(() => plan.value.tax)

const basiszinsType = computed({
  get: () => tax.value.basiszins.type,
  set: (type: Basiszins['type']) => (tax.value.basiszins = defaultBasiszins(type)),
})
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SwitchField
        v-model="tax.enabled"
        label="Steuern berücksichtigen"
        path="tax.enabled"
        help="Abgeltungsteuer mit Soli und Kirchensteuer, Vorabpauschale und Einkommensteuer auf die Rente. Ausgeschaltet rechnet das Modell ohne Steuern."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="tax.saverAllowance"
        label="Sparer-Pauschbetrag"
        unit="eur-year"
        path="tax.saverAllowance"
        help="Steuerfreie Kapitalerträge pro Jahr; 1.000 € für Alleinstehende (§ 20 Abs. 9 EStG). Bleibt nominal fest."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="plan.household.churchTaxRate"
        label="Kirchensteuer"
        path="household.churchTaxRate"
        :items="[
          { title: 'keine', value: 0 },
          { title: '8 % (Bayern, Baden-Württemberg)', value: 0.08 },
          { title: '9 % (übrige Länder)', value: 0.09 },
        ]"
        unit="Prozent der Einkommen- bzw. Abgeltungsteuer"
        help="Kirchensteuersatz des Bundeslandes; mindert über die Abgeltungsteuerformel den Steuersatz auf Kapitalerträge leicht."
      />
    </v-col>
  </v-row>

  <h3 class="text-subtitle-1 mb-2">Investmentfonds</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="tax.partialExemption.equity"
        label="Teilfreistellung Aktien-ETF"
        unit="percent"
        path="tax.partialExemption.equity"
        help="Steuerfreier Anteil der Erträge von Aktienfonds (mindestens 51 % Aktien): 30 % nach § 20 Abs. 1 InvStG."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="tax.partialExemption.bonds"
        label="Teilfreistellung Anleihe-ETF"
        unit="percent"
        path="tax.partialExemption.bonds"
        help="Anleihefonds haben keine Teilfreistellung (0 %)."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="basiszinsType"
        label="Basiszins der Vorabpauschale"
        path="tax.basiszins.type"
        :items="[
          { title: 'fest', value: 'fixed' },
          { title: 'Erwartete Anleiherendite', value: 'bond-mean' },
        ]"
        help="Basiszins nach § 18 Abs. 4 InvStG für die jährliche Vorabpauschale thesaurierender Fonds. „Erwartete Anleiherendite“ verwendet den Mittelwert der Anleiherenditen aus dem Marktmodell."
      />
    </v-col>
    <v-col v-if="tax.basiszins.type === 'fixed'" cols="12" sm="6" md="4">
      <NumberField
        v-model="tax.basiszins.rate"
        label="Basiszins"
        unit="percent-year"
        path="tax.basiszins.rate"
        help="Für 2026 hat das BMF 3,20 % veröffentlicht. Die Vorabpauschale beträgt 70 % davon auf den Wert zu Jahresbeginn, höchstens den Wertzuwachs."
      />
    </v-col>
  </v-row>
  <p class="text-body-2 text-medium-emphasis mb-4">
    Einstand nach Durchschnittsmethode (FIFO wird nicht unterstützt).
  </p>

  <h3 class="text-subtitle-1 mb-2">Einkommensteuer</h3>
  <v-row dense>
    <v-col cols="12" sm="6">
      <SwitchField
        v-model="tax.guenstigerpruefung"
        label="Günstigerprüfung"
        path="tax.guenstigerpruefung"
        help="Kapitalerträge mit dem persönlichen Steuersatz versteuern, wenn das günstiger ist (§ 32d Abs. 6 EStG). Nur außerhalb der Erwerbsphase, weil das Erwerbseinkommen nicht modelliert ist."
      />
    </v-col>
    <v-col cols="12" sm="6">
      <SwitchField
        v-model="tax.indexBracketsWithInflation"
        label="Tarif mit Inflation fortschreiben"
        path="tax.indexBracketsWithInflation"
        help="Eckwerte des Einkommensteuertarifs und Soli-Freigrenze wachsen mit dem Preisindex (Ausgleich der kalten Progression). Pauschbeträge bleiben nominal fest."
      />
    </v-col>
  </v-row>
</template>
