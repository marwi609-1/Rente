import { describe, expect, it } from 'vitest'

import { historicalUs, historicalUsMeta } from '@/data/historical'
import { historicalDataSchema, historicalWindow } from '@/domain/market/historical'
import { createDefaultPlan } from '@/domain/model/defaults'

describe('historische US-Daten', () => {
  it('decken lückenlos 1871 bis 2025 ab', () => {
    const years = historicalUs.rows.map((r) => r.year)
    expect(years[0]).toBe(1871)
    expect(years.at(-1)).toBe(2025)
    expect(years).toEqual(Array.from({ length: years.length }, (_, i) => 1871 + i))
    expect(historicalUsMeta.firstYear).toBe(1871)
    expect(historicalUsMeta.lastYear).toBe(2025)
  })

  it('dokumentieren ihre Quellen mit Prüfsumme', () => {
    expect(historicalUsMeta.sources).toHaveLength(3)
    for (const source of historicalUsMeta.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(historicalUsMeta.cashSplice.fromYear).toBe(2012)
  })

  it('lehnt Lücken in den Jahren ab', () => {
    const rows = historicalUs.rows.filter((r) => r.year !== 1900)
    expect(historicalDataSchema.safeParse({ rows }).success).toBe(false)
  })

  it('schneidet das Datenfenster gemäß fromYear/toYear zu', () => {
    const market = createDefaultPlan(2026).market
    expect(historicalWindow(market, historicalUs)).toHaveLength(historicalUs.rows.length)
    market.bootstrap = { meanBlockLength: 5, fromYear: 1926, toYear: 1945 }
    const rows = historicalWindow(market, historicalUs)
    expect(rows.map((r) => r.year)).toEqual(Array.from({ length: 20 }, (_, i) => 1926 + i))
    market.bootstrap = { meanBlockLength: 5, toYear: 2030 }
    expect(() => historicalWindow(market, historicalUs)).toThrow(/1871–2025/)
  })
})
