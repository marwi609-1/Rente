import { describe, expect, it } from 'vitest'

import { historicalEur } from '@/data/historical'
import { createReturnGenerator, createReturnPath } from '@/domain/market/generators'
import { historicalWindow, type HistoricalRow } from '@/domain/market/historical'
import { lognormalParams } from '@/domain/market/returns'
import type { ReturnPath } from '@/domain/market/types'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { MarketModel } from '@/domain/model/types'
import { correlation, kurtosis, mean, variance } from '../../helpers/stats'

const SERIES = ['equity', 'bonds', 'cash', 'inflation'] as const
type Series = (typeof SERIES)[number]

function market(adjust: (m: MarketModel) => void = () => {}): MarketModel {
  const m = createDefaultPlan(2026).market
  adjust(m)
  return m
}

/** Zieht `paths` Pfade zu je `years` Jahren und liefert die Werte je Reihe hintereinander. */
function draw(m: MarketModel, paths: number, years: number, seed = 42) {
  const generator = createReturnGenerator({
    market: m,
    simulation: { paths, seed, outputReal: true, successTargetRate: 0.9 },
    years,
    historical: historicalEur,
  })
  const out = createReturnPath(years)
  const n = generator.paths * years
  const values = Object.fromEntries(SERIES.map((k) => [k, new Float64Array(n)])) as Record<
    Series,
    Float64Array
  >
  for (let p = 0; p < generator.paths; p++) {
    generator.fill(p, out)
    for (const k of SERIES) values[k].set(out[k], p * years)
  }
  return { generator, values }
}

function copy(path: ReturnPath): Record<Series, number[]> {
  return Object.fromEntries(SERIES.map((k) => [k, Array.from(path[k])])) as Record<Series, number[]>
}

describe('lognormal', () => {
  const m = market()
  const { values } = draw(m, 100_000, 1)

  it('trifft die arithmetischen Mittel innerhalb von 3 Standardfehlern', () => {
    for (const k of SERIES) {
      const { mean: mu, vol } = m[k]
      expect(Math.abs(mean(values[k]) - mu)).toBeLessThan((3 * vol) / Math.sqrt(100_000))
    }
  })

  it('trifft die Volatilitäten', () => {
    for (const k of SERIES) expect(Math.sqrt(variance(values[k])) / m[k].vol).toBeCloseTo(1, 1)
  })

  it('trifft die Zielkorrelationen auf ± 0,02 (einfache und logarithmische Renditen)', () => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < i; j++) {
        const a = values[SERIES[i]]
        const b = values[SERIES[j]]
        const target = m.correlation[i][j]
        expect(Math.abs(correlation(a, b) - target)).toBeLessThan(0.02)
        expect(Math.abs(correlation(a.map(Math.log1p), b.map(Math.log1p)) - target)).toBeLessThan(
          0.02,
        )
      }
    }
  })

  it('ist bei gleichem Seed bitgleich und hängt nur vom Pfadindex ab', () => {
    const generator = createReturnGenerator({
      market: m,
      simulation: { paths: 1_000, seed: 7, outputReal: true, successTargetRate: 0.9 },
      years: 30,
    })
    const a = createReturnPath(30)
    const b = createReturnPath(30)
    generator.fill(500, a)
    generator.fill(3, b)
    generator.fill(500, b)
    expect(copy(b)).toEqual(copy(a))
    generator.fill(501, b)
    expect(copy(b)).not.toEqual(copy(a))
  })
})

