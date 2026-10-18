import { describe, expect, it } from 'vitest'

import type { AssetVector } from '@/domain/model/types'
import { allocationPolicy, fixedAllocation } from '@/domain/strategy/allocation'
import { invest, sell, sharesOf, totalOf } from '@/domain/strategy/flows'
import { maxDeviation, rebalanceIfOutsideBand } from '@/domain/strategy/rebalance'

const target: AssetVector = { equity: 0.6, bonds: 0.3, cash: 0.1 }

function expectVectorClose(actual: AssetVector, expected: AssetVector, digits = 9) {
  expect(actual.equity).toBeCloseTo(expected.equity, digits)
  expect(actual.bonds).toBeCloseTo(expected.bonds, digits)
  expect(actual.cash).toBeCloseTo(expected.cash, digits)
}

describe('fixedAllocation', () => {
  it('setzt den Rest als Anleihen an', () => {
    expectVectorClose(fixedAllocation({ type: 'fixed', equity: 0.55, cash: 0.05 }), {
      equity: 0.55,
      bonds: 0.4,
      cash: 0.05,
    })
  })

  it('ist unabhängig vom Alter', () => {
    const policy = allocationPolicy({ type: 'fixed', equity: 0.55, cash: 0.05 })
    expect(policy(30)).toEqual(policy(90))
  })
})

describe('invest', () => {
  it('investiert proportional zur Zielallokation', () => {
    const r = invest({ equity: 100, bonds: 100, cash: 100 }, target, 1_000, false)
    expectVectorClose(r.amounts, { equity: 600, bonds: 300, cash: 100 })
    expect(r.total).toBeCloseTo(1_000, 9)
  })

  it('füllt mit taxAware zuerst untergewichtete Klassen', () => {
    // Nach Zufluss Gesamtwert 1.000: Ziel 600/300/100, Bestand 700/100/100 → nur Anleihen fehlen.
    const r = invest({ equity: 700, bonds: 100, cash: 100 }, target, 100, true)
    expectVectorClose(r.amounts, { equity: 0, bonds: 100, cash: 0 })
  })

  it('verteilt mit taxAware anteilig zu den Lücken, wenn diese den Zufluss übersteigen', () => {
    const r = invest({ equity: 800, bonds: 100, cash: 0 }, target, 100, true)
    // Ziel bei 1.000: 600/300/100 → Lücken 0/200/100
    expectVectorClose(r.amounts, { equity: 0, bonds: 200 / 3, cash: 100 / 3 })
    expect(r.total).toBeCloseTo(100, 9)
  })
})

describe('sell', () => {
  it('verkauft proportional zur Zielallokation', () => {
    const r = sell({ equity: 600, bonds: 300, cash: 100 }, target, 100, false)
    expectVectorClose(r.amounts, { equity: 60, bonds: 30, cash: 10 })
    expect(r.total).toBeCloseTo(100, 9)
  })

  it('verteilt den Rest auf andere Klassen, wenn eine Klasse nicht ausreicht', () => {
    const r = sell({ equity: 600, bonds: 300, cash: 5 }, target, 100, false)
    // Cash trägt nur 5; die übrigen 95 werden 2:1 auf Aktien und Anleihen verteilt.
    expectVectorClose(r.amounts, { equity: 95 * (2 / 3), bonds: 95 / 3, cash: 5 })
    expect(r.total).toBeCloseTo(100, 9)
  })

  it('verkauft bei Zielgewicht 0 der Restbestände nach vorhandenem Bestand', () => {
    const r = sell({ equity: 0, bonds: 50, cash: 50 }, { equity: 1, bonds: 0, cash: 0 }, 40, false)
    expectVectorClose(r.amounts, { equity: 0, bonds: 20, cash: 20 })
  })

  it('verkauft mit taxAware aus übergewichteten Klassen', () => {
    // Nach Abfluss Gesamtwert 900: Ziel 540/270/90; Überhang nur bei Aktien (160).
    const r = sell({ equity: 700, bonds: 210, cash: 90 }, target, 100, true)
    expectVectorClose(r.amounts, { equity: 100, bonds: 0, cash: 0 })
  })

  it('verkauft mit taxAware anteilig zu den Überhängen', () => {
    // Ziel bei 900: 540/270/90 → Überhänge 160/0/10
    const r = sell({ equity: 700, bonds: 200, cash: 100 }, target, 100, true)
    expectVectorClose(r.amounts, { equity: (100 * 160) / 170, bonds: 0, cash: (100 * 10) / 170 })
  })

  it('verkauft höchstens den gesamten Bestand', () => {
    const holdings = { equity: 30, bonds: 20, cash: 10 }
    for (const taxAware of [false, true]) {
      const r = sell(holdings, target, 100, taxAware)
      expect(r.total).toBe(60)
      expect(totalOf(r.holdings)).toBe(0)
    }
  })

  it('erhält die Zielallokation bei Verkauf aus einem Depot im Ziel', () => {
    for (const taxAware of [false, true]) {
      const r = sell({ equity: 600, bonds: 300, cash: 100 }, target, 250, taxAware)
      expectVectorClose(sharesOf(r.holdings), target)
    }
  })
})

describe('Rebalancing', () => {
  it('misst die größte absolute Abweichung', () => {
    expect(maxDeviation({ equity: 700, bonds: 200, cash: 100 }, target)).toBeCloseTo(0.1, 12)
    expect(maxDeviation({ equity: 0, bonds: 0, cash: 0 }, target)).toBe(0)
  })

  it('rebalanciert erst, wenn die Abweichung das Band erreicht', () => {
    const inside = { equity: 640, bonds: 270, cash: 90 }
    expect(rebalanceIfOutsideBand(inside, target, 0.05).holdings).toBe(inside)

    const atBand = { equity: 650, bonds: 260, cash: 90 }
    const r = rebalanceIfOutsideBand(atBand, target, 0.05)
    expectVectorClose(r.holdings, { equity: 600, bonds: 300, cash: 100 })
    expect(r.sales).toBeCloseTo(50, 9)
  })

  it('stellt bei Band 0 in jedem Fall das Ziel her', () => {
    const r = rebalanceIfOutsideBand({ equity: 601, bonds: 299, cash: 100 }, target, 0)
    expectVectorClose(sharesOf(r.holdings), target)
  })
})
