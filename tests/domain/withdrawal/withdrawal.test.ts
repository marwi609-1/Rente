import { describe, expect, it } from 'vitest'

import { createDefaultPlan } from '@/domain/model/defaults'
import { oneOffsAt, profileFactor } from '@/domain/withdrawal/profile'
import { remainingYears, vpwFactor, withdrawalPolicy } from '@/domain/withdrawal/rules'

describe('profileFactor', () => {
  const profile = [
    { age: 60, factor: 1 },
    { age: 75, factor: 0.8 },
    { age: 85, factor: 0.9 },
  ]

  it('ist für ein leeres Profil 1', () => {
    expect(profileFactor([], 70)).toBe(1)
  })

  it('interpoliert linear zwischen Stützstellen', () => {
    expect(profileFactor(profile, 67.5)).toBeCloseTo(0.9, 12)
    expect(profileFactor(profile, 80)).toBeCloseTo(0.85, 12)
    expect(profileFactor(profile, 75)).toBe(0.8)
  })

  it('ist vor der ersten und nach der letzten Stützstelle konstant', () => {
    expect(profileFactor(profile, 50)).toBe(1)
    expect(profileFactor(profile, 99)).toBe(0.9)
  })
})

describe('oneOffsAt', () => {
  it('summiert alle Einmalausgaben eines Alters', () => {
    const oneOffs = [
      { age: 60, amount: 20_000, label: 'Auto' },
      { age: 60, amount: 5_000, label: 'Reise' },
      { age: 61, amount: 1_000, label: 'Sonstiges' },
    ]
    expect(oneOffsAt(oneOffs, 60)).toBe(25_000)
    expect(oneOffsAt(oneOffs, 62)).toBe(0)
  })
})

describe('vpwFactor', () => {
  it('entspricht der vorschüssigen Annuität', () => {
    const r = 0.03
    const n = 30
    const presentValueOfOne = ((1 + r) * (1 - Math.pow(1 + r, -n))) / r
    expect(vpwFactor(r, n)).toBeCloseTo(1 / presentValueOfOne, 14)
  })

  it('ist für r = 0 gleich 1/n und im letzten Jahr 1', () => {
    expect(vpwFactor(0, 25)).toBeCloseTo(0.04, 15)
    expect(vpwFactor(0.05, 1)).toBeCloseTo(1, 15)
  })

  it('funktioniert für negative reale Renditen', () => {
    const r = -0.01
    const n = 20
    const presentValueOfOne = ((1 + r) * (1 - Math.pow(1 + r, -n))) / r
    expect(vpwFactor(r, n)).toBeCloseTo(1 / presentValueOfOne, 14)
  })

  it('lehnt Restlaufzeiten unter einem Jahr ab', () => {
    expect(() => vpwFactor(0.02, 0)).toThrow(RangeError)
  })
})

describe('withdrawalPolicy', () => {
  const plan = createDefaultPlan(2026)

  it('zählt das Horizontjahr zu den Restjahren', () => {
    expect(remainingYears(plan.household, 95)).toBe(1)
    expect(remainingYears(plan.household, 60)).toBe(36)
  })

  it('fixed-real inflationiert den Netto-Konsum', () => {
    const policy = withdrawalPolicy(plan.spending, plan.household)()
    expect(
      policy({ age: 60, portfolioValue: 1e6, inflationIndex: 1.25, previousReturn: null }),
    ).toBe(125_000)
  })

  it('vpw entnimmt den Annuitätenanteil des nominalen Depotwerts', () => {
    const spending = { ...plan.spending, rule: { type: 'vpw' as const, expectedRealReturn: 0.03 } }
    const policy = withdrawalPolicy(spending, plan.household)()
    expect(
      policy({ age: 60, portfolioValue: 1e6, inflationIndex: 1.4, previousReturn: null }),
    ).toBeCloseTo(1e6 * vpwFactor(0.03, 36), 8)
  })
})
