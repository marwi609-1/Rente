import { describe, expect, it } from 'vitest'

import { paramsDe2026 as params } from '@/data/params-de-2026'
import type { IncomeYear } from '@/domain/income/schedule'
import { createDefaultPlan } from '@/domain/model/defaults'
import { annualCharges, type ChargeSettings, type ChargeYear } from '@/domain/tax/annualCharges'
import { capitalTaxRate, taxableCapitalIncome, vorabpauschale } from '@/domain/tax/capitalIncome'
import {
  incomeTaxTotal,
  solidaritySurcharge,
  tariffIncomeTax,
  tariffWithExtraordinary,
} from '@/domain/tax/incomeTax'
import { pensionAllowance, pensionIncome, taxableShare } from '@/domain/tax/pensionTax'

function settings(adjust: (s: ChargeSettings) => void = () => {}): ChargeSettings {
  const plan = createDefaultPlan(2026)
  const s: ChargeSettings = {
    params,
    tax: { ...plan.tax, guenstigerpruefung: false },
    health: plan.health,
    childless: false,
    churchTaxRate: 0,
  }
  adjust(s)
  return s
}

const workYear: ChargeYear = {
  phase: 'work',
  yearIndex: 0,
  pensionGross: 0,
  pensionAllowance: 0,
  lossCarryForward: 0,
  indexFactor: 1,
}

describe('Abgeltungsteuer', () => {
  it('10.000 € Gewinn aus einem Aktien-ETF: 6.000 € steuerpflichtig, 1.582,50 € Steuer', () => {
    const gainAfterExemption = 10_000 * (1 - 0.3)
    const capital = taxableCapitalIncome(gainAfterExemption, 0, 1_000)
    expect(capital.taxable).toBeCloseTo(6_000, 9)
    expect(capital.taxable * capitalTaxRate(params, 0)).toBeCloseTo(1_582.5, 9)
    // dieselbe Rechnung über die Jahresabrechnung
    const charges = annualCharges(settings(), workYear, gainAfterExemption)
    expect(charges.capitalTax).toBeCloseTo(1_582.5, 9)
    expect(charges.health).toBe(0)
  })

  it('belastet mit 9 % Kirchensteuer effektiv 27,995 %, mit 8 % 27,819 %', () => {
    expect(capitalTaxRate(params, 0)).toBeCloseTo(0.26375, 12)
    expect(capitalTaxRate(params, 0.09)).toBeCloseTo((1 / 4.09) * 1.145, 12)
    expect(capitalTaxRate(params, 0.09)).toBeCloseTo(0.27995, 5)
    expect(capitalTaxRate(params, 0.08)).toBeCloseTo(0.278186, 6)
  })

  it('Vorabpauschale: Basisertrag 2.240 €, steuerpflichtig 1.568 €; begrenzt auf den Wertzuwachs', () => {
    const vp = vorabpauschale(100_000, 5_000, 0.032, params)
    expect(vp).toBeCloseTo(2_240, 9)
    expect(vp * (1 - 0.3)).toBeCloseTo(1_568, 9)
    expect(vorabpauschale(100_000, 1_000, 0.032, params)).toBe(1_000)
    expect(vorabpauschale(100_000, -3_000, 0.032, params)).toBe(0)
    expect(vorabpauschale(100_000, 5_000, -0.005, params)).toBe(0)
  })

  it('verrechnet Verluste mit späteren Gewinnen, der Vortrag wird nie negativ', () => {
    const year1 = taxableCapitalIncome(-5_000, 0, 1_000)
    expect(year1).toEqual({ afterLosses: 0, taxable: 0, lossCarryForward: 5_000 })
    const year2 = taxableCapitalIncome(3_000, year1.lossCarryForward, 1_000)
    expect(year2).toEqual({ afterLosses: 0, taxable: 0, lossCarryForward: 2_000 })
    const year3 = taxableCapitalIncome(8_000, year2.lossCarryForward, 1_000)
    expect(year3).toEqual({ afterLosses: 6_000, taxable: 5_000, lossCarryForward: 0 })
    const year4 = taxableCapitalIncome(500, year3.lossCarryForward, 1_000)
    expect(year4).toEqual({ afterLosses: 500, taxable: 0, lossCarryForward: 0 })
  })

  it('verrechnet den Verlustvortrag vor dem Sparer-Pauschbetrag', () => {
    const charges = annualCharges(settings(), { ...workYear, lossCarryForward: 4_000 }, 10_000)
    expect(charges.capitalTax).toBeCloseTo((10_000 - 4_000 - 1_000) * 0.26375, 9)
    expect(charges.lossCarryForward).toBe(0)
  })

  it('erhebt ohne aktivierte Steuern keine Steuer', () => {
    const charges = annualCharges(
      settings((s) => (s.tax = { ...s.tax, enabled: false })),
      workYear,
      50_000,
    )
    expect(charges.capitalTax).toBe(0)
    expect(charges.incomeTax).toBe(0)
  })
})

