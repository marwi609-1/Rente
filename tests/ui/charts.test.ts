import { describe, expect, it } from 'vitest'

import { glidepathEquity } from '@/domain/strategy/allocation'
import {
  ageDistributionData,
  allocationData,
  histogramData,
  incomeData,
  lifeMarkers,
  wealthFanData,
} from '@/ui/charts/data'
import { categoryBarOption, fanChartOption, stackedBarOption } from '@/ui/charts/options'
import { fanTable } from '@/ui/charts/tables'
import { chartTheme } from '@/ui/charts/theme'
import { formatEuro } from '@/utils/format'
import { smallRun } from '../helpers/summary'

const run = smallRun()
const theme = chartTheme(false, '#ffffff')
const wide = { compact: false }

type Formatter = (params: unknown) => string

describe('Diagrammdaten', () => {
  it('wählt für die Vermögensentwicklung reale oder nominale Perzentile', () => {
    const { summary, reference, plan } = run
    const real = wealthFanData(summary, reference, plan, true)
    const nominal = wealthFanData(summary, reference, plan, false)
    const p = (q: number) => summary.percentiles.indexOf(q)
    expect(real.median).toBe(summary.bands.totalReal[p(50)])
    expect(nominal.bands[0].upper).toBe(summary.bands.total[p(90)])
    expect(real.bands.map((b) => [b.from, b.to])).toEqual([
      [10, 90],
      [25, 75],
    ])
    // Referenzpfad: Bestand zum Jahresende mit dem Index zum Jahresende deflationiert
    const last = reference.at(-1)!
    expect(real.reference!.at(-1)).toBeCloseTo(last.total / last.inflationIndexEnd, 6)
    expect(nominal.reference!.at(-1)).toBe(last.total)
  })

  it('markiert Ruhestand und Rentenbeginn, gleiche Alter zusammengefasst', () => {
    const { plan, summary } = run
    expect(lifeMarkers(plan, summary.ages)).toEqual([
      { age: 57, label: 'Ruhestand' },
      { age: 67, label: 'Rentenbeginn' },
    ])
    const same = { ...plan, household: { ...plan.household, retirementAge: 67 } }
    expect(lifeMarkers(same, summary.ages)).toEqual([{ age: 67, label: 'Ruhestand und Rente' }])
  })

  it('rechnet Einkommen und Ausgaben des Median-Pfades nominal mit dessen Preisindex um', () => {
    const { summary } = run
    const real = incomeData(summary, true)
    const nominal = incomeData(summary, false)
    const t = 20
    const index = summary.medianPath.priceIndex[t]
    expect(index).toBeGreaterThan(1)
    for (let k = 0; k < real.series.length; k++) {
      expect(nominal.series[k].values[t]).toBeCloseTo(real.series[k].values[t] * index, 6)
    }
    // Netto-Rente plus depotfinanzierter Konsum ergeben mindestens den Konsum
    const consumption = summary.medianPath.consumptionReal[t]
    expect(real.series[0].values[t] + real.series[1].values[t]).toBeGreaterThanOrEqual(
      consumption - 1e-6,
    )
    expect(real.series[1].values.every((v) => v >= 0)).toBe(true)
  })

  it('weist weitere Einkünfte als eigene Reihe aus und mindert damit den Depotkonsum', () => {
    expect(incomeData(run.summary, true).series.map((x) => x.name)).not.toContain(
      'Weitere Einkünfte netto',
    )
    const { summary } = smallRun((p) => {
      p.additionalIncome = [
        {
          label: 'Betriebsrente',
          product: 'other-taxable',
          payout: 'lifelong',
          startAge: 67,
          years: 10,
          amount: 500,
          growth: 0,
          basis: 'nominal',
          contributions: 0,
          contractYear: 2010,
          fundLinked: false,
        },
      ]
    })
    const data = incomeData(summary, true)
    expect(data.series.map((x) => x.name)).toEqual([
      'Netto-Rente',
      'Weitere Einkünfte netto',
      'Depotfinanzierter Konsum',
      'Kapitalertragsteuer',
      'Einkommensteuer',
      'KV/PV',
    ])
    const t = 20
    const m = summary.medianPath
    expect(data.series[1].values[t]).toBeCloseTo(6_000 / m.priceIndex[t], 6)
    expect(data.series[2].values[t]).toBeCloseTo(
      Math.max(0, m.consumptionReal[t] - m.pensionNetReal[t] - m.otherIncomeNetReal[t]),
      9,
    )
  })

  it('zeigt die Zielallokation der Strategie, beim Bucket normierte Median-Anteile', () => {
    const { plan, summary } = run
    const target = allocationData(plan, summary)
    expect(target.source).toBe('target')
    if (plan.strategy.type !== 'fixed') throw new Error('enginePlan nutzt eine feste Allokation')
    expect(target.series[0].values[0]).toBeCloseTo(100 * plan.strategy.equity, 9)

    const glide = smallRun((p) => {
      p.strategy = {
        type: 'glidepath',
        points: [
          { age: 55, equity: 0.4 },
          { age: 75, equity: 0.8 },
        ],
        cash: 0.1,
      }
    })
    const g = allocationData(glide.plan, glide.summary)
    if (glide.plan.strategy.type !== 'glidepath') throw new Error('Glidepath erwartet')
    expect(g.series[0].values[13]).toBeCloseTo(100 * glidepathEquity(glide.plan.strategy, 65), 9)

    const bucket = smallRun((p) => {
      p.strategy = {
        type: 'bucket',
        cashYears: 2,
        bondYears: 5,
        refillRule: 'annual',
        equityUpThreshold: 0,
      }
    })
    const b = allocationData(bucket.plan, bucket.summary)
    expect(b.source).toBe('median')
    const sum = b.series[0].values[10] + b.series[1].values[10] + b.series[2].values[10]
    expect(sum).toBeCloseTo(100, 9)
  })

  it('verteilt Erschöpfungs- und Sterbealter auf die Alter bis zum Horizont', () => {
    const { plan, summary } = run
    const data = ageDistributionData(summary, plan)
    expect(data.series.map((s) => s.name)).toEqual(['Depot erschöpft', 'Sterbealter'])
    const depleted = data.series[0].values.reduce((a, b) => a + b, 0)
    expect(depleted).toBe(summary.paths - summary.neverDepleted)
    const died = data.series[1].values.reduce((a, b) => a + b, 0)
    expect(died + summary.survivingHorizon).toBe(summary.paths)
    const fixed = {
      ...plan,
      household: { ...plan.household, longevity: { type: 'fixed' as const } },
    }
    expect(ageDistributionData(summary, fixed).series).toHaveLength(1)
  })

  it('beschriftet Histogrammklassen und fasst den Überlauf zusammen', () => {
    const data = histogramData({ start: 0, step: 250_000, counts: [5, 3], overflow: 2 }, 'Pfade')
    expect(data.labels).toEqual(['0–250 Tsd.', '250 Tsd.–500 Tsd.', 'ab 500 Tsd.'])
    expect(data.series[0].values).toEqual([5, 3, 2])
  })
})

