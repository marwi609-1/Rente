import type { EChartsOption, SeriesOption } from 'echarts'

import { formatCompact, formatEuro, formatNumber, formatPercent } from '@/utils/format'
import type { CategoryData, FanChartData, StackedAgeData } from './data'
import type { ChartTheme } from './theme'

/** Darstellungsoptionen: `compact` für schmale Bildschirme (unter 600 px). */
export interface ChartLayout {
  compact: boolean
}

const FONT = 'Roboto, system-ui, sans-serif'

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Tooltip-Zeile: Wert betont, Reihe mit kurzem Farbstrich davor. */
function tooltipRow(color: string | null, name: string, value: string): string {
  const key = color
    ? `<span style="display:inline-block;width:12px;height:2px;margin:0 6px 3px 0;background:${color}"></span>`
    : ''
  return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${key}${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`
}

/** eingerückte Unterzeile, z. B. „davon Umschichtung“ */
function tooltipDetailRow(name: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:16px;padding-left:18px;opacity:0.8"><span>${escapeHtml(name)}</span><span>${escapeHtml(value)}</span></div>`
}

function tooltipHeader(text: string): string {
  return `<div style="margin-bottom:4px">${escapeHtml(text)}</div>`
}

function baseOption(theme: ChartTheme, layout: ChartLayout): EChartsOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: theme.inkSecondary },
    aria: { enabled: true },
    animationDuration: 300,
    grid: {
      left: layout.compact ? 4 : 12,
      right: layout.compact ? 8 : 24,
      // Platz für die Legende oben
      top: 40,
      bottom: layout.compact ? 8 : 32,
      containLabel: true,
    },
    legend: {
      top: 0,
      left: 0,
      type: 'scroll',
      textStyle: { color: theme.inkSecondary, fontSize: layout.compact ? 11 : 12 },
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: {
      confine: true,
      backgroundColor: theme.dark ? '#2c2c2a' : '#ffffff',
      borderColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,11,11,0.10)',
      textStyle: { color: theme.ink, fontFamily: FONT, fontSize: 12 },
    },
  }
}

function ageAxis(ages: readonly number[], theme: ChartTheme, layout: ChartLayout) {
  return {
    type: 'category' as const,
    data: ages.map(String),
    name: layout.compact ? undefined : 'Alter',
    nameLocation: 'middle' as const,
    nameGap: 28,
    nameTextStyle: { color: theme.muted },
    axisLine: { lineStyle: { color: theme.axis } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.muted,
      // schmale Bildschirme: nur jedes zehnte Jahr beschriften
      interval: layout.compact ? (index: number) => ages[index] % 10 === 0 : ('auto' as const),
    },
  }
}

function valueAxis(theme: ChartTheme, formatter: (value: number) => string, max?: number) {
  return {
    type: 'value' as const,
    max,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, formatter },
    splitLine: { lineStyle: { color: theme.grid, width: 1, type: 'solid' as const } },
  }
}

const euroAxisLabel = (layout: ChartLayout) => (value: number) =>
  layout.compact ? formatCompact(value) : `${formatCompact(value)} €`

/**
 * Vermögensentwicklung als Fan Chart: Bänder als gestapelte Flächen (Untergrenze unsichtbar,
 * darauf die Bandbreite), Median und Referenzpfad als Linien, Ruhestand und Rentenbeginn als
 * senkrechte Markierungen.
 */
