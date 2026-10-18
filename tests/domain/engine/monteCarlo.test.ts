import { describe, expect, it } from 'vitest'

import { historicalUs } from '@/data/historical'
import { runDeterministic } from '@/domain/engine/deterministic'
import {
  PATH_SERIES,
  mergeBlocks,
  monteCarloPathCount,
  simulateBlock,
  type PathBlock,
} from '@/domain/engine/monteCarlo'
import { PERCENTILES, percentileOfSorted, summarize } from '@/domain/engine/summary'
import { yearResultToReal } from '@/domain/engine/realNominal'
import type { RetirementPlan } from '@/domain/model/types'
import { enginePlan } from '../../helpers/plans'

const ctx = { historical: historicalUs }

function stochasticPlan(
  type: RetirementPlan['market']['type'],
  adjust: (plan: RetirementPlan) => void = () => {},
) {
  return enginePlan((p) => {
    p.market.type = type
    p.simulation.paths = 1_000
    p.spending.netConsumption = 80_000
    adjust(p)
  })
}

/** Anzahl abweichender Bytes zweier Puffer (schneller als ein tiefer Vergleich großer Arrays). */
function differingBytes(a: Float64Array, b: Float64Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  let count = 0
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) count++
  return count
}

/** Vergleicht alle Puffer zweier Blöcke Byte für Byte. */
function expectBitIdentical(a: PathBlock, b: PathBlock) {
  for (const name of PATH_SERIES) expect(differingBytes(a.series[name], b.series[name])).toBe(0)
  for (const key of [
    'depletionAge',
    'failureYears',
    'cumulativeShortfallReal',
    'cagrNominal',
    'cagrReal',
  ] as const) {
    expect(differingBytes(a[key], b[key])).toBe(0)
  }
}

describe('Monte-Carlo-Pfade', () => {
  it.each(['lognormal', 'student-t', 'block-bootstrap', 'historical-sequence'] as const)(
    '%s: Blöcke ergeben bitgleich dasselbe wie ein Gesamtlauf',
    (type) => {
      const plan = stochasticPlan(type)
      const n = monteCarloPathCount(plan, ctx)
      const whole = simulateBlock(plan, 0, n, ctx)
      const parts = [
        simulateBlock(plan, 0, 1, ctx),
        simulateBlock(plan, 1, 37, ctx),
        simulateBlock(plan, 37, n, ctx),
      ]
      expectBitIdentical(mergeBlocks([parts[2], parts[0], parts[1]]), whole)
    },
  )

  it('hängt vom Seed ab', () => {
    const a = simulateBlock(stochasticPlan('lognormal'), 0, 50)
    const b = simulateBlock(
      stochasticPlan('lognormal', (p) => (p.simulation.seed = 43)),
      0,
      50,
    )
    expect(a.series.total).not.toEqual(b.series.total)
  })

  it('nutzt für Plan-Varianten mit gleichem Seed dieselben Renditepfade (CRN)', () => {
    const rates = [70_000, 80_000, 90_000, 100_000]
    const blocks = rates.map((c) =>
      simulateBlock(
        stochasticPlan('lognormal', (p) => (p.spending.netConsumption = c)),
        0,
        1_000,
      ),
    )
    // Pfadweise: Wer bei niedrigerem Konsum scheitert, scheitert auch bei höherem.
    for (let k = 1; k < blocks.length; k++) {
      const violations = Array.from(blocks[k - 1].failureYears).filter(
        (f, p) => f > 0 && blocks[k].failureYears[p] === 0,
      )
      expect(violations).toHaveLength(0)
    }
    expect(blocks.map((b) => b.failureYears.filter((f) => f > 0).length)).toEqual(
      [...blocks.map((b) => b.failureYears.filter((f) => f > 0).length)].sort((a, b) => a - b),
    )
    // Im Erwerbsjahr 0 ist der Konsum irrelevant: identische Vermögen über alle Varianten.
    for (const b of blocks) {
      for (let p = 0; p < 1_000; p++) {
        expect(b.series.total[p * b.years]).toBe(blocks[0].series.total[p * b.years])
      }
    }
  })

  it('bestimmt die Pfadanzahl je Modell', () => {
    expect(monteCarloPathCount(stochasticPlan('lognormal'), ctx)).toBe(1_000)
    expect(monteCarloPathCount(stochasticPlan('deterministic'), ctx)).toBe(1)
    const window = stochasticPlan('historical-sequence', (p) => {
      p.market.bootstrap = { meanBlockLength: 5, fromYear: 1926, toYear: 2025 }
    })
    expect(monteCarloPathCount(window, ctx)).toBe(100)
  })

  it('reproduziert im deterministischen Modell den Referenzpfad', () => {
    const plan = stochasticPlan('deterministic')
    const block = simulateBlock(plan, 0, 1)
    const reference = runDeterministic(plan).map(yearResultToReal)
    expect(Array.from(block.series.totalReal)).toEqual(reference.map((r) => r.total))
    expect(Array.from(block.series.consumptionReal)).toEqual(reference.map((r) => r.netConsumption))
  })

  it('lehnt Pfadbereiche außerhalb des Laufs ab', () => {
    expect(() => simulateBlock(stochasticPlan('lognormal'), 900, 1_001)).toThrow(RangeError)
  })

  it('lehnt nicht aneinandergrenzende Blöcke ab', () => {
    const plan = stochasticPlan('lognormal')
    expect(() => mergeBlocks([simulateBlock(plan, 0, 10), simulateBlock(plan, 11, 20)])).toThrow(
      RangeError,
    )
  })
})

