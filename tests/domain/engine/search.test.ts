import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import {
  HEATMAP_EQUITY,
  heatmapCellPlan,
  heatmapConfigSchema,
  heatmapRows,
} from '@/domain/engine/heatmap'
import { simulateBlock } from '@/domain/engine/monteCarlo'
import { simulatePath } from '@/domain/engine/path'
import { deterministicReturnPath } from '@/domain/market/deterministic'
import { geometricMean } from '@/domain/market/returns'
import { withEquityShare, withNetConsumption } from '@/domain/engine/planVariants'
import { perfectWithdrawalRates, summarizePwr } from '@/domain/engine/pwr'
import { findFireAge, findSafeWithdrawal, type SuccessEvaluator } from '@/domain/engine/search'
import { countSuccess } from '@/domain/engine/success'
import { summarize } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import { vpwFactor } from '@/domain/withdrawal/rules'
import { enginePlan } from '../../helpers/plans'

/** Stochastischer Plan mit kurzer Laufzeit für schnelle Suchen. */
function stochastic(adjust: (p: RetirementPlan) => void = () => {}) {
  return enginePlan((p) => {
    p.market.type = 'lognormal'
    p.simulation.paths = 1_000
    p.household.currentAge = 60
    p.household.retirementAge = 60
    p.household.planningHorizonAge = 90
    p.portfolio.totalValue = 1_000_000
    p.spending.netConsumption = 45_000
    p.spending.minimumAcceptableConsumption = 36_000
    adjust(p)
  })
}

/** Erfolgsquote auf den ersten `paths` Pfaden im selben Prozess. */
const evaluate: SuccessEvaluator = async (plan, paths) =>
  countSuccess(plan, 0, paths, ctx).succeeded / paths

describe('Erfolgszählung', () => {
  it('stimmt mit der vollständigen Auswertung überein', () => {
    const plan = stochastic((p) => {
      p.household.longevity = { type: 'gompertz', modalAge: 85, dispersion: 9 }
    })
    const summary = summarize(plan, simulateBlock(plan, 0, 1_000, ctx))
    const counts = countSuccess(plan, 0, 1_000, ctx)
    expect(counts.succeeded / 1_000).toBe(summary.successRate)
    expect(counts.mortalitySucceeded / 1_000).toBe(summary.mortalityWeighted.successRate)
  })

  it('zählt beim festen Horizont erfolgreiche Pfade auch sterblichkeitsgewichtet', () => {
    const plan = stochastic((p) => (p.household.longevity = { type: 'fixed' }))
    const counts = countSuccess(plan, 0, 200, ctx)
    expect(counts.mortalitySucceeded).toBe(counts.succeeded)
  })
})

describe('Planvarianten', () => {
  it('führt den Mindestkonsum im Verhältnis mit', () => {
    const plan = withNetConsumption(stochastic(), 50_000)
    expect(plan.spending.netConsumption).toBe(50_000)
    expect(plan.spending.minimumAcceptableConsumption).toBeCloseTo(40_000, 9)
  })

  it('setzt eine feste Allokation und behält Cash, soweit Platz ist', () => {
    const plan = stochastic()
    expect(withEquityShare(plan, 0.7).strategy).toEqual({ type: 'fixed', equity: 0.7, cash: 0.05 })
    expect(withEquityShare(plan, 1).strategy).toEqual({ type: 'fixed', equity: 1, cash: 0 })
    // der Ausgangsplan bleibt unverändert
    expect(plan.strategy).toEqual({ type: 'fixed', equity: 0.6, cash: 0.05 })
  })
})

