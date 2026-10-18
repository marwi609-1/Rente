import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import { simulatePath } from '@/domain/engine/path'
import { phaseForAge, simulationYears } from '@/domain/engine/timeline'
import type { ReturnPath } from '@/domain/market/types'
import type { RetirementPlan } from '@/domain/model/types'
import { PlanValidationError } from '@/domain/model/validation'
import { enginePlan } from '../../helpers/plans'

/** Konstante Renditen für alle Jahre. */
function constantReturns(
  years: number,
  r: { equity: number; bonds: number; cash: number; inflation: number },
): ReturnPath {
  return {
    equity: new Float64Array(years).fill(r.equity),
    bonds: new Float64Array(years).fill(r.bonds),
    cash: new Float64Array(years).fill(r.cash),
    inflation: new Float64Array(years).fill(r.inflation),
  }
}

const ZERO = { equity: 0, bonds: 0, cash: 0, inflation: 0 }

/** Plan ohne Renditen, Kosten und Inflation; 100 % Aktien. */
function flatPlan(adjust: (p: RetirementPlan) => void): RetirementPlan {
  return enginePlan((p) => {
    p.strategy = { type: 'fixed', equity: 1, cash: 0 }
    p.market.equity.ter = 0
    p.market.bonds.ter = 0
    adjust(p)
  })
}

describe('Zeitachse', () => {
  it('simuliert vom aktuellen Alter bis einschließlich Horizont', () => {
    const plan = enginePlan()
    const rows = runDeterministic(plan, ctx)
    expect(rows).toHaveLength(simulationYears(plan.household))
    expect(rows[0]).toMatchObject({ age: 52, year: 2026, inflationIndex: 1 })
    expect(rows.at(-1)).toMatchObject({ age: 95, year: 2069 })
  })

  it('bestimmt die Phasen Erwerb, Überbrückung und Rente', () => {
    const plan = enginePlan()
    expect(phaseForAge(plan.household, plan.statePension, 56)).toBe('work')
    expect(phaseForAge(plan.household, plan.statePension, 57)).toBe('bridge')
    expect(phaseForAge(plan.household, plan.statePension, 67)).toBe('pension')
    const rows = runDeterministic(plan, ctx)
    expect(rows.find((r) => r.age === 66)?.phase).toBe('bridge')
  })

  it('verkettet den Preisindex von Jahr zu Jahr', () => {
    const rows = runDeterministic(enginePlan(), ctx)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].inflationIndex).toBe(rows[i - 1].inflationIndexEnd)
    }
  })
})

