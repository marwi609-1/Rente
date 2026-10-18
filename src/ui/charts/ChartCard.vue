<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import { mdiChartBox, mdiTable } from '@mdi/js'

import './echarts'
import type { ChartLayout } from './options'
import { chartTheme, type ChartTheme } from './theme'

export interface ChartTable {
  columns: string[]
  rows: string[][]
}

const props = defineProps<{
  title: string
  subtitle?: string
  /** Optionen abhängig von Farbschema und Bildschirmbreite */
  option: (theme: ChartTheme, layout: ChartLayout) => EChartsOption
  /** dieselben Werte als Tabelle (barrierefreie Alternative zum Diagramm) */
  table: () => ChartTable
  height?: number
  testId?: string
}>()

const theme = useTheme()
const { width } = useDisplay()
const showTable = ref(false)

const layout = computed<ChartLayout>(() => ({ compact: width.value < 600 }))
const resolved = computed(() =>
  props.option(
    chartTheme(theme.current.value.dark, theme.current.value.colors.surface),
    layout.value,
  ),
)
const tableData = computed(() => (showTable.value ? props.table() : null))
const chartHeight = computed(() => `${(props.height ?? 340) - (layout.value.compact ? 40 : 0)}px`)
</script>

<template>
  <v-card variant="outlined" class="chart-card" :data-testid="testId">
    <v-card-item>
      <v-card-title class="text-subtitle-1 text-wrap">{{ title }}</v-card-title>
      <v-card-subtitle v-if="subtitle" class="text-wrap">{{ subtitle }}</v-card-subtitle>
      <template #append>
        <v-btn
          :icon="showTable ? mdiChartBox : mdiTable"
          variant="text"
          size="small"
          :aria-label="showTable ? 'Diagramm anzeigen' : 'Werte als Tabelle anzeigen'"
          :aria-pressed="showTable"
          @click="showTable = !showTable"
        />
      </template>
    </v-card-item>
    <v-card-text class="pt-0">
      <v-table v-if="tableData" density="compact" :height="chartHeight" fixed-header>
        <thead>
          <tr>
            <th v-for="column in tableData.columns" :key="column" scope="col">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in tableData.rows" :key="i">
            <td v-for="(cell, j) in row" :key="j" class="table-cell">{{ cell }}</td>
          </tr>
        </tbody>
      </v-table>
      <v-chart
        v-else
        :option="resolved"
        :style="{ height: chartHeight }"
        autoresize
        :aria-label="title"
        role="img"
      />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.chart-card {
  min-width: 0;
}

.table-cell {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
