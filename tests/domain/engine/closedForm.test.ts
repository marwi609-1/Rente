import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import { yearResultToReal } from '@/domain/engine/realNominal'
import { geometricMean } from '@/domain/market/returns'
import type { RetirementPlan } from '@/domain/model/types'
import { vpwFactor } from '@/domain/withdrawal/rules'
import { enginePlan } from '../../helpers/plans'

const CENT = 0.01

/** Setzt alle Volatilitäten auf 0, sodass die geometrische Rendite dem Erwartungswert entspricht. */
function zeroVol(plan: RetirementPlan): void {
  plan.market.equity.vol = 0
  plan.market.bonds.vol = 0
  plan.market.cash.vol = 0
  plan.market.inflation.vol = 0
}

/** Nominaler Portfoliofaktor nach TER bei jährlichem Rebalancing auf die fixe Zielallokation. */
function portfolioFactor(plan: RetirementPlan): number {
  if (plan.strategy.type !== 'fixed') throw new Error('nur fixe Allokation')
  const { equity, cash } = plan.strategy
  const bonds = 1 - equity - cash
  const m = plan.market
  return (
    equity * (1 + m.equity.mean) * (1 - m.equity.ter) +
    bonds * (1 + m.bonds.mean) * (1 - m.bonds.ter) +
    cash * (1 + m.cash.mean)
  )
}

/** Vorschüssiger Rentenendwert: Σ_{t=0}^{n−1} S·(1+g)^t·R^(n−t). */
function annuityDueFutureValue(saving: number, growth: number, factor: number, n: number): number {
  const g = 1 + growth
  if (Math.abs(factor - g) < 1e-15) return saving * n * Math.pow(factor, n)
  return (saving * factor * (Math.pow(factor, n) - Math.pow(g, n))) / (factor - g)
}

/** Endwert nach m vorschüssigen Entnahmen W bei Faktor R: V·R^m − W·R·(R^m − 1)/(R − 1). */
function valueAfterWithdrawals(value: number, withdrawal: number, factor: number, m: number) {
  const rm = Math.pow(factor, m)
  return value * rm - (withdrawal * factor * (rm - 1)) / (factor - 1)
}

describe('deterministische Engine gegen geschlossene Formeln (σ = 0)', () => {
  it('Sparphase entspricht dem vorschüssigen Rentenendwert ohne Inflation', () => {
    const plan = enginePlan((p) => {
      zeroVol(p)
      p.market.inflation.mean = 0
      p.household.currentAge = 30
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 90
      p.portfolio.totalValue = 50_000
      p.savings.yearlyNet = 12_000
    })
    const rows = runDeterministic(plan, ctx)
    const r = portfolioFactor(plan)
    const n = 30
    const expected = 50_000 * Math.pow(r, n) + annuityDueFutureValue(12_000, 0, r, n)
    const lastWorkYear = rows.find((row) => row.age === 59)!
    expect(Math.abs(lastWorkYear.total - expected)).toBeLessThan(CENT)
  })

  it('Sparphase mit Inflation und real wachsender Sparrate entspricht der Formel in realen Größen', () => {
    const plan = enginePlan((p) => {
      zeroVol(p)
      p.household.currentAge = 35
      p.household.retirementAge = 62
      p.household.planningHorizonAge = 90
      p.portfolio.totalValue = 80_000
      p.savings.yearlyNet = 20_000
      p.savings.realGrowth = 0.015
    })
    const rows = runDeterministic(plan, ctx)
    const inflation = 1 + plan.market.inflation.mean
    const realFactor = portfolioFactor(plan) / inflation
    const n = 27
    const real =
      80_000 * Math.pow(realFactor, n) + annuityDueFutureValue(20_000, 0.015, realFactor, n)
    const expectedNominal = real * Math.pow(inflation, n)
    const lastWorkYear = rows.find((row) => row.age === 61)!
    expect(Math.abs(lastWorkYear.total - expectedNominal)).toBeLessThan(CENT)
  })

  it('Endvermögen nach Spar- und Entnahmephase entspricht Rentenendwert und Annuitätenformel', () => {
    const plan = enginePlan((p) => {
      zeroVol(p)
      p.spending.netConsumption = 60_000
      p.spending.minimumAcceptableConsumption = 50_000
    })
    const rows = runDeterministic(plan, ctx)
    const { currentAge, retirementAge, planningHorizonAge } = plan.household
    const inflation = 1 + plan.market.inflation.mean
    const realFactor = portfolioFactor(plan) / inflation
    const n = retirementAge - currentAge
    const m = planningHorizonAge - retirementAge + 1
    const atRetirement =
      plan.portfolio.totalValue * Math.pow(realFactor, n) +
      annuityDueFutureValue(plan.savings.yearlyNet, 0, realFactor, n)
    const realEnd = valueAfterWithdrawals(atRetirement, 60_000, realFactor, m)
    expect(realEnd).toBeGreaterThan(0)

    const last = rows[rows.length - 1]
    expect(rows).toHaveLength(planningHorizonAge - currentAge + 1)
    expect(Math.abs(last.total - realEnd * Math.pow(inflation, n + m))).toBeLessThan(CENT)
    expect(rows.every((row) => row.shortfall === 0)).toBe(true)
  })

  it('reine Aktienanlage ohne Rebalancing-Bedarf folgt derselben Formel', () => {
    const plan = enginePlan((p) => {
      zeroVol(p)
      p.strategy = { type: 'fixed', equity: 1, cash: 0 }
      p.rebalancing = { band: 0.05, taxAware: true }
      p.spending.netConsumption = 70_000
      p.spending.minimumAcceptableConsumption = 50_000
    })
    const rows = runDeterministic(plan, ctx)
    const inflation = 1 + plan.market.inflation.mean
    const realFactor = ((1 + plan.market.equity.mean) * (1 - plan.market.equity.ter)) / inflation
    const atRetirement =
      plan.portfolio.totalValue * Math.pow(realFactor, 5) +
      annuityDueFutureValue(plan.savings.yearlyNet, 0, realFactor, 5)
    const realEnd = valueAfterWithdrawals(atRetirement, 70_000, realFactor, 39)
    expect(realEnd).toBeGreaterThan(0)
    const last = rows[rows.length - 1]
    expect(Math.abs(last.total - realEnd * Math.pow(inflation, 44))).toBeLessThan(CENT)
  })

  it('steueroptimierte Flusssteuerung ändert bei Rebalancing auf das Ziel nichts', () => {
    const adjust = (p: RetirementPlan) => {
      zeroVol(p)
      p.spending.netConsumption = 60_000
    }
    const plain = runDeterministic(enginePlan(adjust), ctx)
    const aware = runDeterministic(
      enginePlan((p) => {
        adjust(p)
        p.rebalancing.taxAware = true
      }),
      ctx,
    )
    expect(Math.abs(plain.at(-1)!.total - aware.at(-1)!.total)).toBeLessThan(CENT)
  })
})

