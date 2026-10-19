<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { historicalEurMeta } from '@/data/historical'
import { geometricMean } from '@/domain/market/returns'
import type { MarketModelType } from '@/domain/model/types'
import { usePlanStore } from '@/stores/plan'
import { marketModelLabels } from '@/ui/labels'
import { historicalDataNotice } from '@/ui/texts'
import { formatPercent } from '@/utils/format'
import CorrelationEditor from '../CorrelationEditor.vue'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'

const { plan } = storeToRefs(usePlanStore())
const market = computed(() => plan.value.market)

const modelType = computed({
  get: () => market.value.type,
  set: (type: MarketModelType) => {
    market.value.type = type
    // fehlende Modellparameter mit den Werten des Default-Szenarios ergänzen
    if (type === 'student-t' && market.value.studentDf === undefined) market.value.studentDf = 5
    if (
      (type === 'block-bootstrap' || type === 'historical-sequence') &&
      market.value.bootstrap === undefined
    ) {
      market.value.bootstrap = { meanBlockLength: 5 }
    }
  },
})

const modelItems = (Object.keys(marketModelLabels) as MarketModelType[]).map((value) => ({
  title: marketModelLabels[value],
  value,
}))

const historical = computed(
  () => market.value.type === 'historical-sequence' || market.value.type === 'block-bootstrap',
)
const parametric = computed(
  () => market.value.type === 'lognormal' || market.value.type === 'student-t',
)

/** Geometrische Rendite ≈ μ − σ²/2 als Hinweis neben dem arithmetischen Mittel. */
function geometricHint(mean: number, vol: number): string | undefined {
  if (!Number.isFinite(mean) || !Number.isFinite(vol) || mean <= -1 || vol < 0) return undefined
  return `geometrisch ${formatPercent(geometricMean(mean, vol), 2)}`
}

const series = computed(() => [
  {
    key: 'equity' as const,
    title: 'Aktien-ETF',
    params: market.value.equity,
    ter: true,
  },
  { key: 'bonds' as const, title: 'Anleihe-ETF', params: market.value.bonds, ter: true },
  { key: 'cash' as const, title: 'Cash (Tagesgeld)', params: market.value.cash, ter: false },
  { key: 'inflation' as const, title: 'Inflation', params: market.value.inflation, ter: false },
])

const ensureBootstrap = () => (market.value.bootstrap ??= { meanBlockLength: 5 })
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="modelType"
        label="Renditemodell"
        path="market.type"
        :items="modelItems"
        help="Deterministisch: jedes Jahr die geometrische Rendite. Lognormal/Student-t: korrelierte Zufallsrenditen. Historische Sequenzen und Block-Bootstrap: Jahresrenditen aus Sicht eines Anlegers in DM bzw. Euro (Aktien: DWS Akkumula bis 2000, MSCI World ab 2001; 10-jährige Bundesanleihe; Dreimonatsgeld; deutscher VPI)."
      />
    </v-col>
    <v-col v-if="market.type === 'student-t'" cols="12" sm="6" md="4">
      <NumberField
        v-model="market.studentDf"
        label="Freiheitsgrade ν"
        unit="number"
        path="market.studentDf"
        help="Kleinere Werte erzeugen dickere Ränder (häufigere Extremjahre) bei gleicher Varianz; ν muss größer als 2 sein."
      />
    </v-col>
  </v-row>

  <v-alert
    v-if="historical"
    type="info"
    variant="tonal"
    density="compact"
    class="mb-4"
    data-testid="historical-notice"
  >
    {{ historicalDataNotice(historicalEurMeta.firstYear, historicalEurMeta.lastYear) }} Mittelwerte
    und Volatilitäten unten wirken hier nur auf den Basiszins (Variante „Anleiherendite“) und die
    erwartete Inflation der Bucket-Strategie; die TER gilt immer.
  </v-alert>

  <v-row v-if="historical" dense>
    <v-col v-if="market.type === 'block-bootstrap'" cols="12" sm="6" md="4">
      <NumberField
        :model-value="market.bootstrap?.meanBlockLength"
        label="Mittlere Blocklänge"
        unit="years"
        path="market.bootstrap.meanBlockLength"
        help="Stationärer Bootstrap: Jahre werden in Blöcken zufälliger Länge (geometrisch verteilt mit diesem Mittelwert) gezogen; so bleiben Zusammenhänge aufeinanderfolgender Jahre erhalten."
        @update:model-value="ensureBootstrap().meanBlockLength = $event ?? Number.NaN"
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        :model-value="market.bootstrap?.fromYear"
        label="Daten ab Jahr"
        unit="calendar-year"
        optional
        path="market.bootstrap.fromYear"
        :help="`Erstes Jahr des Datenfensters; leer = ${historicalEurMeta.firstYear}.`"
        @update:model-value="ensureBootstrap().fromYear = $event"
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        :model-value="market.bootstrap?.toYear"
        label="Daten bis Jahr"
        unit="calendar-year"
        optional
        path="market.bootstrap.toYear"
        :help="`Letztes Jahr des Datenfensters; leer = ${historicalEurMeta.lastYear}.`"
        @update:model-value="ensureBootstrap().toYear = $event"
      />
    </v-col>
  </v-row>

  <template v-for="s in series" :key="s.key">
    <h3 class="text-subtitle-1 mb-2">{{ s.title }}</h3>
    <v-row dense>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="s.params.mean"
          :label="s.key === 'inflation' ? 'Mittlere Inflation μ' : 'Mittlere Rendite μ'"
          unit="percent-year"
          :path="`market.${s.key}.mean`"
          :hint="geometricHint(s.params.mean, s.params.vol)"
          :help="
            s.key === 'inflation'
              ? 'Arithmetisches Mittel der jährlichen Inflationsrate.'
              : 'Arithmetisches Mittel der einfachen Jahresrendite, nominal und vor Kosten. Darunter die geometrische Rendite (≈ μ − σ²/2), die für das Vermögenswachstum maßgeblich ist.'
          "
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="s.params.vol"
          label="Volatilität σ"
          unit="percent-year"
          :path="`market.${s.key}.vol`"
          help="Standardabweichung der einfachen Jahresrendite bzw. Inflationsrate."
        />
      </v-col>
      <v-col v-if="s.ter && 'ter' in s.params" cols="12" sm="6" md="4">
        <NumberField
          v-model="s.params.ter"
          label="Laufende Kosten (TER)"
          unit="percent-year"
          :path="`market.${s.key}.ter`"
          help="Jährliche Kosten des ETF; die Rendite wird zu (1 + r) · (1 − TER) − 1."
        />
      </v-col>
    </v-row>
  </template>

  <CorrelationEditor v-if="parametric" v-model="market.correlation" />
</template>
