import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { perfectWithdrawalRates } from '@/domain/engine/pwr'
import { simulationYears } from '@/domain/engine/timeline'
import { createReturnGenerator, createReturnPath } from '@/domain/market/generators'
import type { RetirementPlan } from '@/domain/model/types'
import { profileFactor } from '@/domain/withdrawal/profile'
import { enginePlan } from '../../helpers/plans'

/**
 * Prüfanker nach Early Retirement Now, „The Ultimate Guide to Safe Withdrawal Rates – Part 8:
 * Technical Appendix“ (2017): Ist die Portfoliorendite unabhängig von der Entnahme (ohne Steuern
 * und KV, fixe Allokation mit jährlichem Rebalancing), hat die PWR eine geschlossene Form
 *
 *   w = (C₀ + Σ p_t·C_t − FV) / Σ s_t·C_t,   C_t = Π_{τ=t}^{T−1} (1 + R_τ) / (1 + π_τ),
 *
 * mit realem Startdepot, realen Zuflüssen p_t (Sparrate, steuerfreie Einkünfte, abzüglich
 * Einmalausgaben) und Ausgabenprofil s_t (0 vor dem Ruhestand). Zu- und Abflüsse fallen wie in der
 * Engine zu Jahresbeginn an. Die Engine löst dieselbe Gleichung iterativ über die volle
 * Jahressimulation; beide müssen auf jedem historischen Pfad übereinstimmen.
 */
function anchorPlan(): RetirementPlan {
  return enginePlan((p) => {
    p.household.currentAge = 55
    p.household.retirementAge = 60
    p.household.planningHorizonAge = 94
    p.household.longevity = { type: 'fixed' }
    p.portfolio.totalValue = 800_000
    p.savings = { yearlyNet: 20_000, realGrowth: 0.01 }
    p.strategy = { type: 'fixed', equity: 0.5, cash: 0.1 }
    p.spending.netConsumption = 40_000
    p.spending.minimumAcceptableConsumption = 0
    p.spending.targetWealth = 150_000
    p.spending.ageProfile = [
      { age: 60, factor: 1.1 },
      { age: 80, factor: 0.85 },
    ]
    p.spending.oneOffs = [{ age: 72, amount: 30_000, label: 'Auto' }]
    p.additionalIncome = [
      {
        label: 'steuerfreie Rente',
        product: 'other-tax-free',
        payout: 'lifelong',
        startAge: 67,
        years: 10,
        amount: 500,
        growth: 0.01,
        basis: 'nominal',
        contributions: 0,
        contractYear: 2026,
        fundLinked: false,
      },
      {
        label: 'Erbschaft',
        product: 'other-tax-free',
        payout: 'lump-sum',
        startAge: 70,
        years: 1,
        amount: 50_000,
        growth: 0,
        basis: 'nominal',
        contributions: 0,
        contractYear: 2026,
        fundLinked: false,
      },
    ]
    p.market.type = 'historical-sequence'
    p.market.bootstrap = { meanBlockLength: 5, fromYear: 1963, toYear: 2025 }
  })
}

/** PWR nach der geschlossenen Form für Pfad p. */
function closedFormPwr(plan: RetirementPlan, p: number): number {
  if (plan.strategy.type !== 'fixed') throw new Error('nur fixe Allokation')
  const { household, savings, spending, market } = plan
  const years = simulationYears(household)
  const generator = createReturnGenerator({
    market,
    simulation: plan.simulation,
    years,
    historical: ctx.historical,
  })
  const returns = createReturnPath(years)
  generator.fill(p, returns)

  const equity = plan.strategy.equity
  const cash = plan.strategy.cash
  const bonds = 1 - equity - cash
  // Realer Wachstumsfaktor je Jahr nach TER
  const growth = Array.from({ length: years }, (_, t) => {
    const nominal =
      equity * (1 + returns.equity[t]) * (1 - market.equity.ter) +
      bonds * (1 + returns.bonds[t]) * (1 - market.bonds.ter) +
      cash * (1 + returns.cash[t])
    return nominal / (1 + returns.inflation[t])
  })
  // C_t: realer Wert am Horizontende eines Euros, der zu Beginn des Jahres t im Depot ist
  const c = new Array<number>(years + 1).fill(1)
  for (let t = years - 1; t >= 0; t--) c[t] = growth[t] * c[t + 1]
  // Preisindex zu Jahresbeginn
  const index = new Array<number>(years).fill(1)
  for (let t = 1; t < years; t++) index[t] = index[t - 1] * (1 + returns.inflation[t - 1])

  let numerator = plan.portfolio.totalValue * c[0] - spending.targetWealth
  let denominator = 0
  for (let t = 0; t < years; t++) {
    const age = household.currentAge + t
    const retired = age >= household.retirementAge
    let inflow = retired ? 0 : savings.yearlyNet * Math.pow(1 + savings.realGrowth, t)
    for (const oneOff of spending.oneOffs) if (oneOff.age === age) inflow -= oneOff.amount
    for (const income of plan.additionalIncome) {
      if (income.payout === 'lump-sum') {
        if (age === income.startAge) inflow += income.amount / index[t]
      } else if (age >= income.startAge) {
        const nominal = 12 * income.amount * Math.pow(1 + income.growth, age - income.startAge)
        inflow += nominal / index[t]
      }
    }
    numerator += inflow * c[t]
    if (retired) denominator += profileFactor(spending.ageProfile, age) * c[t]
  }
  return numerator / denominator
}

describe('Prüfanker: geschlossene Form der PWR nach ERN', () => {
  const plan = anchorPlan()
  const years = simulationYears(plan.household)
  // Startjahre, deren 40-jährige Folge vollständig in den Daten liegt (1963–1986)
  const paths = 2025 - years + 1 - 1963 + 1

  it('deckt nur Startjahre ohne zyklische Fortsetzung ab', () => {
    expect(years).toBe(40)
    expect(paths).toBe(24)
  })

  it('stimmt auf jedem historischen Pfad mit der iterativen PWR überein', () => {
    const engine = perfectWithdrawalRates(plan, 0, paths, ctx)
    for (let p = 0; p < paths; p++) {
      const expected = closedFormPwr(plan, p)
      expect(expected).toBeGreaterThan(0)
      // Toleranz des Lösers 0,50 € auf die Gleichung, auf c umgerechnet deutlich darunter
      expect(Math.abs(engine[p] - expected)).toBeLessThan(1)
    }
  })

  it('reagiert wie die Formel auf das Zielvermögen', () => {
    const without = { ...plan, spending: { ...plan.spending, targetWealth: 0 } }
    const [withTarget] = perfectWithdrawalRates(plan, 0, 1, ctx)
    const [withoutTarget] = perfectWithdrawalRates(without, 0, 1, ctx)
    expect(
      Math.abs(withoutTarget - withTarget - (closedFormPwr(without, 0) - closedFormPwr(plan, 0))),
    ).toBeLessThan(1)
  })
})
