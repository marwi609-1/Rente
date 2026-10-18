import { formatEuro, formatNumber, formatPercent } from '@/utils/format'
import type { ChartTable } from './ChartCard.vue'
import type { CategoryData, FanChartData, StackedAgeData } from './data'
import type { HeatmapChartData, OverlayData } from './options'

/** Tabellen zu den Diagrammen: dieselben Werte ohne Farbcodierung. */

export function fanTable(data: FanChartData): ChartTable {
  const bands = [...data.bands].sort((a, b) => a.from - b.from)
  return {
    columns: [
      'Alter',
      ...bands.map((b) => `${b.from}. Perzentil`),
      'Median',
      ...[...bands].reverse().map((b) => `${b.to}. Perzentil`),
      ...(data.reference ? ['Referenzpfad'] : []),
    ],
    rows: data.ages.map((age, t) => [
      String(age),
      ...bands.map((b) => formatEuro(b.lower[t])),
      formatEuro(data.median[t]),
      ...[...bands].reverse().map((b) => formatEuro(b.upper[t])),
      ...(data.reference ? [formatEuro(data.reference[t])] : []),
    ]),
  }
}

export function stackedTable(
  data: StackedAgeData,
  format: (value: number) => string = formatEuro,
): ChartTable {
  return {
    columns: ['Alter', ...data.series.map((s) => s.name)],
    rows: data.ages.map((age, t) => [String(age), ...data.series.map((s) => format(s.values[t]))]),
  }
}

export function categoryTable(data: CategoryData, firstColumn: string): ChartTable {
  return {
    columns: [firstColumn, ...data.series.map((s) => s.name)],
    rows: data.labels.map((label, k) => [
      label,
      ...data.series.map((s) => formatNumber(s.values[k])),
    ]),
  }
}

export function heatmapTable(data: HeatmapChartData): ChartTable {
  return {
    columns: [`${data.rowName} / Aktienquote`, ...data.columns],
    rows: data.rows.map((label, r) => [label, ...data.values[r].map((v) => formatPercent(v, 1))]),
  }
}

export function overlayTable(data: OverlayData): ChartTable {
  return {
    columns: ['Alter', ...data.series.map((s) => s.name)],
    rows: data.ages.map((age, t) => [
      String(age),
      ...data.series.map((s) => (s.values[t] === null ? '–' : formatEuro(s.values[t]!))),
    ]),
  }
}