describe('Sichere Entnahme', () => {
  const options = (target: number) => ({ target, fullPaths: 1_000, searchPaths: 400 })

  it('erreicht das Ziel mit voller Pfadzahl, 100 € mehr verfehlen es in der Suche', async () => {
    const plan = stochastic()
    const result = await findSafeWithdrawal(plan, evaluate, options(0.9))
    if (!result.applicable || result.netConsumption === null) throw new Error('Ergebnis erwartet')
    expect(result.netConsumption % 100).toBe(0)
    expect(result.successRate).toBeGreaterThanOrEqual(0.9)
    expect(await evaluate(withNetConsumption(plan, result.netConsumption), 1_000)).toBe(
      result.successRate,
    )
    const above = withNetConsumption(plan, result.netConsumption + 100)
    const aboveRate = Math.min(await evaluate(above, 400), await evaluate(above, 1_000))
    expect(aboveRate).toBeLessThan(0.9)
    expect(result.minimumRatio).toBeCloseTo(0.8, 12)
  })

  it('ist monoton: höhere Ziel-Erfolgsquote ergibt niedrigere sichere Entnahme', async () => {
    const plan = stochastic()
    const values: number[] = []
    for (const target of [0.5, 0.7, 0.8, 0.9, 0.95]) {
      const result = await findSafeWithdrawal(plan, evaluate, options(target))
      if (!result.applicable || result.netConsumption === null) throw new Error('Ergebnis erwartet')
      values.push(result.netConsumption)
    }
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1])
    // fünf vollständige Suchen: einzeln rund 5 s, im parallelen Gesamtlauf länger
  }, 30_000)

  it('gilt nur für Regeln, deren Konsumhöhe der Netto-Konsum bestimmt', async () => {
    const plan = stochastic((p) => (p.spending.rule = { type: 'percent-of-portfolio', rate: 0.04 }))
    expect(await findSafeWithdrawal(plan, evaluate, options(0.9))).toEqual({ applicable: false })
  })
})

describe('FIRE-Status', () => {
  const working = (retirementAge: number) =>
    stochastic((p) => {
      p.household.currentAge = 50
      p.household.retirementAge = retirementAge
      p.portfolio.totalValue = 600_000
      p.savings.yearlyNet = 40_000
    })

  it('meldet „erreicht“, wenn die Erfolgsquote beim gewählten Alter genügt', async () => {
    const plan = working(60)
    const result = await findFireAge(plan, evaluate, {
      target: 0.5,
      fullPaths: 1_000,
      searchPaths: 400,
      successRate: 0.6,
    })
    expect(result).toMatchObject({ reached: true, earliestAge: 60 })
  })

  it('findet das früheste spätere Ausstiegsalter mit erreichtem Ziel', async () => {
    const plan = working(52)
    const successRate = await evaluate(plan, 1_000)
    expect(successRate).toBeLessThan(0.9)
    const result = await findFireAge(plan, evaluate, {
      target: 0.9,
      fullPaths: 1_000,
      searchPaths: 400,
      successRate,
    })
    expect(result.reached).toBe(false)
    expect(result.earliestAge).not.toBeNull()
    const age = result.earliestAge!
    expect(result.earliestSuccessRate).toBeGreaterThanOrEqual(0.9)
    const before = { ...plan, household: { ...plan.household, retirementAge: age - 1 } }
    expect(Math.min(await evaluate(before, 400), await evaluate(before, 1_000))).toBeLessThan(0.9)
  })

  it('meldet kein Alter, wenn das Ziel bis zum Horizont unerreichbar ist', async () => {
    const plan = working(52)
    plan.savings.yearlyNet = 0
    plan.portfolio.totalValue = 100_000
    plan.spending.netConsumption = 1_000_000
    plan.spending.minimumAcceptableConsumption = 1_000_000
    const result = await findFireAge(plan, evaluate, {
      target: 0.9,
      fullPaths: 1_000,
      searchPaths: 400,
      successRate: 0,
    })
    expect(result.earliestAge).toBeNull()
  })
})

