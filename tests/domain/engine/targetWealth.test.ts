import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { simulateBlock } from '@/domain/engine/monteCarlo'
import { perfectWithdrawalRates, pwrStartYears, summarizePwr } from '@/domain/engine/pwr'
import { countSuccess } from '@/domain/engine/success'
import { summarize } from '@/domain/engine/summary'
import { geometricMean } from '@/domain/market/returns'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { RetirementPlan } from '@/domain/model/types'
import { parsePlan } from '@/domain/model/validation'
import { vpwFactor } from '@/domain/withdrawal/rules'
import { enginePlan } from '../../helpers/plans'

/** Historische Sequenzen ab 1963, 30 Entnahmejahre, 4 % real, 50/50. */
function historicalPlan(adjust: (p: RetirementPlan) => void = () => {}): RetirementPlan {
  return enginePlan((p) => {
    p.household.currentAge = 65
    p.household.retirementAge = 65
    p.household.planningHorizonAge = 94
    p.household.longevity = { type: 'fixed' }
    p.portfolio.totalValue = 1_000_000
    p.savings.yearlyNet = 0
    p.spending.netConsumption = 40_000
    p.spending.minimumAcceptableConsumption = 40_000
    p.strategy = { type: 'fixed', equity: 0.5, cash: 0 }
    p.market.type = 'historical-sequence'
    p.market.bootstrap = { meanBlockLength: 5, toYear: 2025 }
    adjust(p)
  })
}

const WINDOWS = 2025 - 29 - 1963 + 1

describe('Zielvermögen', () => {
  it('ist standardmäßig 0 und wird bei älteren Plänen ergänzt', () => {
    expect(createDefaultPlan(2026).spending.targetWealth).toBe(0)
    const old = createDefaultPlan(2026) as unknown as { spending: Record<string, unknown> }
    delete old.spending.targetWealth
    expect(parsePlan(old).spending.targetWealth).toBe(0)
  })

  it('senkt die Erfolgsquote um die Pfade, die das Ziel am Horizont verfehlen', () => {
    const base = historicalPlan()
    const withTarget = historicalPlan((p) => (p.spending.targetWealth = 800_000))
    const plain = summarize(base, simulateBlock(base, 0, WINDOWS, ctx))
    const block = simulateBlock(withTarget, 0, WINDOWS, ctx)
    const targeted = summarize(withTarget, block)

    expect(plain.targetWealth.missedPaths).toBe(0)
    const terminal = Array.from(
      { length: WINDOWS },
      (_, p) => block.series.totalReal[p * block.years + block.years - 1],
    )
    const missed = terminal.filter((w) => w < 800_000).length
    expect(missed).toBeGreaterThan(0)
    expect(targeted.targetWealth).toEqual({
      amount: 800_000,
      missedPaths: missed,
      mortalityMissedPaths: missed,
    })
    const succeeded = terminal.filter((w, p) => w >= 800_000 && block.failureYears[p] === 0).length
    expect(targeted.successRate).toBeCloseTo(succeeded / WINDOWS, 12)
    expect(targeted.successRate).toBeLessThan(plain.successRate)
    // Fehljahre bleiben unberührt
    expect(targeted.shortfall).toEqual(plain.shortfall)
  })

  it('zählt in Suche und Heatmap wie in der Auswertung', () => {
    const plan = historicalPlan((p) => (p.spending.targetWealth = 800_000))
    const summary = summarize(plan, simulateBlock(plan, 0, WINDOWS, ctx))
    const count = countSuccess(plan, 0, WINDOWS, ctx)
    expect(count.succeeded / WINDOWS).toBeCloseTo(summary.successRate, 12)
    expect(count.mortalitySucceeded / WINDOWS).toBeCloseTo(
      summary.mortalityWeighted.successRate,
      12,
    )
  })

  it('gilt sterblichkeitsgewichtet am Ende des Sterbejahres', () => {
    const plan = enginePlan((p) => {
      p.market.type = 'lognormal'
      p.simulation.paths = 400
      p.household.currentAge = 65
      p.household.retirementAge = 65
      p.household.planningHorizonAge = 100
      p.household.longevity = { type: 'gompertz', modalAge: 88, dispersion: 10 }
      p.portfolio.totalValue = 1_000_000
      p.savings.yearlyNet = 0
      p.spending.netConsumption = 30_000
      p.spending.minimumAcceptableConsumption = 30_000
      p.spending.targetWealth = 600_000
    })
    const block = simulateBlock(plan, 0, 400, ctx)
    const summary = summarize(plan, block)
    let missed = 0
    for (let p = 0; p < 400; p++) {
      const t = Math.min(block.years - 1, block.deathAge[p] - plan.household.currentAge)
      if (block.series.totalReal[p * block.years + t] < 600_000) missed++
    }
    expect(summary.targetWealth.mortalityMissedPaths).toBe(missed)
    // Vor dem Horizont ist meist mehr übrig als am Horizont.
    expect(summary.targetWealth.mortalityMissedPaths).toBeLessThan(summary.targetWealth.missedPaths)
    const count = countSuccess(plan, 0, 400, ctx)
    expect(count.mortalitySucceeded / 400).toBeCloseTo(summary.mortalityWeighted.successRate, 12)
  })
})

