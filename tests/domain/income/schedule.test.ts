import { describe, expect, it } from 'vitest'

import { paramsDe2026 as params } from '@/data/params-de-2026'
import { additionalIncomeSchedule, incomePayments } from '@/domain/income/schedule'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { AdditionalIncome } from '@/domain/model/types'
import { occupationalAllowanceRow, taxableShare, yieldShare } from '@/domain/tax/pensionTax'

// Default-Szenario: 52 Jahre im Jahr 2026, Horizont 95 → 44 Jahre, Index t = Alter − 52
const YEARS = 44

function income(patch: Partial<AdditionalIncome>): AdditionalIncome {
  return {
    label: '',
    product: 'bav-insurance',
    payout: 'lifelong',
    startAge: 67,
    years: 10,
    amount: 1_000,
    growth: 0,
    basis: 'nominal',
    contributions: 0,
    contractYear: 2010,
    fundLinked: false,
    ...patch,
  }
}

function schedule(...incomes: Partial<AdditionalIncome>[]) {
  const plan = createDefaultPlan(2026)
  plan.additionalIncome = incomes.map(income)
  const result = additionalIncomeSchedule(plan, YEARS, params, 0.02)
  if (!result) throw new Error('Zahlungsplan fehlt')
  return result
}

describe('Zahlungen weiterer Einkünfte', () => {
  it('zahlt eine lebenslange Rente bis zum Horizont mit jährlicher Steigerung', () => {
    const pay = incomePayments(income({ amount: 500, growth: 0.01 }), 52, YEARS, 0.02)
    expect(pay[14]).toBe(0)
    expect(pay[15]).toBeCloseTo(6_000, 9)
    expect(pay[16]).toBeCloseTo(6_060, 9)
    expect(pay[43]).toBeCloseTo(6_000 * 1.01 ** 28, 6)
  })

  it('begrenzt eine befristete Auszahlung auf ihre Laufzeit und den Horizont', () => {
    const tenYears = incomePayments(income({ payout: 'fixed-term', startAge: 70 }), 52, YEARS, 0)
    expect([...tenYears].filter((v) => v > 0)).toHaveLength(10)
    expect(tenYears[27]).toBeGreaterThan(0)
    expect(tenYears[28]).toBe(0)
    const late = incomePayments(income({ payout: 'fixed-term', startAge: 90 }), 52, YEARS, 0)
    expect([...late].filter((v) => v > 0)).toHaveLength(6)
  })

  it('rechnet Beträge in heutiger Kaufkraft mit der erwarteten Inflation um', () => {
    const lump = incomePayments(
      income({ payout: 'lump-sum', startAge: 62, amount: 10_000, basis: 'today' }),
      52,
      YEARS,
      0.02,
    )
    expect(lump[10]).toBeCloseTo(10_000 * 1.02 ** 10, 6)
    const annuity = incomePayments(income({ basis: 'today', growth: 0.01 }), 52, YEARS, 0.02)
    expect(annuity[15]).toBeCloseTo(12_000 * 1.02 ** 15, 6)
    expect(annuity[16]).toBeCloseTo(12_000 * 1.02 ** 16 * 1.01, 6)
  })

  it('liefert ohne weitere Einkünfte keinen Zahlungsplan', () => {
    expect(additionalIncomeSchedule(createDefaultPlan(2026), YEARS, params, 0.02)).toBeNull()
  })
})