describe('Heatmap', () => {
  it('liefert die Zeilen des Rasters ohne Rundungsrauschen', () => {
    const config = heatmapConfigSchema.parse({ mode: 'rate', from: 0.02, to: 0.06, step: 0.005 })
    expect(heatmapRows(config)).toEqual([0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06])
    expect(HEATMAP_EQUITY).toHaveLength(11)
    expect(
      heatmapConfigSchema.safeParse({ mode: 'rate', from: 0, to: 1, step: 0.01 }).success,
    ).toBe(false)
  })

  it('fällt in jeder Spalte mit steigender Entnahmerate (Common Random Numbers)', () => {
    const plan = stochastic()
    const config = heatmapConfigSchema.parse({ mode: 'rate', from: 0.03, to: 0.06, step: 0.005 })
    const rows = heatmapRows(config)
    for (const equity of [0, 0.3, 0.6, 1]) {
      const column = rows.map(
        (row) =>
          countSuccess(heatmapCellPlan(plan, config, equity, row), 0, 500, ctx).succeeded / 500,
      )
      for (let i = 1; i < column.length; i++) expect(column[i]).toBeLessThanOrEqual(column[i - 1])
      expect(column[0]).toBeGreaterThan(column.at(-1)!)
    }
  })

  it('setzt Netto-Konsum, mitgeführten Mindestkonsum und feste Allokation je Zelle', () => {
    const plan = stochastic((p) => (p.spending.rule = { type: 'vpw', expectedRealReturn: 0.03 }))
    const config = heatmapConfigSchema.parse({ mode: 'rate', from: 0.04, to: 0.04, step: 0.01 })
    const cell = heatmapCellPlan(plan, config, 0.4, 0.04)
    expect(cell.spending.rule).toEqual({ type: 'fixed-real' })
    expect(cell.spending.netConsumption).toBe(40_000)
    expect(cell.spending.minimumAcceptableConsumption).toBeCloseTo(32_000, 9)
    expect(cell.strategy).toEqual({ type: 'fixed', equity: 0.4, cash: 0.05 })
  })
})

describe('Perfect Withdrawal Rate', () => {
  it('entspricht ohne Schwankung der realen Annuität bis zum Horizont', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 60
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 95
      p.portfolio.totalValue = 1_000_000
      p.strategy = { type: 'fixed', equity: 1, cash: 0 }
      p.market.equity.ter = 0
    })
    const [pwr] = perfectWithdrawalRates(plan, 0, 1, ctx)
    const g = geometricMean(plan.market.equity.mean, plan.market.equity.vol)
    const pi = geometricMean(plan.market.inflation.mean, plan.market.inflation.vol)
    const expected = 1_000_000 * vpwFactor((1 + g) / (1 + pi) - 1, 36)
    expect(Math.abs(pwr - expected)).toBeLessThan(1)
    // Mit dieser Entnahme ist das Depot genau im Horizontjahr aufgebraucht.
    const check = {
      ...plan,
      spending: { ...plan.spending, netConsumption: pwr, minimumAcceptableConsumption: 0 },
    }
    const rows = simulatePath(check, deterministicReturnPath(plan.market, 36), ctx)
    expect(rows.at(-1)!.total).toBeLessThan(5)
    expect(rows.at(-2)!.total).toBeGreaterThan(pwr)
  })

  it('verteilt die PWR der Pfade und liegt um die sichere Entnahme', () => {
    const plan = stochastic((p) => (p.simulation.paths = 1_000))
    const values = perfectWithdrawalRates(plan, 0, 200, ctx)
    expect(values.every((v) => v > 0)).toBe(true)
    const summary = summarizePwr(values, plan)
    expect(summary.paths).toBe(200)
    expect(summary.histogram.counts.reduce((a, b) => a + b, 0) + summary.histogram.overflow).toBe(
      200,
    )
    const p50 = summary.percentiles.find((q) => q.p === 50)!.amount
    const p10 = summary.percentiles.find((q) => q.p === 10)!.amount
    expect(p10).toBeLessThan(p50)
  })
})