describe('Perfect Withdrawal Rate mit Zielvermögen', () => {
  it('entspricht ohne Schwankung der Annuität auf das Vermögen abzüglich Barwert des Ziels', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 95
      p.portfolio.totalValue = 1_000_000
      p.strategy = { type: 'fixed', equity: 1, cash: 0 }
      p.market.equity.ter = 0
      p.spending.targetWealth = 300_000
    })
    const [pwr] = perfectWithdrawalRates(plan, 0, 1, ctx)
    const g = geometricMean(plan.market.equity.mean, plan.market.equity.vol)
    const pi = geometricMean(plan.market.inflation.mean, plan.market.inflation.vol)
    const real = (1 + g) / (1 + pi) - 1
    const expected = (1_000_000 - 300_000 / (1 + real) ** 36) * vpwFactor(real, 36)
    expect(Math.abs(pwr - expected)).toBeLessThan(1)
  })

  it('ist 0, wenn das Depot das Ziel auch ohne Entnahme nicht erreicht', () => {
    const plan = enginePlan((p) => {
      p.portfolio.totalValue = 100_000
      p.spending.targetWealth = 50_000_000
    })
    expect(perfectWithdrawalRates(plan, 0, 1, ctx)[0]).toBe(0)
  })

  it('ordnet bei historischen Sequenzen jedem Startjahr seine PWR zu', () => {
    const plan = historicalPlan(
      (p) => (p.market.bootstrap = { meanBlockLength: 5, fromYear: 1990, toYear: 1999 }),
    )
    const years = pwrStartYears(plan, ctx)
    expect(years).toEqual(Array.from({ length: 10 }, (_, i) => 1990 + i))
    const values = perfectWithdrawalRates(plan, 0, 10, ctx)
    const summary = summarizePwr(values, plan, years)
    expect(summary.byStartYear?.map((r) => r.year)).toEqual(years)
    expect(summary.byStartYear?.[3].amount).toBe(values[3])
    expect(summary.plannedConsumption).toBe(40_000)
    // 30 Jahre ab 1990 reichen über 1999 hinaus: alle Startjahre setzen zyklisch fort
    expect(summary.cyclicFromYear).toBe(1990)
    expect(() => summarizePwr(values, plan, [1990])).toThrow(RangeError)
  })

  it('kennzeichnet die Startjahre, deren Folge über das Datenende hinausreicht', () => {
    const plan = historicalPlan()
    const years = pwrStartYears(plan, ctx)!
    expect(years).toHaveLength(63)
    // 30 Simulationsjahre: Startjahr 1996 endet 2025, 1997 reicht darüber hinaus
    expect(summarizePwr(new Float64Array(63), plan, years).cyclicFromYear).toBe(1997)
  })

  it('liefert ohne historische Sequenzen keine Startjahre', () => {
    const plan = historicalPlan((p) => (p.market.type = 'lognormal'))
    expect(pwrStartYears(plan, ctx)).toBeNull()
    expect(summarizePwr(new Float64Array([1, 2]), plan).byStartYear).toBeNull()
  })
})