describe('reale Annuitätenentnahme erschöpft das Depot exakt zum Horizont', () => {
  function annuityPlan(adjust: (p: RetirementPlan) => void): RetirementPlan {
    return enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 95
      p.portfolio.totalValue = 1_000_000
      p.spending.minimumAcceptableConsumption = 0
      adjust(p)
    })
  }

  /**
   * Tatsächliche reale Portfoliorendite des deterministischen Pfads (mit Volatilität): geometrische
   * Renditen nach TER, gewichtet mit der fixen Zielallokation, deflationiert mit der Inflation.
   */
  function realPortfolioReturn(plan: RetirementPlan): number {
    if (plan.strategy.type !== 'fixed') throw new Error('nur fixe Allokation')
    const m = plan.market
    const w = { equity: plan.strategy.equity, cash: plan.strategy.cash }
    const nominal =
      w.equity * (1 + geometricMean(m.equity.mean, m.equity.vol)) * (1 - m.equity.ter) +
      (1 - w.equity - w.cash) * (1 + geometricMean(m.bonds.mean, m.bonds.vol)) * (1 - m.bonds.ter) +
      w.cash * (1 + geometricMean(m.cash.mean, m.cash.vol))
    return nominal / (1 + geometricMean(m.inflation.mean, m.inflation.vol)) - 1
  }

  it('vpw mit r = tatsächlicher realer Rendite entnimmt real konstant und leert das Depot', () => {
    const base = annuityPlan(() => {})
    const r = realPortfolioReturn(base)
    const plan = annuityPlan((p) => {
      p.spending.rule = { type: 'vpw', expectedRealReturn: r }
    })
    const rows = runDeterministic(plan, ctx).map(yearResultToReal)
    const years = 36
    const expectedWithdrawal = 1_000_000 * vpwFactor(r, years)

    expect(rows).toHaveLength(years)
    for (const row of rows) {
      expect(Math.abs(row.netConsumption - expectedWithdrawal)).toBeLessThan(CENT)
    }
    // Vor der letzten Entnahme liegt genau noch eine Jahresentnahme im Depot.
    expect(Math.abs(rows[years - 2].total - expectedWithdrawal)).toBeLessThan(CENT)
    expect(Math.abs(rows[years - 1].total)).toBeLessThan(CENT)
  })

  it('feste reale Entnahme in Höhe der Annuität endet mit Depotwert 0', () => {
    const base = annuityPlan(() => {})
    const r = realPortfolioReturn(base)
    const withdrawal = 1_000_000 * vpwFactor(r, 36)
    const plan = annuityPlan((p) => {
      p.spending.netConsumption = withdrawal
    })
    const rows = runDeterministic(plan, ctx).map(yearResultToReal)
    for (const row of rows) expect(Math.abs(row.netConsumption - withdrawal)).toBeLessThan(CENT)
    expect(Math.abs(rows[rows.length - 1].total)).toBeLessThan(CENT)
  })

  it('vpw nach einer Sparphase entnimmt ab Ruhestand real konstant und endet bei 0', () => {
    const base = enginePlan((p) => {
      p.spending.minimumAcceptableConsumption = 0
    })
    const r = realPortfolioReturn(base)
    const plan = enginePlan((p) => {
      p.spending.minimumAcceptableConsumption = 0
      p.spending.rule = { type: 'vpw', expectedRealReturn: r }
    })
    const rows = runDeterministic(plan, ctx).map(yearResultToReal)
    const retired = rows.filter((row) => row.age >= plan.household.retirementAge)
    const first = retired[0].netConsumption
    expect(first).toBeGreaterThan(0)
    for (const row of retired) expect(Math.abs(row.netConsumption - first)).toBeLessThan(CENT)
    expect(Math.abs(rows[rows.length - 1].total)).toBeLessThan(CENT)
  })
})