export function fanChartOption(
  data: FanChartData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const color = theme.series[0]
  const opacities = data.bands.length > 2 ? [0.08, 0.14, 0.22] : [0.12, 0.24]
  const series: SeriesOption[] = []
  data.bands.forEach((band, k) => {
    const stack = `band-${k}`
    series.push(
      {
        type: 'line',
        name: `${band.name} (Basis)`,
        stack,
        data: band.lower,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        silent: true,
        tooltip: { show: false },
      },
      {
        type: 'line',
        name: band.name,
        stack,
        data: band.upper.map((u, t) => u - band.lower[t]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: opacities[k] ?? 0.2 },
        itemStyle: { color, opacity: opacities[k] ?? 0.2 },
        silent: true,
      },
    )
  })
  series.push({
    type: 'line',
    name: 'Median',
    data: data.median,
    symbol: 'none',
    lineStyle: { width: 2, color, cap: 'round', join: 'round' },
    itemStyle: { color },
    markLine: {
      symbol: 'none',
      silent: true,
      lineStyle: { color: theme.muted, width: 1, type: 'solid' },
      label: {
        color: theme.inkSecondary,
        position: 'end',
        fontSize: layout.compact ? 10 : 11,
      },
      data: data.markers.map((m) => ({ xAxis: String(m.age), label: { formatter: m.label } })),
    },
  })
  if (data.reference) {
    series.push({
      type: 'line',
      name: 'Referenzpfad (deterministisch)',
      data: data.reference,
      symbol: 'none',
      lineStyle: { width: 2, color: theme.series[1], cap: 'round', join: 'round' },
      itemStyle: { color: theme.series[1] },
    })
  }

  const base = baseOption(theme, layout)
  return {
    ...base,
    // zusätzlich Platz für die Beschriftung der Markierungen über dem Plot
    grid: { ...(base.grid as object), top: 64 },
    legend: {
      ...(base.legend as object),
      data: [
        'Median',
        ...data.bands.map((b) => b.name).reverse(),
        ...(data.reference ? ['Referenzpfad (deterministisch)'] : []),
      ],
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.muted, width: 1 } },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        // von oben nach unten: obere Perzentile, Median, untere Perzentile
        const rows = [
          tooltipHeader(`Alter ${data.ages[t]}`),
          ...data.bands.map((b) => tooltipRow(null, `${b.to}. Perzentil`, formatEuro(b.upper[t]))),
          tooltipRow(color, 'Median', formatEuro(data.median[t])),
          ...[...data.bands]
            .reverse()
            .map((b) => tooltipRow(null, `${b.from}. Perzentil`, formatEuro(b.lower[t]))),
        ]
        if (data.reference) {
          rows.push(tooltipRow(theme.series[1], 'Referenzpfad', formatEuro(data.reference[t])))
        }
        return rows.join('')
      },
    },
    xAxis: { ...ageAxis(data.ages, theme, layout), boundaryGap: false },
    yAxis: valueAxis(theme, euroAxisLabel(layout)),
    series,
  }
}

/** Gestapelte Säulen je Alter (Einkommen und Ausgaben des Median-Pfades). */
export function stackedBarOption(
  data: StackedAgeData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const base = baseOption(theme, layout)
  return {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        const total = data.series.reduce((sum, s) => sum + s.values[t], 0)
        return [
          tooltipHeader(`Alter ${data.ages[t]}`),
          ...data.series
            .map((s, k) => ({ s, k }))
            .reverse()
            .flatMap(({ s, k }) => [
              tooltipRow(theme.series[k], s.name, formatEuro(s.values[t])),
              ...(s.details ?? [])
                .filter((d) => Math.abs(d.values[t]) >= 0.5)
                .map((d) => tooltipDetailRow(`davon ${d.label(t)}`, formatEuro(d.values[t]))),
            ]),
          tooltipRow(null, 'Summe', formatEuro(total)),
        ].join('')
      },
    },
    xAxis: ageAxis(data.ages, theme, layout),
    yAxis: valueAxis(theme, euroAxisLabel(layout)),
    series: data.series.map((s, k) => ({
      type: 'bar',
      name: s.name,
      stack: 'total',
      data: s.values,
      barMaxWidth: 24,
      // 1 px in Oberflächenfarbe je Segmentkante ergibt die Lücke zwischen Segmenten
      itemStyle: { color: theme.series[k], borderColor: theme.surface, borderWidth: 1 },
      emphasis: { focus: 'none' },
    })),
  }
}

/** Gestapelte Flächen in Prozent je Alter (Asset Allocation). */
export function stackedAreaOption(
  data: StackedAgeData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const base = baseOption(theme, layout)
  return {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.muted, width: 1 } },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        return [
          tooltipHeader(`Alter ${data.ages[t]}`),
          ...data.series
            .map((s, k) => ({ s, k }))
            .reverse()
            .map(({ s, k }) =>
              tooltipRow(theme.series[k], s.name, formatPercent(s.values[t] / 100, 1)),
            ),
        ].join('')
      },
    },
    xAxis: { ...ageAxis(data.ages, theme, layout), boundaryGap: false },
    yAxis: valueAxis(theme, (v) => `${formatNumber(v)} %`, 100),
    series: data.series.map((s, k) => ({
      type: 'line',
      name: s.name,
      stack: 'share',
      data: s.values,
      symbol: 'none',
      // Kanten in Oberflächenfarbe trennen die Flächen
      lineStyle: { width: 2, color: theme.surface },
      areaStyle: { color: theme.series[k], opacity: 0.85 },
      itemStyle: { color: theme.series[k] },
    })),
  }
}

