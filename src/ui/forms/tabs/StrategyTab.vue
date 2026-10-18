<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type { StrategyConfig } from '@/domain/model/types'
import { defaultStrategy } from '@/domain/model/variants'
import { usePlanStore } from '@/stores/plan'
import { strategyLabels } from '@/ui/labels'
import { formatPercent } from '@/utils/format'
import ListRows from '../ListRows.vue'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import SwitchField from '../SwitchField.vue'

const { plan } = storeToRefs(usePlanStore())
const strategy = computed(() => plan.value.strategy)

const strategyType = computed({
  get: () => strategy.value.type,
  set: (type: StrategyConfig['type']) =>
    (plan.value.strategy = defaultStrategy(type, plan.value.household, strategy.value)),
})

const strategyItems = (Object.keys(strategyLabels) as StrategyConfig['type'][]).map((value) => ({
  title: strategyLabels[value],
  value,
}))

/** Neuer Glidepath-Punkt fünf Jahre nach dem letzten. */
function nextGlidepathPoint() {
  const s = strategy.value
  const last = s.type === 'glidepath' ? s.points.at(-1) : undefined
  return { age: (last?.age ?? plan.value.household.retirementAge) + 5, equity: last?.equity ?? 0.6 }
}

/** Anleihenanteil der festen Allokation als Rest. */
const fixedBonds = computed(() => {
  const s = strategy.value
  if (s.type !== 'fixed') return null
  const bonds = 1 - s.equity - s.cash
  return Number.isFinite(bonds) && bonds >= 0 ? formatPercent(bonds, 1) : null
})
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="strategyType"
        label="Strategie"
        path="strategy.type"
        :items="strategyItems"
        help="Wie sich die Zielallokation aus Aktien-ETF, Anleihe-ETF und Cash über das Leben verändert."
      />
    </v-col>
  </v-row>

  <template v-if="strategy.type === 'fixed'">
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.equity"
          label="Aktienanteil"
          unit="percent"
          path="strategy.equity"
          help="Konstanter Zielanteil des Aktien-ETF."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.cash"
          label="Cash-Anteil"
          unit="percent"
          path="strategy.cash"
          help="Konstanter Zielanteil Tagesgeld; der Rest geht in den Anleihe-ETF."
        />
      </v-col>
    </v-row>
    <p v-if="fixedBonds" class="text-body-2 text-medium-emphasis mb-4">
      Anleihen: {{ fixedBonds }}
    </p>
  </template>

  <template v-else-if="strategy.type === 'glidepath'">
    <ListRows
      v-model="strategy.points"
      title="Glidepath-Punkte"
      add-label="Punkt hinzufügen"
      empty-text="Mindestens ein Punkt ist nötig."
      :min-items="1"
      :create="nextGlidepathPoint"
      :row-label="(i) => `Glidepath-Punkt ${i + 1}`"
    >
      <template #default="{ item, index }">
        <v-col cols="12" sm="6">
          <NumberField
            v-model="item.age"
            label="Alter"
            unit="age"
            :path="`strategy.points.${index}.age`"
            help="Alter des Punktes; dazwischen wird die Aktienquote linear interpoliert, davor und danach bleibt sie konstant. Aufsteigend sortiert."
          />
        </v-col>
        <v-col cols="12" sm="6">
          <NumberField
            v-model="item.equity"
            label="Aktienanteil"
            unit="percent"
            :path="`strategy.points.${index}.equity`"
            help="Zielanteil des Aktien-ETF in diesem Alter."
          />
        </v-col>
      </template>
    </ListRows>
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.cash"
          label="Cash-Anteil"
          unit="percent"
          path="strategy.cash"
          help="Fester Zielanteil Tagesgeld in allen Altern; Anleihen sind der Rest."
        />
      </v-col>
    </v-row>
  </template>

  <template v-else-if="strategy.type === 'bond-tent'">
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.startAge"
          label="Startalter"
          unit="age"
          path="strategy.startAge"
          help="Ab diesem Alter sinkt die Aktienquote linear zum Tiefpunkt; davor gilt die Startquote."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.startEquity"
          label="Aktienanteil zu Beginn"
          unit="percent"
          path="strategy.startEquity"
          help="Aktienquote bis zum Startalter."
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.peakAge"
          label="Tiefpunktalter"
          unit="age"
          path="strategy.peakAge"
          help="Alter mit der niedrigsten Aktienquote, typischerweise der Ruhestandsbeginn (Schutz vor Crashs zu Beginn der Entnahme)."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.peakEquity"
          label="Aktienanteil am Tiefpunkt"
          unit="percent"
          path="strategy.peakEquity"
          help="Minimum der Aktienquote; darf nicht über Start- und Endquote liegen."
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.endAge"
          label="Endalter"
          unit="age"
          path="strategy.endAge"
          help="Bis zu diesem Alter steigt die Aktienquote wieder an; danach bleibt sie konstant."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.endEquity"
          label="Aktienanteil am Ende"
          unit="percent"
          path="strategy.endEquity"
          help="Aktienquote ab dem Endalter."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.cash"
          label="Cash-Anteil"
          unit="percent"
          path="strategy.cash"
          help="Fester Zielanteil Tagesgeld; Anleihen sind der Rest."
        />
      </v-col>
    </v-row>
  </template>

  <template v-else-if="strategy.type === 'bucket'">
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.cashYears"
          label="Cash-Puffer"
          unit="years"
          path="strategy.cashYears"
          help="Cash-Ziel als Vielfaches der erwarteten Netto-Lücke des Folgejahres (Konsum minus Netto-Rente). Entnahmen kommen zuerst aus Cash."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.bondYears"
          label="Anleihen-Puffer"
          unit="years"
          path="strategy.bondYears"
          help="Anleihe-Ziel als Vielfaches der erwarteten Netto-Lücke; der Rest des Depots liegt in Aktien."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <SelectField
          v-model="strategy.refillRule"
          label="Auffüllregel"
          path="strategy.refillRule"
          :items="[
            { title: 'jährlich', value: 'annual' },
            { title: 'nur nach Aktiengewinnen', value: 'equity-up-only' },
          ]"
          help="Zum Jahresende wird Cash aus Anleihen und werden Anleihen aus Aktien aufgefüllt. „Nur nach Aktiengewinnen“ verkauft Aktien nur, wenn ihre Jahresrendite über der Schwelle lag."
        />
      </v-col>
      <v-col v-if="strategy.refillRule === 'equity-up-only'" cols="12" sm="6" md="4">
        <NumberField
          v-model="strategy.equityUpThreshold"
          label="Schwelle Aktienrendite"
          unit="percent"
          path="strategy.equityUpThreshold"
          help="Mindestrendite der Aktien im abgelaufenen Jahr (nach TER), ab der Aktien zum Auffüllen verkauft werden."
        />
      </v-col>
    </v-row>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Vor dem Ruhestand gilt die Aufteilung, die sich zu Ruhestandsbeginn ergäbe, wie bei einer
      festen Allokation.
    </p>
  </template>

  <v-alert
    v-if="strategy.type === 'glidepath' || strategy.type === 'bond-tent'"
    type="info"
    variant="tonal"
    density="compact"
    class="mb-4"
  >
    Steigende Aktienquoten im Ruhestand und Bond Tents (Pfau/Kitces 2014) helfen vor allem in Pfaden
    mit schlechten frühen Renditen. Vergleiche sie deshalb auch mit Block-Bootstrap oder
    historischen Sequenzen, nicht nur mit normalverteilten Renditen.
  </v-alert>

  <h3 class="text-subtitle-1 mb-2">Rebalancing</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.rebalancing.band"
        label="Toleranzband"
        unit="percent"
        path="rebalancing.band"
        help="Absolute Abweichung eines Anteils vom Ziel (in Prozentpunkten), ab der zum Jahresende umgeschichtet wird. 0 % bedeutet jährliches Rebalancing."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <SwitchField
        v-model="plan.rebalancing.taxAware"
        label="Steueroptimiert"
        path="rebalancing.taxAware"
        help="Zuflüsse gehen in untergewichtete, Entnahmen kommen aus übergewichteten Anlageklassen; beim Rebalancing in der Erwerbsphase wird die Sparrate des Folgejahres eingerechnet. So wird weniger verkauft und versteuert."
      />
    </v-col>
  </v-row>
</template>
