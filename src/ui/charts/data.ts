import type { HeatmapResult } from '@/domain/engine/heatmap'
import type { Histogram } from '@/domain/engine/histogram'
import type { CapitalTaxDetail, MonteCarloSummary } from '@/domain/engine/summary'
import type { YearResult } from '@/domain/engine/types'
import type { RetirementPlan } from '@/domain/model/types'
import { allocationPolicy } from '@/domain/strategy/allocation'
import { formatCompact, formatEuro, formatPercent } from '@/utils/format'
import type { HeatmapChartData, OverlayData } from './options'

/**
 * Aufbereitung der Ergebnisse für die Diagramme: Auswahl real/nominal, Zuordnung der Reihen und
 * Beschriftungen. Gerechnet wird in der Domäne; hier werden nur vorhandene Werte ausgewählt.
 */

export interface NamedSeries {
  name: string
  values: number[]
  /** Aufschlüsselung im Tooltip: Text und Betrag je Alter; Zeilen mit Betrag 0 entfallen */
  details?: { label: (t: number) => string; values: number[] }[]
}

export interface AgeMarker {
  age: number
  label: string
}

export interface FanChartData {
  ages: number[]
  /** Bänder von außen nach innen */
  bands: { name: string; from: number; to: number; lower: number[]; upper: number[] }[]
  median: number[]
  /** deterministischer Referenzpfad, falls vorhanden */
  reference: number[] | null
  markers: AgeMarker[]
}

export interface StackedAgeData {
  ages: number[]
  series: NamedSeries[]
}

export interface CategoryData {
  /** Beschriftung je Klasse */
  labels: string[]
  series: NamedSeries[]
}

function percentileRow(summary: MonteCarloSummary, name: 'total' | 'totalReal', q: number) {
  const k = summary.percentiles.indexOf(q)
  if (k < 0) throw new RangeError(`Das Perzentil ${q} wird nicht ausgewertet.`)
  return summary.bands[name][k]
}

/** Ruhestand und Rentenbeginn als Markierungen; gleiche Alter werden zusammengefasst. */
export function lifeMarkers(plan: RetirementPlan, ages: readonly number[]): AgeMarker[] {
  const retirement = plan.household.retirementAge
  // Gezahlt wird die Rente erst ohne Erwerbseinkommen.
  const pension = Math.max(plan.statePension.startAge, retirement)
  const markers: AgeMarker[] =
    retirement === pension
      ? [{ age: retirement, label: 'Ruhestand und Rente' }]
      : [
          { age: retirement, label: 'Ruhestand' },
          { age: pension, label: 'Rentenbeginn' },
        ]
  return markers.filter((m) => ages.includes(m.age))
}

/** Vermögensentwicklung: Median, Perzentilbänder und Referenzpfad. */
export function wealthFanData(
  summary: MonteCarloSummary,
  reference: readonly YearResult[] | null,
  plan: RetirementPlan,
  real: boolean,
  bandPairs: readonly (readonly [number, number])[] = [
    [10, 90],
    [25, 75],
  ],
): FanChartData {
  const name = real ? 'totalReal' : 'total'
  return {
    ages: summary.ages,
    bands: bandPairs.map(([lo, hi]) => ({
      name: `${lo}.–${hi}. Perzentil`,
      from: lo,
      to: hi,
      lower: percentileRow(summary, name, lo),
      upper: percentileRow(summary, name, hi),
    })),
    median: percentileRow(summary, name, 50),
    reference: reference
      ? reference.map((row) => (real ? row.total / row.inflationIndexEnd : row.total))
      : null,
    markers: lifeMarkers(plan, summary.ages),
  }
}

/** Herkunft der Kapitalertragsteuer mit den verkauften Beträgen. */
function capitalTaxDetails(
  detail: CapitalTaxDetail | undefined,
  unit: (values: number[]) => number[],
): NamedSeries['details'] {
  if (!detail) return undefined
  const sales = unit(detail.salesReal)
  const rebalance = unit(detail.rebalanceSalesReal)
  return [
    {
      label: (t) => `Verkauf zu Jahresbeginn (${formatCompact(sales[t])} €)`,
      values: unit(detail.onSalesReal),
    },
    { label: () => 'Vorabpauschale und Zinsen', values: unit(detail.onIncomeReal) },
    {
      label: (t) => `Umschichtung (${formatCompact(rebalance[t])} € verkauft)`,
      values: unit(detail.onRebalanceReal),
    },
  ]
}

/**
 * Einkommen und Ausgaben des Median-Pfades je Alter; weitere Einkünfte nur, wenn der Pfad welche
 * hat. Einmalzahlungen fließen ins Depot und erscheinen hier nicht.
 */