/** Säulen je Kategorie, mehrere Reihen nebeneinander (Histogramme). */
export function categoryBarOption(
  data: CategoryData,
  theme: ChartTheme,
  layout: ChartLayout,
  axisName: string,
  valueLabel: (value: number) => string = (v) => formatNumber(v),
): EChartsOption {
  const base = baseOption(theme, layout)
  const totals = data.series.map((s) => s.values.reduce((a, b) => a + b, 0))
  return {
    ...base,
    legend: data.series.length > 1 ? base.legend : { show: false },
    grid: {
      ...(base.grid as object),
      top: data.series.length > 1 ? 40 : 16,
    },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        return [
          tooltipHeader(`${axisName} ${data.labels[t]}`),
          ...data.series.map((s, k) =>
            tooltipRow(
              data.series.length > 1 ? theme.series[k] : null,
              s.name,
              `${valueLabel(s.values[t])} (${formatPercent(totals[k] > 0 ? s.values[t] / totals[k] : 0, 1)})`,
            ),
          ),
        ].join('')
      },
    },
    xAxis: {
      type: 'category',
      data: data.labels,
      name: layout.compact ? undefined : axisName,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, hideOverlap: true },
    },
    yAxis: valueAxis(theme, (v) => formatNumber(v)),
    series: data.series.map((s, k) => ({
      type: 'bar',
      name: s.name,
      data: s.values,
      barMaxWidth: 24,
      barGap: '10%',
      itemStyle: { color: theme.series[k], borderRadius: [4, 4, 0, 0] },
    })),
  }
}

export interface HeatmapChartData {
  /** Beschriftung der Spalten (Aktienquote) */
  columns: string[]
  /** Beschriftung der Zeilen (Entnahme), von oben nach unten steigend */
  rows: string[]
  rowName: string
  /** Erfolgsquote `values[zeile][spalte]` in [0, 1] */
  values: number[][]
}

/** Heatmap der Erfolgsquote: einfarbige Abstufung, Wert in jeder Zelle. */
export function heatmapOption(
  data: HeatmapChartData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const base = baseOption(theme, layout)
  const cells = data.values.flatMap((row, r) =>
    row.map((value, c) => ({
      value: [c, r, value],
      label: { color: value > 0.55 ? theme.onSequentialHigh : theme.onSequentialLow },
    })),
  )
  return {
    ...base,
    legend: { show: false },
    grid: { ...(base.grid as object), top: 8, bottom: layout.compact ? 56 : 64 },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'item',
      formatter: (params: unknown) => {
        const [c, r, value] = (params as { value: [number, number, number] }).value
        return [
          tooltipHeader(`${data.rowName} ${data.rows[r]}, Aktien ${data.columns[c]}`),
          tooltipRow(null, 'Erfolgsquote', formatPercent(value, 1)),
        ].join('')
      },
    },
    xAxis: {
      type: 'category',
      data: data.columns,
      name: layout.compact ? undefined : 'Aktienquote',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, interval: layout.compact ? 1 : 0 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: data.rows,
      inverse: true,
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: layout.compact ? 140 : 200,
      text: ['100 %', '0 %'],
      textStyle: { color: theme.inkSecondary },
      inRange: { color: [...theme.sequential] },
    },
    series: [
      {
        type: 'heatmap',
        name: 'Erfolgsquote',
        data: cells,
        // 2 px Oberflächenfarbe trennen die Zellen
        itemStyle: { borderColor: theme.surface, borderWidth: 2 },
        label: {
          show: true,
          fontSize: layout.compact ? 9 : 11,
          formatter: (params: unknown) => {
            const value = (params as { value: [number, number, number] }).value[2]
            return layout.compact ? formatNumber(value * 100) : formatPercent(value, 0)
          },
        },
        emphasis: { itemStyle: { borderColor: theme.ink, borderWidth: 1 } },
      },
    ],
  }
}