describe('Besteuerung weiterer Einkünfte', () => {
  it('Direktversicherung und Riester: voll steuerpflichtig nach § 22 Nr. 5 EStG', () => {
    const s = schedule({}, { product: 'riester', amount: 300 })
    expect(s[15].section22Recurring).toBeCloseTo(12_000 + 3_600, 9)
    expect(s[15].recurring).toBeCloseTo(15_600, 9)
    const lump = schedule({ payout: 'lump-sum', amount: 100_000 })
    expect(lump[15].section22LumpSum).toBe(100_000)
    expect(lump[15].lumpSum).toBe(100_000)
  })

  it('Direktzusage ab 63: Versorgungsfreibetrag 2037 (8,4 %, höchstens 630 €), Zuschlag 189 €, 102 € Pauschbetrag', () => {
    expect(occupationalAllowanceRow(2037, params)).toEqual({
      share: 0.084,
      cap: 630,
      surcharge: 189,
    })
    const s = schedule({ product: 'bav-direct', startAge: 63 })
    expect(s[11].tariffRecurring).toBeCloseTo(12_000 - 630 - 189 - 102, 9)
    // Freibetrag bleibt für die gesamte Laufzeit gleich
    expect(s[30].tariffRecurring).toBeCloseTo(12_000 - 921, 9)
    expect(s[11].section22Recurring).toBe(0)
  })

  it('Direktzusage vor 63: Arbeitslohn mit 1.230 € Pauschbetrag, ab 63 Versorgungsbezug', () => {
    const s = schedule({ product: 'bav-direct', startAge: 60 })
    expect(s[8].tariffRecurring).toBeCloseTo(12_000 - 1_230, 9)
    expect(s[10].tariffRecurring).toBeCloseTo(12_000 - 1_230, 9)
    // Versorgungsbeginn 2037 (63 Jahre)
    expect(s[11].tariffRecurring).toBeCloseTo(12_000 - 921, 9)
  })

  it('Kapitalabfindung einer Direktzusage: Freibeträge, Rest außerordentlich (Fünftelregelung)', () => {
    const s = schedule({ product: 'bav-direct', payout: 'lump-sum', startAge: 65, amount: 50_000 })
    // 2039: 7,6 % höchstens 570 €, Zuschlag 171 €
    expect(s[13].extraordinary).toBeCloseTo(50_000 - 570 - 171 - 102, 9)
    expect(s[13].tariffRecurring).toBe(0)
  })

  it('Basisrente: Besteuerungsanteil nach Beginnjahr, Rentenfreibetrag aus dem ersten Jahr', () => {
    const s = schedule({ product: 'basis', growth: 0.02 })
    const free = (1 - taxableShare(2041, params)) * 12_000
    expect(free).toBeCloseTo(1_020, 9)
    expect(s[15].section22Recurring).toBeCloseTo(12_000 - free, 9)
    expect(s[16].section22Recurring).toBeCloseTo(12_240 - free, 9)
  })

  it('private Leibrente: Ertragsanteil nach dem Alter bei Beginn', () => {
    expect(yieldShare(60, params)).toBe(0.22)
    expect(yieldShare(65, params)).toBe(0.18)
    expect(yieldShare(66, params)).toBe(0.18)
    expect(yieldShare(67, params)).toBe(0.17)
    expect(yieldShare(120, params)).toBe(0.01)
    const s = schedule({ product: 'private-annuity', amount: 400 })
    expect(s[15].section22Recurring).toBeCloseTo(4_800 * 0.17, 9)
  })

  it('Lebensversicherung: halber Unterschiedsbetrag ab 62 und 12 Jahren, sonst Abgeltungsteuer', () => {
    const lv = (patch: Partial<AdditionalIncome>) =>
      schedule({
        product: 'life-insurance',
        payout: 'lump-sum',
        startAge: 62,
        amount: 100_000,
        contributions: 70_000,
        contractYear: 2012,
        ...patch,
      })
    expect(lv({})[10].insuranceHalfGain).toBeCloseTo(15_000, 9)
    expect(lv({})[10].voluntaryLumpSum).toBe(100_000)
    // ab 2012 geschlossen: erst mit 62
    expect(lv({ startAge: 61 })[9].insuranceGain).toBeCloseTo(30_000, 9)
    // bis 2011 geschlossen: schon mit 60
    expect(lv({ startAge: 61, contractYear: 2011 })[9].insuranceHalfGain).toBeCloseTo(15_000, 9)
    // weniger als 12 Jahre Laufzeit
    expect(lv({ contractYear: 2026 })[10].insuranceGain).toBeCloseTo(30_000, 9)
    // Altvertrag vor 2005: steuerfrei
    const old = lv({ contractYear: 2004 })[10]
    expect(old.insuranceGain + old.insuranceHalfGain).toBe(0)
    // fondsgebunden: 15 % steuerfrei
    expect(lv({ fundLinked: true })[10].insuranceHalfGain).toBeCloseTo(12_750, 9)
  })

  it('Ratenzahlung einer Rentenversicherung: Ertrag anteilig je Rate', () => {
    const s = schedule({
      product: 'private-annuity',
      payout: 'fixed-term',
      startAge: 65,
      contributions: 60_000,
      contractYear: 2010,
    })
    // 120.000 € Auszahlung, 60.000 € Beiträge → je Rate 6.000 € Ertrag, zur Hälfte
    expect(s[13].insuranceHalfGain).toBeCloseTo(3_000, 9)
    expect(s[22].insuranceHalfGain).toBeCloseTo(3_000, 9)
    expect(s[23].insuranceHalfGain).toBe(0)
  })

  it('sonstige Einnahmen: steuerpflichtig zum Tarif oder steuerfrei', () => {
    const s = schedule({ product: 'other-taxable', payout: 'lump-sum', amount: 20_000 })
    expect(s[15].tariffLumpSum).toBe(20_000)
    const free = schedule({ product: 'other-tax-free', payout: 'lump-sum', amount: 20_000 })
    expect(free[15].lumpSum).toBe(20_000)
    expect(free[15].tariffLumpSum + free[15].section22LumpSum + free[15].voluntaryLumpSum).toBe(0)
  })
})

describe('Beitragspflicht weiterer Einkünfte', () => {
  it('Betriebsrenten sind Versorgungsbezüge, Kapitalleistungen zählen zehn Jahre mit einem Zehntel', () => {
    const s = schedule({ amount: 500 }, { payout: 'lump-sum', amount: 100_000 })
    expect(s[15].occupationalRecurring).toBeCloseTo(6_000, 9)
    expect(s[15].occupationalSpread).toBeCloseTo(10_000, 9)
    expect(s[24].occupationalSpread).toBeCloseTo(10_000, 9)
    expect(s[25].occupationalSpread).toBe(0)
    expect(s[15].voluntaryRecurring + s[15].voluntaryLumpSum).toBe(0)
  })

  it('Riester, Basisrente und private Versicherungen zählen nur bei freiwillig Versicherten', () => {
    const s = schedule(
      { product: 'riester', amount: 300 },
      { product: 'basis', amount: 200 },
      { product: 'private-annuity', amount: 100 },
    )
    expect(s[15].voluntaryRecurring).toBeCloseTo(7_200, 9)
    expect(s[15].occupationalRecurring + s[15].occupationalSpread).toBe(0)
  })
})