describe('Diagrammoptionen', () => {
  it('baut den Fan Chart aus gestapelten Bändern, Median und Referenzpfad', () => {
    const { summary, reference, plan } = run
    const data = wealthFanData(summary, reference, plan, true)
    const option = fanChartOption(data, theme, wide)
    const series = option.series as {
      name: string
      data: number[]
      markLine?: { data: unknown[] }
    }[]
    // je Band Basis und Breite, dazu Median und Referenzpfad
    expect(series).toHaveLength(2 * 2 + 2)
    expect(series[1].data[5]).toBeCloseTo(data.bands[0].upper[5] - data.bands[0].lower[5], 6)
    const tooltip = (option.tooltip as { formatter: Formatter }).formatter([{ dataIndex: 5 }])
    expect(tooltip).toContain(`Alter ${data.ages[5]}`)
    expect(tooltip).toContain(formatEuro(data.median[5]))
    expect(tooltip).toContain('90. Perzentil')
    // Markierungen für Ruhestand und Rentenbeginn am Median
    const median = series.find((s) => s.name === 'Median')
    expect(median?.markLine?.data).toHaveLength(2)
  })

  it('beschriftet auf schmalen Bildschirmen nur jedes zehnte Alter', () => {
    const { summary } = run
    const data = incomeData(summary, true)
    const option = stackedBarOption(data, theme, { compact: true })
    const interval = (option.xAxis as { axisLabel: { interval: (i: number) => boolean } }).axisLabel
      .interval
    const labelled = data.ages.filter((_, i) => interval(i))
    expect(labelled.every((age) => age % 10 === 0)).toBe(true)
    expect(labelled.length).toBeGreaterThan(0)
  })

  it('zeigt die Legende nur bei mehreren Reihen', () => {
    const single = categoryBarOption(
      { labels: ['a', 'b'], series: [{ name: 'Pfade', values: [1, 2] }] },
      theme,
      wide,
      'Klasse',
    )
    expect(single.legend).toEqual({ show: false })
    const tooltip = (single.tooltip as { formatter: Formatter }).formatter([{ dataIndex: 1 }])
    expect(tooltip).toContain('66,7')
  })

  it('maskiert Beschriftungen im Tooltip', () => {
    const option = categoryBarOption(
      { labels: ['<b>x</b>'], series: [{ name: 'A & B', values: [1] }] },
      theme,
      wide,
      'Klasse',
    )
    const tooltip = (option.tooltip as { formatter: Formatter }).formatter([{ dataIndex: 0 }])
    expect(tooltip).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(tooltip).toContain('A &amp; B')
  })

  it('liefert dieselben Werte als Tabelle', () => {
    const { summary, reference, plan } = run
    const data = wealthFanData(summary, reference, plan, true)
    const table = fanTable(data)
    expect(table.columns).toEqual([
      'Alter',
      '10. Perzentil',
      '25. Perzentil',
      'Median',
      '75. Perzentil',
      '90. Perzentil',
      'Referenzpfad',
    ])
    expect(table.rows).toHaveLength(data.ages.length)
    expect(table.rows[3][3]).toBe(formatEuro(data.median[3]))
  })
})
