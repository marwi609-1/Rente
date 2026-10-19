import { describe, expect, it } from 'vitest'

import { historicalEur, historicalEurMeta } from '@/data/historical'
import { historicalDataSchema, historicalWindow } from '@/domain/market/historical'
import { createDefaultPlan } from '@/domain/model/defaults'
import { historicalUs, historicalUsMeta } from '../helpers/historicalUs'

describe('historische EUR-Daten', () => {
  it('decken lückenlos 1963 bis 2025 ab', () => {
    const years = historicalEur.rows.map((r) => r.year)
    expect(years[0]).toBe(1963)
    expect(years.at(-1)).toBe(2025)
    expect(years).toEqual(Array.from({ length: years.length }, (_, i) => 1963 + i))
    expect(historicalEurMeta.firstYear).toBe(1963)
    expect(historicalEurMeta.lastYear).toBe(2025)
  })

  it('dokumentieren ihre Quellen mit Prüfsumme', () => {
    expect(historicalEurMeta.sources).toHaveLength(8)
    for (const source of historicalEurMeta.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(historicalEurMeta.equitySplice.msciFromYear).toBe(2001)
  })

  it('treffen veröffentlichte Jahresrenditen', () => {
    const row = (year: number) => historicalEur.rows.find((r) => r.year === year)!
    // DWS Akkumula 1999 laut Anteilwert; MSCI World Net EUR 2008 und 2022
    expect(row(1999).equity).toBeCloseTo(0.5505, 4)
    expect(row(2008).equity).toBeCloseTo(-0.3764, 4)
    expect(row(2022).equity).toBeCloseTo(-0.1278, 4)
    // Zinsanstieg 2022: Kursverlust der 10-jährigen Bundesanleihe, Inflation 8,1 %
    expect(row(2022).bonds).toBeLessThan(-0.15)
    expect(row(2022).inflation).toBeCloseTo(0.0812, 4)
  })

  it('lehnt Lücken in den Jahren ab', () => {
    const rows = historicalEur.rows.filter((r) => r.year !== 1990)
    expect(historicalDataSchema.safeParse({ rows }).success).toBe(false)
  })

  it('schneidet das Datenfenster gemäß fromYear/toYear zu', () => {
    const market = createDefaultPlan(2026).market
    expect(historicalWindow(market, historicalEur)).toHaveLength(historicalEur.rows.length)
    market.bootstrap = { meanBlockLength: 5, fromYear: 1970, toYear: 1989 }
    const rows = historicalWindow(market, historicalEur)
    expect(rows.map((r) => r.year)).toEqual(Array.from({ length: 20 }, (_, i) => 1970 + i))
    market.bootstrap = { meanBlockLength: 5, fromYear: 1926 }
    expect(() => historicalWindow(market, historicalEur)).toThrow(/1963–2025/)
  })
})

describe('historische US-Daten (Referenz für den Plausibilitätsanker)', () => {
  it('decken lückenlos 1871 bis 2025 ab und dokumentieren ihre Quellen', () => {
    const years = historicalUs.rows.map((r) => r.year)
    expect(years).toEqual(Array.from({ length: 2025 - 1871 + 1 }, (_, i) => 1871 + i))
    expect(historicalUsMeta.sources).toHaveLength(3)
    for (const source of historicalUsMeta.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(historicalUsMeta.cashSplice.fromYear).toBe(2012)
  })
})

describe('Sterbetafel Destatis', () => {
  it('deckt die Jahrgänge 1926–2008 im Alter 18–99 ab', async () => {
    const { mortalityDe, mortalityDeMeta } = await import('@/data/mortality')
    expect(mortalityDe.firstCohort).toBe(1926)
    expect(mortalityDe.lastCohort).toBe(2008)
    expect(mortalityDe.firstAge).toBe(18)
    expect(mortalityDe.lastAge).toBe(99)
    expect(mortalityDe.qx.m).toHaveLength(83)
    expect(mortalityDe.qx.w[0]).toHaveLength(82)
    expect(mortalityDeMeta.variant).toBe('V3 (hoch)')
    expect(mortalityDeMeta.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hat steigende Sterblichkeit im hohen Alter und eine höhere für Männer', async () => {
    const { mortalityDe } = await import('@/data/mortality')
    const cohort1974 = 1974 - mortalityDe.firstCohort
    const men = mortalityDe.qx.m[cohort1974]
    const women = mortalityDe.qx.w[cohort1974]
    for (let age = 60; age < 99; age++) {
      expect(men[age + 1 - 18]).toBeGreaterThan(men[age - 18])
    }
    expect(men[80 - 18]).toBeGreaterThan(women[80 - 18])
  })
})
