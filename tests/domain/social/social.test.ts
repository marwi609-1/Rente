import { describe, expect, it } from 'vitest'

import { paramsDe2026 as params } from '@/data/params-de-2026'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { HealthInsurance } from '@/domain/model/types'
import { healthCharge, type HealthChargeInput } from '@/domain/social/health'
import { accessFactor, claimAtExit, pensionSchedule } from '@/domain/social/pension'

describe('gesetzliche Rente', () => {
  const plan = createDefaultPlan(2026)

  it('Abschlag 0,3 % je Monat: Beginn mit 64 bei Regelalter 67 → 10,8 %', () => {
    expect(1 - accessFactor({ ...plan.statePension, startAge: 64 }, params)).toBeCloseTo(0.108, 12)
    expect(1 - accessFactor({ ...plan.statePension, startAge: 63 }, params)).toBeCloseTo(0.144, 12)
    expect(accessFactor({ ...plan.statePension, startAge: 67 }, params)).toBe(1)
  })

  it('Zuschlag 0,5 % je Monat bei späterem Beginn (§ 77 SGB VI)', () => {
    expect(accessFactor({ ...plan.statePension, startAge: 68 }, params)).toBeCloseTo(1.06, 12)
  })

  it('interpoliert den Anspruch bei Ausstieg linear zwischen bisherigem Anspruch und Hochrechnung', () => {
    // 52 → 57 von 52 → 67: ein Drittel des Zuwachses
    expect(claimAtExit(plan.household, plan.statePension)).toBeCloseTo(1_600 + 400 / 3, 9)
    expect(claimAtExit({ ...plan.household, retirementAge: 70 }, plan.statePension)).toBeCloseTo(
      2_000,
      9,
    )
    expect(claimAtExit({ ...plan.household, retirementAge: 52 }, plan.statePension)).toBeCloseTo(
      1_600,
      9,
    )
  })

  it('zahlt ab Rentenbeginn, schreibt nominal fort und setzt den Rentenfreibetrag fest', () => {
    const schedule = pensionSchedule(plan.household, plan.statePension, 44, params)
    const monthly = 1_600 + 400 / 3
    expect(schedule.gross[14]).toBe(0) // Alter 66
    expect(schedule.gross[15]).toBeCloseTo(monthly * 12 * 1.025 ** 15, 6) // Alter 67
    expect(schedule.gross[20]).toBeCloseTo(monthly * 12 * 1.025 ** 20, 6)
    expect(schedule.startYear).toBe(2041)
    // Besteuerungsanteil 2041: 91,5 %
    expect(schedule.allowance).toBeCloseTo(0.085 * monthly * 12 * 1.025 ** 15, 6)
  })

  it('zahlt keine Rente in Jahren mit Erwerbseinkommen', () => {
    const schedule = pensionSchedule(
      { ...plan.household, retirementAge: 66 },
      { ...plan.statePension, startAge: 64 },
      44,
      params,
    )
    expect(schedule.gross[12]).toBe(0) // 64, noch erwerbstätig
    expect(schedule.gross[14]).toBeGreaterThan(0) // 66
    expect(schedule.accessFactor).toBeCloseTo(0.892, 12)
  })
})

describe('Kranken- und Pflegeversicherung', () => {
  const base: HealthChargeInput = {
    phase: 'bridge',
    health: createDefaultPlan(2026).health,
    childless: false,
    pensionGross: 0,
    capitalBase: 0,
    yearIndex: 0,
    params,
  }
  const kv = (patch: Partial<HealthChargeInput>, health?: Partial<HealthInsurance>) =>
    healthCharge({ ...base, ...patch, health: { ...base.health, ...health } })

  it('Überbrückung: 10.000 € Kapitalerträge → Mindestbemessungsgrundlage, rund 3.243 € Beitrag', () => {
    const charge = kv({ capitalBase: 10_000 })
    expect(charge.total).toBeCloseTo(1_318.33 * (0.14 + 0.029 + 0.036) * 12, 9)
    expect(Math.round(charge.total)).toBe(3_243)
    expect(charge.onPension).toBe(0)
    expect(charge.deductible).toBe(charge.total)
  })

  it('Überbrückung: Beitrag auf Kapitalerträge zwischen Mindestgrundlage und BBG', () => {
    expect(kv({ capitalBase: 30_000 }).total).toBeCloseTo(30_000 * 0.205, 9)
    expect(kv({ capitalBase: 100_000 }).total).toBeCloseTo(69_750 * 0.205, 9)
    expect(kv({ capitalBase: 30_000, childless: true }).total).toBeCloseTo(30_000 * 0.211, 9)
  })

  it('schreibt Mindestbemessung und BBG fort', () => {
    expect(kv({ yearIndex: 2 }).total).toBeCloseTo(1_318.33 * 12 * 1.025 ** 2 * 0.205, 9)
  })

  it('Überbrückung mit PKV: fester Beitrag mit Steigerung, nicht als Basisvorsorge abgezogen', () => {
    const charge = kv(
      { yearIndex: 2 },
      { bridgePhase: { type: 'pkv', monthlyPremium: 500, premiumGrowth: 0.03 } },
    )
    expect(charge.total).toBeCloseTo(6_000 * 1.03 ** 2, 9)
    expect(charge.deductible).toBe(0)
  })

  it('Rente mit KVdR: halber allgemeiner Satz, halber Zusatzbeitrag, PV voll; nur auf die Rente', () => {
    const charge = kv({ phase: 'pension', pensionGross: 24_000, capitalBase: 50_000 })
    expect(charge.total).toBeCloseTo(24_000 * (0.073 + 0.0145 + 0.036), 9)
    expect(charge.onPension).toBe(charge.total)
  })

  it('Rente ohne KVdR: freiwillig mit Rente und Kapitalerträgen, abzüglich RV-Zuschuss', () => {
    const charge = kv(
      { phase: 'pension', pensionGross: 24_000, capitalBase: 10_000 },
      { kvdrEligible: false },
    )
    const expected =
      24_000 * (0.146 + 0.029) + 10_000 * (0.14 + 0.029) + 34_000 * 0.036 - 24_000 * 0.0875
    expect(charge.total).toBeCloseTo(expected, 9)
    expect(charge.onPension).toBeCloseTo(24_000 * (0.0875 + 0.036), 9)
  })

  it('Rente ohne KVdR: Mindestbemessungsgrundlage bei kleiner Rente', () => {
    const charge = kv(
      { phase: 'pension', pensionGross: 6_000, capitalBase: 0 },
      { kvdrEligible: false },
    )
    const minimum = 1_318.33 * 12
    const expected =
      6_000 * (0.146 + 0.029) +
      (minimum - 6_000) * (0.14 + 0.029) +
      minimum * 0.036 -
      6_000 * 0.0875
    expect(charge.total).toBeCloseTo(expected, 9)
  })

  it('erhebt in der Erwerbsphase keine Beiträge', () => {
    expect(kv({ phase: 'work', capitalBase: 50_000 })).toEqual({
      total: 0,
      onPension: 0,
      deductible: 0,
    })
  })
})