export function incomeData(summary: MonteCarloSummary, real: boolean): StackedAgeData {
  const m = summary.medianPath
  const unit = (values: number[]) => (real ? values : values.map((v, t) => v * m.priceIndex[t]))
  const depotConsumption = m.consumptionReal.map((c, t) =>
    Math.max(0, c - m.pensionNetReal[t] - m.otherIncomeNetReal[t]),
  )
  const other = m.otherIncomeNetReal.some((v) => v > 0)
    ? [{ name: 'Weitere Einkünfte netto', values: unit(m.otherIncomeNetReal) }]
    : []
  return {
    ages: summary.ages,
    series: [
      { name: 'Netto-Rente', values: unit(m.pensionNetReal) },
      ...other,
      { name: 'Depotfinanzierter Konsum', values: unit(depotConsumption) },
      {
        name: 'Kapitalertragsteuer',
        values: unit(m.capitalTaxReal),
        details: capitalTaxDetails(m.capitalTaxDetail, unit),
      },
      { name: 'Einkommensteuer', values: unit(m.incomeTaxReal) },
      { name: 'KV/PV', values: unit(m.healthInsuranceReal) },
    ],
  }
}

/**
 * Asset Allocation in Prozent: Zielallokation der Strategie je Alter; beim Bucket die Mediane der
 * Anteile über alle Pfade, auf 100 % normiert (Jahre, in denen der Median-Anteil aller Klassen 0
 * ist, bleiben leer).
 */
export function allocationData(
  plan: RetirementPlan,
  summary: MonteCarloSummary,
): StackedAgeData & { source: 'target' | 'median' } {
  const names = ['Aktien', 'Anleihen', 'Cash'] as const
  const ages = summary.ages
  if (plan.strategy.type === 'bucket') {
    const median = (series: 'equityShare' | 'bondShare' | 'cashShare') =>
      summary.bands[series][summary.percentiles.indexOf(50)]
    const raw = [median('equityShare'), median('bondShare'), median('cashShare')]
    const values = raw.map((row, k) =>
      row.map((_, t) => {
        const sum = raw[0][t] + raw[1][t] + raw[2][t]
        return sum > 0 ? (100 * raw[k][t]) / sum : 0
      }),
    )
    return {
      ages,
      source: 'median',
      series: names.map((name, k) => ({ name, values: values[k] })),
    }
  }
  const target = allocationPolicy(plan.strategy)
  const rows = ages.map((age) => target(age))
  return {
    ages,
    source: 'target',
    series: [
      { name: names[0], values: rows.map((r) => 100 * r.equity) },
      { name: names[1], values: rows.map((r) => 100 * r.bonds) },
      { name: names[2], values: rows.map((r) => 100 * r.cash) },
    ],
  }
}

/**
 * Erschöpfungs- und Sterbealter je Alter. Das Sterbealter entfällt beim festen Horizont; gezählt
 * werden nur Alter bis zum Horizont.
 */
export function ageDistributionData(
  summary: MonteCarloSummary,
  plan: RetirementPlan,
): CategoryData {
  const withDeath = plan.household.longevity.type !== 'fixed'
  const ages = summary.ages
  const count = (histogram: { age: number; count: number }[]) => {
    const byAge = new Map(histogram.map((h) => [h.age, h.count]))
    return ages.map((age) => byAge.get(age) ?? 0)
  }
  const series: NamedSeries[] = [
    { name: 'Depot erschöpft', values: count(summary.depletionHistogram) },
  ]
  if (withDeath) series.push({ name: 'Sterbealter', values: count(summary.deathAgeHistogram) })
  return { labels: ages.map(String), series }
}

/** Klassenbeschriftungen eines Histogramms in Euro, mit Überlaufklasse „ab …“. */
export function histogramData(histogram: Histogram, seriesName: string): CategoryData {
  const labels = histogram.counts.map((_, k) => {
    const from = histogram.start + k * histogram.step
    return `${formatCompact(from)}–${formatCompact(from + histogram.step)}`
  })
  const counts = [...histogram.counts]
  if (histogram.overflow > 0) {
    labels.push(`ab ${formatCompact(histogram.start + histogram.counts.length * histogram.step)}`)
    counts.push(histogram.overflow)
  }
  return { labels, series: [{ name: seriesName, values: counts }] }
}

/** Heatmap-Ergebnis mit Beschriftungen für Diagramm und Tabelle. */
export function heatmapChartData(result: HeatmapResult): HeatmapChartData {
  const rate = result.config.mode === 'rate'
  return {
    columns: result.equity.map((q) => formatPercent(q, 0)),
    rows: result.rows.map((r) => (rate ? formatPercent(r, 1) : formatEuro(r))),
    rowName: rate ? 'Entnahmerate' : 'Netto-Konsum',
    values: result.success,
  }
}

/**
 * Median-Pfade mehrerer Szenarien auf einer gemeinsamen Altersachse; Alter außerhalb eines
 * Szenarios bleiben leer.
 */
export function overlayData(
  scenarios: readonly { name: string; summary: MonteCarloSummary }[],
  real: boolean,
): OverlayData {
  const ages = [...new Set(scenarios.flatMap((s) => s.summary.ages))].sort((a, b) => a - b)
  return {
    ages,
    series: scenarios.map(({ name, summary }) => {
      const median = summary.bands[real ? 'totalReal' : 'total'][summary.percentiles.indexOf(50)]
      return {
        name,
        values: ages.map((age) => {
          const t = age - summary.ages[0]
          return t >= 0 && t < median.length ? median[t] : null
        }),
      }
    }),
  }
}