describe('Einkommensteuer nach § 32a EStG 2026', () => {
  it('trifft Werte in allen Tarifzonen (unabhängig nachgerechnet)', () => {
    const cases: [number, number][] = [
      [12_348, 0],
      [12_349, 0],
      [15_000, 435],
      [17_799, 1_034],
      [17_800, 1_035],
      [20_000, 1_570],
      [40_000, 7_209],
      [69_878, 18_213],
      [69_879, 18_213],
      [100_000, 30_864],
      [277_826, 105_551],
      [300_000, 115_529],
    ]
    for (const [zvE, tax] of cases) expect(tariffIncomeTax(zvE, params.incomeTax)).toBe(tax)
  })

  it('rundet das zvE auf volle Euro ab', () => {
    expect(tariffIncomeTax(40_000.99, params.incomeTax)).toBe(7_209)
  })

  it('erhebt den Soli erst oberhalb der Freigrenze und mildert den Übergang', () => {
    const soli = params.solidaritySurcharge
    expect(solidaritySurcharge(20_350, soli)).toBe(0)
    expect(solidaritySurcharge(21_000, soli)).toBe(77.35)
    expect(solidaritySurcharge(25_000, soli)).toBe(553.35)
    expect(solidaritySurcharge(40_000, soli)).toBe(2_200)
  })

  it('erhebt Kirchensteuer als Satz der Einkommensteuer', () => {
    const r = incomeTaxTotal(40_000, params, 0.09)
    expect(r.incomeTax).toBe(7_209)
    expect(r.churchTax).toBeCloseTo(7_209 * 0.09, 9)
    expect(r.total).toBeCloseTo(7_209 * 1.09, 9)
  })

  it('schreibt die Eckwerte mit dem Indexfaktor proportional fort', () => {
    const base = incomeTaxTotal(40_000, params, 0).total
    expect(incomeTaxTotal(40_000 * 1.5, params, 0, 1.5).total).toBeCloseTo(base * 1.5, 6)
    // ohne Fortschreibung steigt die Last überproportional (kalte Progression)
    expect(incomeTaxTotal(60_000, params, 0).total).toBeGreaterThan(base * 1.5)
  })
})