describe('Jahresschritt', () => {
  it('investiert die Sparrate inflationiert und mit realem Wachstum', () => {
    const plan = flatPlan((p) => {
      p.savings.realGrowth = 0.1
    })
    const rows = simulatePath(plan, constantReturns(44, { ...ZERO, inflation: 0.02 }), ctx)
    expect(rows[0].contributions).toBeCloseTo(30_000, 9)
    expect(rows[2].contributions).toBeCloseTo(30_000 * 1.1 ** 2 * 1.02 ** 2, 8)
    expect(rows[5].contributions).toBe(0)
  })

  it('deckt Einmalausgaben in der Erwerbsphase zuerst aus der Sparrate', () => {
    const plan = flatPlan((p) => {
      p.spending.oneOffs = [
        { age: 53, amount: 10_000, label: 'Auto' },
        { age: 54, amount: 50_000, label: 'Umbau' },
      ]
    })
    const rows = simulatePath(plan, constantReturns(44, ZERO), ctx)
    expect(rows[1]).toMatchObject({ contributions: 20_000, grossSales: 0, oneOffSpending: 10_000 })
    expect(rows[2]).toMatchObject({ contributions: 0, grossSales: 20_000, oneOffSpending: 50_000 })
    expect(rows[2].total).toBeCloseTo(1_300_000 + 30_000 + 20_000 - 20_000, 6)
  })

  it('finanziert laufenden Konsum vor Einmalausgaben und erfasst Fehljahre', () => {
    const plan = flatPlan((p) => {
      p.household.currentAge = 70
      p.household.retirementAge = 70
      p.household.planningHorizonAge = 75
      p.portfolio.totalValue = 145_000
      p.spending.netConsumption = 60_000
      p.spending.minimumAcceptableConsumption = 40_000
      p.spending.oneOffs = [
        { age: 71, amount: 20_000, label: 'Reise' },
        { age: 72, amount: 5_000, label: 'Geschenk' },
      ]
    })
    const rows = simulatePath(plan, constantReturns(6, ZERO), ctx)
    // 145.000 − 60.000 = 85.000; Jahr 2: 60.000 Konsum + 20.000 Reise; Jahr 3: 5.000 reichen nur
    // für einen Teil des Konsums, die Einmalausgabe entfällt.
    expect(rows.map((r) => r.netConsumption)).toEqual([60_000, 60_000, 5_000, 0, 0, 0])
    expect(rows.map((r) => r.oneOffSpending)).toEqual([0, 20_000, 0, 0, 0, 0])
    expect(rows.map((r) => r.shortfall)).toEqual([0, 0, 35_000, 40_000, 40_000, 40_000])
    // Das leere Depot läuft mit Kapital 0 weiter.
    expect(rows.slice(2).every((r) => r.total === 0)).toBe(true)
  })

  it('wendet Ausgabenprofil und Inflation auf den Konsum an', () => {
    const plan = flatPlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 80
      p.spending.netConsumption = 50_000
      p.spending.minimumAcceptableConsumption = 0
      p.spending.ageProfile = [
        { age: 60, factor: 1 },
        { age: 70, factor: 0.8 },
      ]
    })
    const rows = simulatePath(plan, constantReturns(21, { ...ZERO, inflation: 0.03 }), ctx)
    expect(rows[5].netConsumption).toBeCloseTo(50_000 * 0.9 * 1.03 ** 5, 6)
    expect(rows[15].netConsumption).toBeCloseTo(50_000 * 0.8 * 1.03 ** 15, 6)
  })

  it('zieht die TER von Aktien und Anleihen ab, nicht von Cash', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.portfolio.totalValue = 1_000
      p.spending.netConsumption = 0
      p.spending.minimumAcceptableConsumption = 0
      p.strategy = { type: 'fixed', equity: 0.5, cash: 0.25 }
      p.market.equity.ter = 0.01
      p.market.bonds.ter = 0.02
      p.rebalancing.band = 1
    })
    const rows = simulatePath(plan, constantReturns(36, ZERO), ctx)
    expect(rows[0].equity).toBeCloseTo(500 * 0.99, 10)
    expect(rows[0].bonds).toBeCloseTo(250 * 0.98, 10)
    expect(rows[0].cash).toBe(250)
  })

  it('weist die Portfoliorendite auf das nach den Zahlungen investierte Kapital aus', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 62
      p.portfolio.totalValue = 1_000
      p.spending.netConsumption = 600
      p.spending.minimumAcceptableConsumption = 0
      p.strategy = { type: 'fixed', equity: 0.5, cash: 0.25 }
      p.market.equity.ter = 0
      p.market.bonds.ter = 0
    })
    const rows = simulatePath(
      plan,
      constantReturns(3, { equity: 0.1, bonds: 0.04, cash: 0.02, inflation: 0 }),
      ctx,
    )
    // 0,5 · 10 % + 0,25 · 4 % + 0,25 · 2 %
    expect(rows[0].portfolioReturn).toBeCloseTo(0.065, 12)
    // Im zweiten Jahr reicht das restliche Depot (426 €) nicht mehr und wird vollständig entnommen.
    expect(rows[1].total).toBe(0)
    expect(rows[1].portfolioReturn).toBeNull()
    expect(rows[2].portfolioReturn).toBeNull()
  })

  it('rebalanciert nur bei Erreichen des Bands', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.portfolio.totalValue = 1_000
      p.spending.netConsumption = 0
      p.spending.minimumAcceptableConsumption = 0
      p.strategy = { type: 'fixed', equity: 0.5, cash: 0 }
      p.market.equity.ter = 0
      p.market.bonds.ter = 0
      p.rebalancing.band = 0.05
    })
    // Jahr 1: Aktien +10 % → Anteil 52,4 % (innerhalb), Jahr 2: weitere +10 % → 54,8 % (innerhalb),
    // Jahr 3: weitere +10 % → 57,1 % (außerhalb) → Rebalancing.
    const rows = simulatePath(plan, constantReturns(36, { ...ZERO, equity: 0.1 }), ctx)
    expect(rows[0].rebalanceSales).toBe(0)
    expect(rows[1].rebalanceSales).toBe(0)
    expect(rows[2].rebalanceSales).toBeGreaterThan(0)
    expect(rows[2].equityShare).toBeCloseTo(0.5, 12)
  })

  it('lehnt einen zu kurzen Renditepfad ab', () => {
    expect(() => simulatePath(enginePlan(), constantReturns(10, ZERO), ctx)).toThrow(RangeError)
  })
})

describe('runDeterministic', () => {
  it('validiert den Plan', () => {
    const plan = enginePlan((p) => {
      p.household.planningHorizonAge = 50
    })
    expect(() => runDeterministic(plan, ctx)).toThrow(PlanValidationError)
  })

  it('ist deterministisch', () => {
    expect(runDeterministic(enginePlan(), ctx)).toEqual(runDeterministic(enginePlan(), ctx))
  })
})
