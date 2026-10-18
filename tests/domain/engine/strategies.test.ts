import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import { simulateBlock } from '@/domain/engine/monteCarlo'
import { simulatePath } from '@/domain/engine/path'
import { summarize } from '@/domain/engine/summary'
import type { ReturnPath } from '@/domain/market/types'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { RetirementPlan } from '@/domain/model/types'
import { bondTentEquity, glidepathEquity } from '@/domain/strategy/allocation'
import { enginePlan } from '../../helpers/plans'

type Yearly = { equity: number; bonds: number; cash: number; inflation: number }

function path(years: number, byYear: (t: number) => Partial<Yearly> = () => ({})): ReturnPath {
  const out: ReturnPath = {
    equity: new Float64Array(years),
    bonds: new Float64Array(years),
    cash: new Float64Array(years),
    inflation: new Float64Array(years),
  }
  for (let t = 0; t < years; t++) {
    const r = { equity: 0, bonds: 0, cash: 0, inflation: 0, ...byYear(t) }
    out.equity[t] = r.equity
    out.bonds[t] = r.bonds
    out.cash[t] = r.cash
    out.inflation[t] = r.inflation
  }
  return out
}

/** Ruhestand ab 60 ohne Steuern, Rente, KV und Kosten. */
function retiredPlan(adjust: (p: RetirementPlan) => void): RetirementPlan {
  return enginePlan((p) => {
    p.household.currentAge = 60
    p.household.retirementAge = 60
    p.household.planningHorizonAge = 95
    p.portfolio.totalValue = 1_000_000
    p.spending.netConsumption = 40_000
    p.spending.minimumAcceptableConsumption = 0
    p.market.equity.ter = 0
    p.market.bonds.ter = 0
    adjust(p)
  })
}

describe('Bucket in der Engine', () => {
  const bucketPlan = (refillRule: 'annual' | 'equity-up-only') =>
    retiredPlan((p) => {
      p.strategy = { type: 'bucket', cashYears: 2, bondYears: 5, refillRule, equityUpThreshold: 0 }
    })

  it('startet mit den Zielbeträgen und entnimmt zuerst aus Cash', () => {
    const [year] = simulatePath(bucketPlan('annual'), path(36), ctx)
    expect(year.grossSales).toBe(40_000)
    // Ziel 80.000 € Cash, 200.000 € Anleihen; nach der Entnahme von 40.000 € aus Cash
    // füllt das Jahresende Cash aus Anleihen und Anleihen aus Aktien wieder auf.
    expect(year.cash).toBeCloseTo(80_000, 6)
    expect(year.bonds).toBeCloseTo(200_000, 6)
    expect(year.equity).toBeCloseTo(680_000, 6)
    expect(year.rebalanceSales).toBeCloseTo(80_000, 6)
  })

  it('equity-up-only verkauft in einem Verlustjahr keine Aktien zum Auffüllen', () => {
    const [down] = simulatePath(
      bucketPlan('equity-up-only'),
      path(36, () => ({ equity: -0.1 })),
      ctx,
    )
    expect(down.equity).toBeCloseTo(720_000 * 0.9, 6)
    expect(down.cash).toBeCloseTo(80_000, 6)
    expect(down.bonds).toBeCloseTo(160_000, 6)
    const [up] = simulatePath(
      bucketPlan('equity-up-only'),
      path(36, () => ({ equity: 0.1 })),
      ctx,
    )
    expect(up.bonds).toBeCloseTo(200_000, 6)
    expect(up.equity).toBeCloseTo(720_000 * 1.1 - 40_000, 6)
  })

  it('verhält sich vor dem Ruhestand wie eine feste Allokation mit der Ruhestandsaufteilung', () => {
    const plan = enginePlan((p) => {
      p.portfolio.totalValue = 1_000_000
      p.savings.yearlyNet = 0
      p.spending.netConsumption = 40_000
      p.market.inflation = { mean: 0, vol: 0 }
      p.strategy = {
        type: 'bucket',
        cashYears: 2,
        bondYears: 5,
        refillRule: 'annual',
        equityUpThreshold: 0,
      }
    })
    const [first] = simulatePath(plan, path(44), ctx)
    expect(first.phase).toBe('work')
    expect(first.cashShare).toBeCloseTo(0.08, 9)
    expect(first.bondShare).toBeCloseTo(0.2, 9)
    expect(first.equityShare).toBeCloseTo(0.72, 9)
  })

  it('verringert das Cash-Ziel, sobald die Netto-Rente die Lücke deckt', () => {
    const plan = retiredPlan((p) => {
      p.household.planningHorizonAge = 70
      p.statePension = {
        ...p.statePension,
        startAge: 63,
        earlyStartAllowed: true,
        monthlyGrossCurrent: 3_000,
        monthlyGrossProjected: 3_000,
        adjustmentRate: 0,
      }
      p.strategy = {
        type: 'bucket',
        cashYears: 2,
        bondYears: 5,
        refillRule: 'annual',
        equityUpThreshold: 0,
      }
    })
    const rows = simulatePath(plan, path(11), ctx)
    // ab 63 deckt die Netto-Rente (nach Abschlag und KVdR) einen großen Teil der 40.000 €; das
    // Depot trägt nur die Lücke, und das Cash-Ziel sinkt auf zwei Jahre dieser Lücke. Cash über dem
    // Ziel bleibt stehen und wird erst aufgezehrt, ab 64 wird auf das neue Ziel aufgefüllt.
    const gap = 40_000 - rows[3].pensionNet
    expect(rows[3].pensionNet).toBeGreaterThan(25_000)
    expect(rows[3].grossSales).toBeCloseTo(gap, 2)
    expect(rows[2].cash).toBeCloseTo(40_000, 2)
    expect(rows[3].cash).toBeCloseTo(40_000 - gap, 2)
    expect(rows[4].cash).toBeCloseTo(2 * gap, 2)
  })
})

