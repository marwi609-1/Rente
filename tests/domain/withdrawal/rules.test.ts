import { describe, expect, it } from 'vitest'

import { createDefaultPlan } from '@/domain/model/defaults'
import type { Household, Spending, WithdrawalRule } from '@/domain/model/types'
import { withdrawalPolicy, type WithdrawalContext } from '@/domain/withdrawal/rules'

const household: Household = { ...createDefaultPlan(2026).household, planningHorizonAge: 95 }

function policyFor(rule: WithdrawalRule, netConsumption = 100_000) {
  const spending: Spending = { ...createDefaultPlan(2026).spending, rule, netConsumption }
  return withdrawalPolicy(spending, household)()
}

function ctx(patch: Partial<WithdrawalContext>): WithdrawalContext {
  return { age: 60, portfolioValue: 1_000_000, inflationIndex: 1, previousReturn: null, ...patch }
}

describe('Prozent vom Depot', () => {
  it('entnimmt den Satz vom Depotwert zu Jahresbeginn', () => {
    const policy = policyFor({ type: 'percent-of-portfolio', rate: 0.04 })
    expect(policy(ctx({}))).toBe(40_000)
    expect(policy(ctx({ portfolioValue: 500_000 }))).toBe(20_000)
  })
})

describe('Floor & Ceiling', () => {
  const rule: WithdrawalRule = {
    type: 'floor-ceiling',
    rate: 0.05,
    floorFactor: 0.8,
    ceilingFactor: 1.2,
  }

  it('begrenzt den Prozentsatz auf das Band um den realen Netto-Konsum', () => {
    const policy = policyFor(rule, 50_000)
    expect(policy(ctx({ portfolioValue: 1_000_000 }))).toBe(50_000)
    expect(policy(ctx({ portfolioValue: 500_000 }))).toBe(40_000)
    expect(policy(ctx({ portfolioValue: 2_000_000 }))).toBe(60_000)
  })

  it('inflationiert die Grenzen', () => {
    const policy = policyFor(rule, 50_000)
    expect(policy(ctx({ portfolioValue: 500_000, inflationIndex: 1.5 }))).toBeCloseTo(60_000, 9)
  })
})

describe('Guyton-Klinger', () => {
  // Anfangsrate 5 %, Band ±20 % → Schwellen 6 % und 4 %, Anpassung 10 %
  const rule: WithdrawalRule = {
    type: 'guyton-klinger',
    initialRate: 0.05,
    guardBand: 0.2,
    adjustment: 0.1,
  }

  /** Erstes Jahr mit 1 Mio. €, dann ein Jahr mit den angegebenen Werten. */
  function secondYear(patch: Partial<WithdrawalContext>) {
    const policy = policyFor(rule)
    const first = policy(ctx({}))
    return { first, second: policy(ctx({ age: 61, previousReturn: 0.01, ...patch })) }
  }

  it('startet mit der Anfangsrate', () => {
    expect(secondYear({}).first).toBe(50_000)
  })

  it('kürzt erst oberhalb der oberen Schwelle', () => {
    // 50.000 / 833.333,33 = 6,0 % genau → keine Kürzung
    expect(secondYear({ portfolioValue: 50_000 / 0.06 }).second).toBeCloseTo(50_000, 9)
    // knapp darüber → Kürzung um 10 %
    expect(secondYear({ portfolioValue: 50_000 / 0.0601 }).second).toBeCloseTo(45_000, 9)
  })

  it('erhöht erst unterhalb der unteren Schwelle', () => {
    expect(secondYear({ portfolioValue: 50_000 / 0.04 }).second).toBeCloseTo(50_000, 9)
    expect(secondYear({ portfolioValue: 50_000 / 0.0399 }).second).toBeCloseTo(55_000, 9)
  })

  it('kürzt nicht in den letzten 15 Jahren vor dem Horizont', () => {
    // Alter 81 bei Horizont 95: 15 Restjahre einschließlich des laufenden
    expect(secondYear({ age: 81, portfolioValue: 500_000 }).second).toBeCloseTo(50_000, 9)
    expect(secondYear({ age: 80, portfolioValue: 500_000 }).second).toBeCloseTo(45_000, 9)
  })

  it('setzt den Inflationsausgleich nach einem Verlustjahr aus, wenn die Rate über der Anfangsrate liegt', () => {
    // Inflation 3 %; inflationiert wären 51.500 €, Rate 51.500 / 900.000 = 5,7 % > 5 %
    expect(
      secondYear({ inflationIndex: 1.03, previousReturn: -0.05, portfolioValue: 900_000 }).second,
    ).toBeCloseTo(50_000, 9)
    // gleiche Lage nach einem Gewinnjahr: Inflationsausgleich
    expect(
      secondYear({ inflationIndex: 1.03, previousReturn: 0.05, portfolioValue: 900_000 }).second,
    ).toBeCloseTo(51_500, 9)
    // Verlustjahr, aber Rate unter der Anfangsrate: Inflationsausgleich
    expect(
      secondYear({ inflationIndex: 1.03, previousReturn: -0.05, portfolioValue: 1_100_000 }).second,
    ).toBeCloseTo(51_500, 9)
  })

  it('führt Zustand je Pfad und beginnt in einer neuen Instanz von vorn', () => {
    const spending: Spending = { ...createDefaultPlan(2026).spending, rule }
    const factory = withdrawalPolicy(spending, household)
    const a = factory()
    a(ctx({}))
    expect(a(ctx({ age: 61, portfolioValue: 700_000, previousReturn: 0.01 }))).toBeCloseTo(
      45_000,
      9,
    )
    const b = factory()
    expect(b(ctx({ portfolioValue: 700_000 }))).toBe(35_000)
  })
})