describe('Besteuerung der gesetzlichen Rente', () => {
  it('Besteuerungsanteil nach Jahr des Rentenbeginns', () => {
    expect(taxableShare(2026, params)).toBe(0.84)
    expect(taxableShare(2040, params)).toBe(0.91)
    expect(taxableShare(2058, params)).toBe(1)
    expect(taxableShare(2005, params)).toBe(0.5)
    expect(taxableShare(2021, params)).toBe(0.81)
    expect(taxableShare(2023, params)).toBe(0.825)
    expect(taxableShare(1999, params)).toBe(0.5)
    expect(taxableShare(2070, params)).toBe(1)
  })

  it('Rentenfreibetrag und Einkünfte nach Werbungskosten-Pauschbetrag', () => {
    const allowance = pensionAllowance(24_000, 2026, params)
    expect(allowance).toBeCloseTo(3_840, 9)
    expect(pensionIncome(24_000, allowance, params)).toBeCloseTo(20_058, 9)
    // Pauschbetrag höchstens bis zur Höhe des steuerpflichtigen Teils
    expect(pensionIncome(1_050, 1_000, params)).toBe(0)
  })

  it('besteuert die Rente nach Abzug von Pauschbeträgen und KV/PV (KVdR)', () => {
    const allowance = pensionAllowance(24_000, 2026, params)
    const year: ChargeYear = {
      phase: 'pension',
      yearIndex: 0,
      pensionGross: 24_000,
      pensionAllowance: allowance,
      lossCarryForward: 0,
      indexFactor: 1,
    }
    const charges = annualCharges(settings(), year, 0)
    // KVdR: 24.000 · (7,3 % + 1,45 % + 3,6 %) = 2.964 €; zvE = 20.058 − 36 − 2.964 = 17.058 €
    expect(charges.health).toBeCloseTo(2_964, 9)
    expect(charges.incomeTax).toBe(862)
    expect(charges.capitalTax).toBe(0)
  })
})

describe('Günstigerprüfung', () => {
  const bridge: ChargeYear = { ...workYear, phase: 'bridge' }

  it('besteuert Kapitalerträge in der Überbrückung mit dem niedrigeren Tarif', () => {
    const without = annualCharges(settings(), bridge, 21_000)
    const withCheck = annualCharges(
      settings((s) => (s.tax = { ...s.tax, guenstigerpruefung: true })),
      bridge,
      21_000,
    )
    expect(without.capitalTax).toBeCloseTo(20_000 * 0.26375, 9)
    // Tarif auf 20.000 − 36 − KV-Beiträge
    const kv = withCheck.health
    const expected = incomeTaxTotal(20_000 - 36 - kv, params, 0).total
    expect(withCheck.capitalTax).toBeCloseTo(expected, 9)
    expect(withCheck.capitalTax).toBeLessThan(without.capitalTax)
  })

  it('gilt nicht in der Erwerbsphase', () => {
    const charges = annualCharges(
      settings((s) => (s.tax = { ...s.tax, guenstigerpruefung: true })),
      workYear,
      21_000,
    )
    expect(charges.capitalTax).toBeCloseTo(20_000 * 0.26375, 9)
  })
})