describe('Glidepath und Bond Tent in der Engine', () => {
  it('folgt dem Glidepath bei jährlichem Rebalancing', () => {
    const plan = createDefaultPlan(2026)
    plan.tax.enabled = false
    plan.rebalancing = { band: 0, taxAware: false }
    if (plan.strategy.type !== 'glidepath') throw new Error('Default ist Glidepath')
    const rows = runDeterministic(plan, ctx)
    // bis auf die Toleranz der Fixpunktiteration für Abgaben auf das Rebalancing (1 Cent)
    for (const row of rows.filter((r) => r.total > 0)) {
      expect(row.equityShare).toBeCloseTo(glidepathEquity(plan.strategy, row.age), 7)
      expect(row.cashShare).toBeCloseTo(0.05, 7)
    }
  })

  it('folgt dem Bond Tent mit dem Minimum beim Tiefpunktalter', () => {
    const plan = retiredPlan((p) => {
      p.household.currentAge = 50
      p.household.retirementAge = 60
      p.spending.netConsumption = 20_000
      p.strategy = {
        type: 'bond-tent',
        startAge: 50,
        startEquity: 0.8,
        peakAge: 60,
        peakEquity: 0.4,
        endAge: 75,
        endEquity: 0.8,
        cash: 0,
      }
    })
    const rows = simulatePath(plan, path(46), ctx)
    const shares = rows.map((r) => r.equityShare)
    const minimum = Math.min(...shares)
    expect(rows[shares.indexOf(minimum)].age).toBe(60)
    if (plan.strategy.type !== 'bond-tent') throw new Error('Bond Tent erwartet')
    for (const row of rows) {
      expect(row.equityShare).toBeCloseTo(bondTentEquity(plan.strategy, row.age), 9)
    }
  })
})