describe('Auswertung', () => {
  it('berechnet Perzentile nach Typ 7', () => {
    const sorted = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(percentileOfSorted(sorted, 0)).toBe(1)
    expect(percentileOfSorted(sorted, 1)).toBe(10)
    expect(percentileOfSorted(sorted, 0.5)).toBe(5.5)
    expect(percentileOfSorted(sorted, 0.9)).toBeCloseTo(9.1, 12)
    expect(percentileOfSorted(Float64Array.of(4), 0.3)).toBe(4)
  })

  it('liefert je Jahr monotone Perzentile für alle Reihen', () => {
    for (const type of ['lognormal', 'student-t', 'block-bootstrap'] as const) {
      const plan = stochasticPlan(type)
      const summary = summarize(plan, simulateBlock(plan, 0, 1_000, ctx))
      expect(summary.percentiles).toEqual(PERCENTILES)
      for (const name of PATH_SERIES) {
        const band = summary.bands[name]
        for (let t = 0; t < summary.years; t++) {
          for (let k = 1; k < PERCENTILES.length; k++) {
            expect(band[k][t]).toBeGreaterThanOrEqual(band[k - 1][t])
          }
        }
      }
    }
  })

  it('berechnet Erfolgsquote, Standardfehler und Fehlbeträge konsistent mit den Pfaden', () => {
    const plan = stochasticPlan('lognormal', (p) => (p.spending.netConsumption = 95_000))
    const block = simulateBlock(plan, 0, 1_000)
    const s = summarize(plan, block)
    const failed = Array.from(block.failureYears).filter((f) => f > 0).length
    expect(s.successRate).toBe((1_000 - failed) / 1_000)
    expect(s.successStdError).toBeCloseTo(
      Math.sqrt((s.successRate * (1 - s.successRate)) / 1_000),
      15,
    )
    expect(s.shortfall.failedPaths).toBe(failed)
    expect(failed).toBeGreaterThan(0)
    expect(s.shortfall.medianCumulativeReal!).toBeGreaterThan(0)
    expect(s.shortfall.p90CumulativeReal!).toBeGreaterThanOrEqual(s.shortfall.medianCumulativeReal!)
    expect(s.shortfall.meanFailureYears!).toBeGreaterThanOrEqual(1)
  })

  it('berechnet Vermögen mit 90/95, Erschöpfungsalter, Expected Shortfall und CAGR', () => {
    const plan = stochasticPlan('lognormal', (p) => (p.spending.netConsumption = 95_000))
    const block = simulateBlock(plan, 0, 1_000)
    const s = summarize(plan, block)
    const years = block.years

    expect(s.wealthAt.map((w) => w.age)).toEqual([90, 95])
    const t95 = 95 - plan.household.currentAge
    const terminal = Float64Array.from(
      { length: 1_000 },
      (_, p) => block.series.totalReal[p * years + t95],
    ).sort()
    expect(s.wealthAt[1].median).toBe(percentileOfSorted(terminal, 0.5))
    expect(s.wealthAt[1].p10).toBe(percentileOfSorted(terminal, 0.1))

    // Expected Shortfall: Mittel der 100 kleinsten Endvermögen
    const worst = terminal.slice(0, 100)
    expect(s.expectedShortfallReal).toBeCloseTo(worst.reduce((a, b) => a + b, 0) / 100, 6)

    // 10 % der Pfade sind bis zum gemeldeten Alter erschöpft
    const depleted = Array.from(block.depletionAge).filter((a) => !Number.isNaN(a))
    const histogramTotal = s.depletionHistogram.reduce((a, b) => a + b.count, 0)
    expect(histogramTotal + s.neverDepleted).toBe(1_000)
    expect(histogramTotal).toBe(depleted.length)
    expect(s.earliestDepletionAge).not.toBeNull()
    const age = s.earliestDepletionAge!
    expect(depleted.filter((a) => a <= age).length).toBeGreaterThanOrEqual(100)
    expect(depleted.filter((a) => a < age).length).toBeLessThan(100)

    expect(s.cagr.nominal!).toBeGreaterThan(s.cagr.real!)
  })

  it('meldet „nicht erreicht“ und keine Fehlbeträge, wenn kein Pfad scheitert', () => {
    const plan = stochasticPlan('lognormal', (p) => {
      p.spending.netConsumption = 10_000
      p.spending.minimumAcceptableConsumption = 10_000
    })
    const s = summarize(plan, simulateBlock(plan, 0, 1_000))
    expect(s.successRate).toBe(1)
    expect(s.successStdError).toBe(0)
    expect(s.earliestDepletionAge).toBeNull()
    expect(s.shortfall).toEqual({
      failedPaths: 0,
      medianCumulativeReal: null,
      p90CumulativeReal: null,
      meanFailureYears: null,
    })
  })

  it('lässt „Vermögen mit …“ außerhalb des Horizonts weg', () => {
    const plan = stochasticPlan('lognormal', (p) => (p.household.planningHorizonAge = 92))
    const s = summarize(plan, simulateBlock(plan, 0, 1_000))
    expect(s.wealthAt.map((w) => w.age)).toEqual([90])
  })
})