describe('Weitere Einkünfte in der Jahresabrechnung', () => {
  const income = (patch: Partial<IncomeYear>): IncomeYear => ({
    recurring: 0,
    lumpSum: 0,
    section22Recurring: 0,
    section22LumpSum: 0,
    tariffRecurring: 0,
    tariffLumpSum: 0,
    extraordinary: 0,
    insuranceHalfGain: 0,
    insuranceGain: 0,
    occupationalRecurring: 0,
    occupationalSpread: 0,
    voluntaryRecurring: 0,
    voluntaryLumpSum: 0,
    ...patch,
  })
  // ohne KV-Beiträge in der Überbrückung (PKV mit Beitrag 0)
  const noHealth = (s: ChargeSettings) =>
    (s.health = {
      bridgePhase: { type: 'pkv', monthlyPremium: 0, premiumGrowth: 0 },
      pensionPhase: { type: 'gkv' },
      kvdrEligible: true,
      paramsGrowth: 0,
    })
  const pensionYear: ChargeYear = {
    ...workYear,
    phase: 'pension',
    pensionGross: 20_000,
    pensionAllowance: 2_000,
  }
  const t = params.incomeTax

  it('Fünftelregelung (§ 34 Abs. 1 EStG), auch bei negativem übrigen zvE', () => {
    expect(tariffWithExtraordinary(20_000, 50_000, t)).toBe(
      tariffIncomeTax(20_000, t) + 5 * (tariffIncomeTax(30_000, t) - tariffIncomeTax(20_000, t)),
    )
    expect(tariffWithExtraordinary(-5_000, 50_000, t)).toBe(5 * tariffIncomeTax(9_000, t))
    expect(tariffWithExtraordinary(-60_000, 50_000, t)).toBe(0)
    expect(incomeTaxTotal(20_000, params, 0, 1, 50_000).incomeTax).toBe(
      tariffWithExtraordinary(20_000, 50_000, t),
    )
  })

  it('Werbungskosten-Pauschbetrag einmal für Rente und Riester, Steuer anteilig auf die Rente', () => {
    const year = {
      ...pensionYear,
      income: income({ recurring: 3_600, section22Recurring: 3_600, voluntaryRecurring: 3_600 }),
    }
    const c = annualCharges(settings(noHealth), year, 0)
    const expected = incomeTaxTotal(18_000 + 3_600 - 102 - 36 - c.health, params, 0).total
    expect(c.incomeTaxRecurring).toBeCloseTo(expected, 9)
    expect(c.incomeTax).toBe(c.incomeTaxRecurring)
    const pensionTaxable = 18_000 - (102 * 18_000) / 21_600
    expect(c.incomeTaxOnPension).toBeCloseTo((expected * pensionTaxable) / (21_600 - 102), 9)
  })

  it('schichtet Einmalzahlungen auf die laufenden Einkünfte', () => {
    const c = annualCharges(
      settings(noHealth),
      { ...pensionYear, income: income({ lumpSum: 50_000, section22LumpSum: 50_000 }) },
      0,
    )
    const deductions = 36 + c.health
    expect(c.incomeTaxRecurring).toBeCloseTo(
      incomeTaxTotal(18_000 - 102 - deductions, params, 0).total,
      9,
    )
    expect(c.incomeTax).toBeCloseTo(incomeTaxTotal(68_000 - 102 - deductions, params, 0).total, 9)
  })

  it('besteuert Kapitalabfindungen von Versorgungsbezügen nach der Fünftelregelung', () => {
    const c = annualCharges(
      settings(noHealth),
      { ...pensionYear, income: income({ lumpSum: 40_000, extraordinary: 40_000 }) },
      0,
    )
    const rest = 18_000 - 102 - 36 - c.health
    expect(c.incomeTax).toBeCloseTo(incomeTaxTotal(rest, params, 0, 1, 40_000).total, 9)
  })

  it('halber Versicherungsertrag: Rest des Sparer-Pauschbetrags, dann Tarif', () => {
    const c = annualCharges(
      settings(noHealth),
      { ...workYear, phase: 'bridge', income: income({ insuranceHalfGain: 15_000 }) },
      400,
    )
    expect(c.incomeTax).toBeCloseTo(incomeTaxTotal(15_000 - 600 - 36, params, 0).total, 9)
    expect(c.capitalTax).toBe(0)
  })

  it('Versicherungsertrag ohne hälftigen Ansatz: Abgeltungsteuer', () => {
    const c = annualCharges(
      settings(noHealth),
      { ...workYear, phase: 'bridge', income: income({ insuranceGain: 30_000 }) },
      0,
    )
    expect(c.capitalTax).toBeCloseTo(29_000 * 0.26375, 9)
    expect(c.incomeTax).toBe(0)
  })

  it('besteuert weitere Einkünfte in der Erwerbsphase mit 42 % zuzüglich Soli', () => {
    const c = annualCharges(
      settings(),
      { ...workYear, income: income({ lumpSum: 10_000, tariffLumpSum: 10_000 }) },
      0,
    )
    expect(c.incomeTax).toBeCloseTo(10_000 * 0.42 * 1.055, 9)
    expect(c.incomeTaxRecurring).toBe(0)
  })
})