export interface OverlayData {
  ages: number[]
  series: { name: string; values: (number | null)[] }[]
}

/** Überlagerte Linien je Szenario (Median-Pfade), Beträge in Euro. */
export function overlayLineOption(
  data: OverlayData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const base = baseOption(theme, layout)
  return {
    ...base,
    grid: { ...(base.grid as object), right: layout.compact ? 8 : 24 },
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.muted, width: 1 } },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        return [
          tooltipHeader(`Alter ${data.ages[t]}`),
          ...data.series.map((s, k) =>
            tooltipRow(
              theme.series[k],
              s.name,
              s.values[t] === null ? '–' : formatEuro(s.values[t]!),
            ),
          ),
        ].join('')
      },
    },
    xAxis: { ...ageAxis(data.ages, theme, layout), boundaryGap: false },
    yAxis: valueAxis(theme, euroAxisLabel(layout)),
    series: data.series.map((s, k) => ({
      type: 'line',
      name: s.name,
      data: s.values,
      symbol: 'none',
      connectNulls: false,
      lineStyle: { width: 2, color: theme.series[k], cap: 'round', join: 'round' },
      itemStyle: { color: theme.series[k] },
    })),
  }
}

export interface StartYearData {
  /** Startjahre */
  labels: string[]
  /** PWR je Startjahr, Euro von heute */
  values: number[]
  /** Netto-Konsum laut Plan */
  reference: number
  /** Bezugsgröße der Entnahmerate */
  portfolioValue: number
  /** Index des ersten Startjahres mit zyklisch fortgesetzter Folge; `null`, wenn keines */
  cyclicFrom: number | null
}

/**
 * Säulen je Startjahr; Jahre unter dem geplanten Netto-Konsum in der zweiten Farbe, der Plan als
 * gestrichelte Linie.
 */
export function startYearBarOption(
  data: StartYearData,
  theme: ChartTheme,
  layout: ChartLayout,
): EChartsOption {
  const base = baseOption(theme, layout)
  const below = (v: number) => v < data.reference
  const rate = (v: number) =>
    data.portfolioValue > 0 ? ` (${formatPercent(v / data.portfolioValue, 1)})` : ''
  return {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const t = (params as { dataIndex: number }[])[0]?.dataIndex ?? 0
        const v = data.values[t]
        return [
          tooltipHeader(`Startjahr ${data.labels[t]}`),
          tooltipRow(theme.series[below(v) ? 1 : 0], 'PWR', `${formatEuro(v)}${rate(v)}`),
          tooltipRow(null, 'Netto-Konsum laut Plan', formatEuro(data.reference)),
        ].join('')
      },
    },
    xAxis: {
      type: 'category',
      data: data.labels,
      name: layout.compact ? undefined : 'Startjahr',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: theme.muted },
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, hideOverlap: true },
    },
    yAxis: valueAxis(theme, euroAxisLabel(layout)),
    series: [
      {
        type: 'bar',
        name: 'PWR ab Netto-Konsum',
        stack: 'pwr',
        data: data.values.map((v) => (below(v) ? null : v)),
        barMaxWidth: 24,
        itemStyle: { color: theme.series[0], borderRadius: [4, 4, 0, 0] },
        markLine: {
          symbol: 'none',
          silent: true,
          label: {
            formatter: layout.compact ? '' : 'Plan',
            color: theme.inkSecondary,
            position: 'insideEndTop',
          },
          lineStyle: { color: theme.ink, type: 'dashed', width: 1 },
          data: [{ yAxis: data.reference }],
        },
        markArea:
          data.cyclicFrom === null
            ? undefined
            : {
                silent: true,
                itemStyle: { color: theme.grid, opacity: 0.6 },
                label: {
                  show: !layout.compact,
                  formatter: 'zyklisch fortgesetzt',
                  color: theme.muted,
                  position: 'insideTop',
                },
                data: [
                  [
                    { xAxis: data.labels[data.cyclicFrom] },
                    { xAxis: data.labels[data.labels.length - 1] },
                  ],
                ],
              },
      },
      {
        type: 'bar',
        name: 'PWR unter Netto-Konsum',
        stack: 'pwr',
        data: data.values.map((v) => (below(v) ? v : null)),
        barMaxWidth: 24,
        itemStyle: { color: theme.series[1], borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
}
