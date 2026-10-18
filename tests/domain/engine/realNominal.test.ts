import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import {
  inOutputUnit,
  toNominal,
  toReal,
  yearResultToNominal,
  yearResultToReal,
} from '@/domain/engine/realNominal'
import type { YearResult } from '@/domain/engine/types'
import { enginePlan } from '../../helpers/plans'

const AMOUNT_FIELDS = [
  'equity',
  'bonds',
  'cash',
  'total',
  'contributions',
  'grossSales',
  'rebalanceSales',
  'netConsumption',
  'oneOffSpending',
  'shortfall',
] as const satisfies readonly (keyof YearResult)[]

describe('Umrechnung real/nominal', () => {
  it('ist für Einzelbeträge umkehrbar', () => {
    for (const index of [1, 1.02, 1.7345, 3.2]) {
      for (const value of [0, 1, 123_456.78, 9_876_543.21]) {
        expect(toReal(toNominal(value, index), index)).toBeCloseTo(value, 8)
        expect(toNominal(toReal(value, index), index)).toBeCloseTo(value, 8)
      }
    }
  })

  it('ist für Jahreszeilen in beide Richtungen umkehrbar', () => {
    const rows = runDeterministic(
      enginePlan((p) => {
        p.spending.oneOffs = [{ age: 70, amount: 25_000, label: 'Auto' }]
      }),
      ctx,
    )
    for (const row of rows) {
      const roundTrip = yearResultToNominal(yearResultToReal(row))
      const reverse = yearResultToReal(yearResultToNominal(row))
      for (const key of AMOUNT_FIELDS) {
        expect(roundTrip[key]).toBeCloseTo(row[key], 6)
        expect(reverse[key]).toBeCloseTo(row[key], 6)
      }
      expect(roundTrip).toMatchObject({
        age: row.age,
        inflationIndex: row.inflationIndex,
        inflationIndexEnd: row.inflationIndexEnd,
        equityShare: row.equityShare,
      })
    }
  })

  it('weist Konsum zu Jahresbeginn in heutiger Kaufkraft aus', () => {
    const plan = enginePlan()
    const real = inOutputUnit(runDeterministic(plan, ctx), true)
    const first = real.find((r) => r.age === plan.household.retirementAge)!
    expect(first.netConsumption).toBeCloseTo(plan.spending.netConsumption, 8)
  })

  it('deflationiert Bestände mit dem Index zum Jahresende', () => {
    const rows = runDeterministic(enginePlan(), ctx)
    const row = rows[10]
    const real = yearResultToReal(row)
    expect(row.netConsumption).toBeGreaterThan(0)
    expect(real.total).toBeCloseTo(row.total / row.inflationIndexEnd, 8)
    expect(real.netConsumption).toBeCloseTo(row.netConsumption / row.inflationIndex, 8)
  })

  it('lässt nominale Ausgabe unverändert', () => {
    const rows = runDeterministic(enginePlan(), ctx)
    expect(inOutputUnit(rows, false)).toEqual(rows)
  })
})