describe('Student-t', () => {
  it('hat bei gleicher Varianz der Log-Renditen eine höhere Kurtosis als lognormal', () => {
    const lognormal = market()
    const studentT = market((m) => {
      m.type = 'student-t'
      m.studentDf = 5
    })
    const a = draw(lognormal, 100_000, 1).values.equity
    const b = draw(studentT, 100_000, 1).values.equity
    const { sigmaLn } = lognormalParams(lognormal.equity.mean, lognormal.equity.vol)
    const logA = a.map(Math.log1p)
    const logB = b.map(Math.log1p)
    // Beide Modelle skalieren den Schock auf Varianz 1.
    expect(Math.sqrt(variance(logA)) / sigmaLn).toBeCloseTo(1, 1)
    expect(Math.sqrt(variance(logB)) / sigmaLn).toBeCloseTo(1, 1)
    expect(kurtosis(logA)).toBeLessThan(3.1)
    expect(kurtosis(logB)).toBeGreaterThan(4)
    expect(kurtosis(b)).toBeGreaterThan(kurtosis(a))
  })

  it('hält die Korrelation über die gemeinsame Chi-Quadrat-Mischung', () => {
    const m = market((mm) => {
      mm.type = 'student-t'
      mm.studentDf = 8
      mm.correlation = [
        [1, 0.6, 0, 0],
        [0.6, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ]
    })
    const { values } = draw(m, 100_000, 1)
    const c = correlation(values.equity.map(Math.log1p), values.bonds.map(Math.log1p))
    expect(Math.abs(c - 0.6)).toBeLessThan(0.02)
  })
})

describe('deterministisch', () => {
  it('erzeugt genau einen Pfad mit der geometrischen Rendite', () => {
    const { generator, values } = draw(
      market((m) => (m.type = 'deterministic')),
      10_000,
      3,
    )
    expect(generator.paths).toBe(1)
    expect(values.equity[0]).toBe(values.equity[2])
  })
})

describe('historische Sequenzen', () => {
  it('nutzt jedes Startjahr des Fensters genau einmal und setzt zyklisch fort', () => {
    const m = market((mm) => {
      mm.type = 'historical-sequence'
      mm.bootstrap = { meanBlockLength: 5, fromYear: 2000, toYear: 2009 }
    })
    const rows = historicalWindow(m, historicalEur)
    const { generator, values } = draw(m, 1_000, 15)
    expect(generator.paths).toBe(10)
    // Pfad 7 beginnt 2007; Jahr 3 ist 2010 → zyklisch 2000
    expect(values.equity[7 * 15]).toBe(rows[7].equity)
    expect(values.equity[7 * 15 + 3]).toBe(rows[0].equity)
    expect(values.inflation[7 * 15 + 3]).toBe(rows[0].inflation)
  })

  it('lehnt ein Fenster außerhalb der Daten ab', () => {
    const m = market((mm) => {
      mm.type = 'historical-sequence'
      mm.bootstrap = { meanBlockLength: 5, fromYear: 1850 }
    })
    expect(() => draw(m, 1_000, 10)).toThrow(RangeError)
  })
})

describe('Block-Bootstrap', () => {
  const m = market((mm) => {
    mm.type = 'block-bootstrap'
    mm.bootstrap = { meanBlockLength: 5 }
  })
  const rows = historicalEur.rows
  const { values } = draw(m, 4_000, 30)
  const key = (r: Pick<HistoricalRow, Series>) => `${r.equity}|${r.bonds}|${r.cash}|${r.inflation}`

  it('zieht nur vollständige historische Jahreszeilen', () => {
    const known = new Map(rows.map((r, i) => [key(r), i]))
    for (let i = 0; i < values.equity.length; i++) {
      const drawn = {
        equity: values.equity[i],
        bonds: values.bonds[i],
        cash: values.cash[i],
        inflation: values.inflation[i],
      }
      expect(known.has(key(drawn))).toBe(true)
    }
  })

  it('erhält die historischen Korrelationen zwischen den Reihen', () => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < i; j++) {
        const historical = correlation(
          rows.map((r) => r[SERIES[i]]),
          rows.map((r) => r[SERIES[j]]),
        )
        const drawn = correlation(values[SERIES[i]], values[SERIES[j]])
        expect(Math.abs(drawn - historical)).toBeLessThan(0.03)
      }
    }
  })

  it('hat im Mittel die vorgegebene Blocklänge', () => {
    const index = new Map(rows.map((r, i) => [key(r), i]))
    let continued = 0
    let transitions = 0
    for (let p = 0; p < 4_000; p++) {
      for (let t = 1; t < 30; t++) {
        const at = (k: number) => ({
          equity: values.equity[k],
          bonds: values.bonds[k],
          cash: values.cash[k],
          inflation: values.inflation[k],
        })
        const prev = index.get(key(at(p * 30 + t - 1)))!
        const cur = index.get(key(at(p * 30 + t)))!
        transitions++
        if (cur === (prev + 1) % rows.length) continued++
      }
    }
    // Fortsetzungswahrscheinlichkeit 1 − 1/L = 0,8 (zufällige Neustarts treffen selten das Folgejahr)
    expect(continued / transitions).toBeCloseTo(0.8 + 0.2 / rows.length, 2)
  })
})