describe('Guyton-Klinger in der Engine', () => {
  const gk = (adjust: (p: RetirementPlan) => void = () => {}) =>
    retiredPlan((p) => {
      p.strategy = { type: 'fixed', equity: 1, cash: 0 }
      p.spending.rule = {
        type: 'guyton-klinger',
        initialRate: 0.05,
        guardBand: 0.2,
        adjustment: 0.1,
      }
      adjust(p)
    })

  it('kürzt nach einem Einbruch, der die Rate über die obere Schwelle hebt', () => {
    // 950.000 € · 0,8 = 760.000 € → Rate 50.000 / 760.000 = 6,6 % > 6 %
    const rows = simulatePath(
      gk(),
      path(36, (t) => (t === 0 ? { equity: -0.2 } : {})),
      ctx,
    )
    expect(rows[0].netConsumption).toBeCloseTo(50_000, 6)
    expect(rows[1].netConsumption).toBeCloseTo(45_000, 6)
  })

  it('erhöht nach einem Anstieg, der die Rate unter die untere Schwelle senkt', () => {
    // 950.000 € · 1,4 = 1.330.000 € → Rate 3,76 % < 4 %
    const rows = simulatePath(
      gk(),
      path(36, (t) => (t === 0 ? { equity: 0.4 } : {})),
      ctx,
    )
    expect(rows[1].netConsumption).toBeCloseTo(55_000, 6)
  })

  it('gleicht nach einem Verlustjahr mit Rate über der Anfangsrate keine Inflation aus', () => {
    // −10 %, Inflation 3 %: 855.000 €; inflationiert 51.500 € → 6,02 % > 5 % → bleibt 50.000 €,
    // Rate 5,85 % liegt unter der oberen Schwelle → keine Kürzung
    const rows = simulatePath(
      gk(),
      path(36, (t) => (t === 0 ? { equity: -0.1, inflation: 0.03 } : {})),
      ctx,
    )
    expect(rows[1].netConsumption).toBeCloseTo(50_000, 6)
    // ohne Verlust wird die Inflation ausgeglichen
    const rising = simulatePath(
      gk(),
      path(36, (t) => (t === 0 ? { inflation: 0.03 } : {})),
      ctx,
    )
    expect(rising[1].netConsumption).toBeCloseTo(51_500, 6)
  })

  it('kürzt in den letzten 15 Jahren vor dem Horizont nicht', () => {
    const plan = gk((p) => {
      p.household.currentAge = 80
      p.household.retirementAge = 80
    })
    const rows = simulatePath(
      plan,
      path(16, (t) => (t === 0 ? { equity: -0.2 } : {})),
      ctx,
    )
    expect(rows[1].netConsumption).toBeCloseTo(50_000, 6)
  })
})

describe('Steueroptimiertes Rebalancing', () => {
  const plan = (taxAware: boolean) =>
    enginePlan((p) => {
      p.household.currentAge = 30
      p.household.retirementAge = 60
      p.household.planningHorizonAge = 60
      p.portfolio.totalValue = 200_000
      p.savings.yearlyNet = 20_000
      p.strategy = { type: 'fixed', equity: 0.6, cash: 0 }
      p.rebalancing = { band: 0.02, taxAware }
      p.tax.enabled = true
    })
  const total = (rows: { rebalanceSales: number }[]) =>
    rows.reduce((a, r) => a + r.rebalanceSales, 0)

  it('verkauft bei Zuflüssen weniger als Rebalancing ohne Flusssteuerung', () => {
    const returns = path(31, (t) => ({ equity: t % 2 === 0 ? 0.15 : -0.05, bonds: 0.02 }))
    const aware = simulatePath(plan(true), returns, ctx)
    const plain = simulatePath(plan(false), returns, ctx)
    expect(total(aware)).toBeLessThan(total(plain))
    // Jahr 1: 62,7 % Aktien verletzt das Band; die Sparrate des Folgejahres (20.000 €) gleicht die
    // Abweichung aus, also wird nichts verkauft.
    expect(plain[0].rebalanceSales).toBeGreaterThan(0)
    expect(aware[0].rebalanceSales).toBe(0)
  })

  it('verkauft bei stetig steigenden Aktien nur den Teil, den der Zufluss nicht ausgleicht', () => {
    const returns = path(31, () => ({ equity: 0.12, bonds: 0.02 }))
    const aware = simulatePath(plan(true), returns, ctx)
    const plain = simulatePath(plan(false), returns, ctx)
    expect(total(aware)).toBeLessThan(total(plain))
    expect(aware.slice(0, 30).every((r, t) => r.rebalanceSales <= plain[t].rebalanceSales)).toBe(
      true,
    )
  })
})

describe('Default-Szenario', () => {
  it('ist jetzt vollständig rechenbar (Glidepath, Steuern, Rente, KV, Gompertz)', () => {
    const plan = createDefaultPlan(2026)
    plan.simulation.paths = 1_000
    const rows = runDeterministic(plan, ctx)
    expect(rows).toHaveLength(44)
    const summary = summarize(plan, simulateBlock(plan, 0, 1_000, ctx))
    expect(summary.successRate).toBeGreaterThanOrEqual(0)
    expect(summary.mortalityWeighted.successRate).toBeGreaterThanOrEqual(summary.successRate)
  })
})
