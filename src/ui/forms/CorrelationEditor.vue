<script setup lang="ts">
import { CORRELATION_ORDER } from '@/domain/model/schema'
import NumberField from './NumberField.vue'
import { useFieldRegistration, usePlanIssues } from './issues'

const matrix = defineModel<number[][]>({ required: true })

const names: Record<(typeof CORRELATION_ORDER)[number], string> = {
  equity: 'Aktien',
  bonds: 'Anleihen',
  cash: 'Cash',
  inflation: 'Inflation',
}

/** Paare unterhalb der Diagonale; die Matrix wird symmetrisch gehalten. */
const pairs: { i: number; j: number; label: string }[] = []
for (let i = 1; i < CORRELATION_ORDER.length; i++) {
  for (let j = 0; j < i; j++) {
    pairs.push({ i, j, label: `${names[CORRELATION_ORDER[j]]} / ${names[CORRELATION_ORDER[i]]}` })
  }
}

const { messagesFor } = usePlanIssues()
// Werte oberhalb der Diagonale und die Matrix als Ganzes zeigt dieser Editor selbst an.
useFieldRegistration(() => 'market.correlation')
for (const { i, j } of pairs) useFieldRegistration(() => `market.correlation.${j}.${i}`)
for (let k = 0; k < CORRELATION_ORDER.length; k++) {
  useFieldRegistration(() => `market.correlation.${k}.${k}`)
}

function set(i: number, j: number, value: number | undefined): void {
  const next = matrix.value.map((row) => [...row])
  next[i][j] = value ?? Number.NaN
  next[j][i] = value ?? Number.NaN
  matrix.value = next
}
</script>

<template>
  <section>
    <h3 class="text-subtitle-1 mb-2">Korrelationen</h3>
    <v-row dense>
      <v-col v-for="pair in pairs" :key="`${pair.i}-${pair.j}`" cols="12" sm="6" md="4">
        <NumberField
          :model-value="matrix[pair.i][pair.j]"
          :label="pair.label"
          unit="correlation"
          :path="`market.correlation.${pair.i}.${pair.j}`"
          :help="`Korrelation der jährlichen Schocks von ${pair.label} (auf Log-Renditen). Die Matrix muss positiv definit sein.`"
          @update:model-value="set(pair.i, pair.j, $event)"
        />
      </v-col>
    </v-row>
    <v-alert
      v-for="message in messagesFor('market.correlation')"
      :key="message"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-2"
    >
      {{ message }}
    </v-alert>
  </section>
</template>
