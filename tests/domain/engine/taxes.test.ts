import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { runDeterministic } from '@/domain/engine/deterministic'
import { simulatePath } from '@/domain/engine/path'
import type { ReturnPath } from '@/domain/market/types'
import type { RetirementPlan } from '@/domain/model/types'
import { enginePlan } from '../../helpers/plans'

function returns(years: number, r = { equity: 0, bonds: 0, cash: 0, inflation: 0 }): ReturnPath {
  return {
    equity: new Float64Array(years).fill(r.equity),
    bonds: new Float64Array(years).fill(r.bonds),
    cash: new Float64Array(years).fill(r.cash),
    inflation: new Float64Array(years).fill(r.inflation),
  }
}

const KV_MIN = 1_318.33 * 12

/** Ruhestand ab 60 in der Überbrückung (Rente ab 67), 100 % Aktien-ETF, Einstand 50 %. */
function bridgePlan(adjust: (p: RetirementPlan) => void = () => {}): RetirementPlan {
  return enginePlan((p) => {
    p.household.currentAge = 60
    p.household.retirementAge = 60
    p.household.planningHorizonAge = 64
    p.portfolio = { totalValue: 1_000_000, costBasisShare: 0.5, lossCarryForward: 0 }
    p.spending.netConsumption = 40_000
    p.spending.minimumAcceptableConsumption = 30_000
    p.strategy = { type: 'fixed', equity: 1, cash: 0 }
    p.rebalancing = { band: 1, taxAware: false }
    p.market.equity.ter = 0
    p.tax = {
      ...p.tax,
      enabled: true,
      guenstigerpruefung: false,
      basiszins: { type: 'fixed', rate: 0 },
    }
    p.health = {
      bridgePhase: { type: 'gkv-voluntary' },
      pensionPhase: { type: 'gkv' },
      kvdrEligible: true,
      paramsGrowth: 0,
    }
    adjust(p)
  })
}

describe('Brutto-Hochrechnung', () => {
  it('nach Abzug von Steuer und KV deckt der Verkauf exakt den Netto-Bedarf', () => {
    const [year] = simulatePath(bridgePlan(), returns(5), ctx)
    // Fixpunktiteration bis auf 1 Cent genau (Spezifikation verlangt 1 €)
    expect(Math.abs(year.netConsumption - 40_000)).toBeLessThan(0.01)
    expect(
      Math.abs(year.grossSales - year.capitalTax - year.healthInsurance - 40_000),
    ).toBeLessThan(0.01)
    // Handrechnung: Gewinn = S · 50 % · (1 − 30 %), abzüglich Sparer-Pauschbetrag
    const taxable = year.grossSales * 0.5 * 0.7 - 1_000
    expect(year.capitalTax).toBeCloseTo(taxable * 0.26375, 6)
    expect(year.healthInsurance).toBeCloseTo(Math.max(KV_MIN, taxable) * 0.205, 6)
  })

  it('gilt auch mit Günstigerprüfung und KV-Beitrag an der Beitragsbemessungsgrenze', () => {
    const [year] = simulatePath(
      bridgePlan((p) => {
        p.tax.guenstigerpruefung = true
        p.spending.netConsumption = 150_000
        p.portfolio.costBasisShare = 0.2
      }),
      returns(5),
      ctx,
    )
    expect(Math.abs(year.netConsumption - 150_000)).toBeLessThan(0.01)
    expect(
      Math.abs(year.grossSales - year.capitalTax - year.healthInsurance - 150_000),
    ).toBeLessThan(0.01)
    const taxable = year.grossSales * 0.8 * 0.7 - 1_000
    expect(taxable).toBeGreaterThan(69_750)
    expect(year.healthInsurance).toBeCloseTo(69_750 * 0.205, 6)
    // Bei diesem Einkommen ist der Tarif teurer; die Günstigerprüfung wählt die Abgeltungsteuer.
    expect(year.capitalTax).toBeCloseTo(taxable * 0.26375, 6)
  })

  it('finanziert in der Rentenphase Konsum aus Netto-Rente und Verkauf', () => {
    const plan = bridgePlan((p) => {
      p.household.currentAge = 67
      p.household.retirementAge = 67
      p.household.planningHorizonAge = 70
      p.statePension = {
        ...p.statePension,
        startAge: 67,
        monthlyGrossCurrent: 2_000,
        monthlyGrossProjected: 2_000,
        adjustmentRate: 0,
      }
      p.portfolio.costBasisShare = 1
    })
    const [year] = simulatePath(plan, returns(4), ctx)
    expect(year.pensionGross).toBe(24_000)
    expect(year.healthInsurance).toBeCloseTo(24_000 * 0.1235, 9)
    // Besteuerungsanteil 2026: 84 %; zvE = 24.000 · 0,84 − 102 − 36 − 2.964 = 17.058 €
    expect(year.incomeTax).toBe(862)
    expect(year.capitalTax).toBe(0)
    expect(year.pensionNet).toBeCloseTo(24_000 - 862 - 2_964, 9)
    expect(Math.abs(year.grossSales - (40_000 - year.pensionNet))).toBeLessThan(0.01)
    expect(Math.abs(year.netConsumption - 40_000)).toBeLessThan(0.01)
  })

  it('investiert einen Überschuss der Netto-Rente über den Konsum', () => {
    const plan = bridgePlan((p) => {
      p.household.currentAge = 67
      p.household.retirementAge = 67
      p.household.planningHorizonAge = 70
      p.statePension = {
        ...p.statePension,
        startAge: 67,
        monthlyGrossCurrent: 4_000,
        monthlyGrossProjected: 4_000,
        adjustmentRate: 0,
      }
      p.spending.netConsumption = 20_000
    })
    const [year] = simulatePath(plan, returns(4), ctx)
    expect(year.grossSales).toBe(0)
    expect(year.contributions).toBeCloseTo(year.pensionNet - 20_000, 6)
    expect(year.total).toBeCloseTo(1_000_000 + year.contributions, 6)
  })

  it('vpw: Gesamtkonsum = depotfinanzierte Entnahme + Netto-Rente', () => {
    const plan = bridgePlan((p) => {
      p.household.currentAge = 67
      p.household.retirementAge = 67
      p.household.planningHorizonAge = 70
      p.statePension = {
        ...p.statePension,
        startAge: 67,
        monthlyGrossCurrent: 2_000,
        monthlyGrossProjected: 2_000,
        adjustmentRate: 0,
      }
      p.portfolio.costBasisShare = 1
      p.spending.rule = { type: 'vpw', expectedRealReturn: 0 }
    })
    const [year] = simulatePath(plan, returns(4), ctx)
    // 4 Restjahre, r = 0 → 250.000 € depotfinanziert
    expect(year.netConsumption).toBeCloseTo(250_000 + year.pensionNet, 6)
    expect(year.grossSales).toBeCloseTo(250_000, 6)
  })
})

describe('Vorabpauschale, Einstand und Nachzahlung', () => {
  it('besteuert die Vorabpauschale zum Jahresende und zahlt die Steuer durch einen Verkauf', () => {
    // Erwerbsphase ohne Sparrate: keine KV, keine Günstigerprüfung
    const plan = enginePlan((p) => {
      p.household.currentAge = 50
      p.household.retirementAge = 60
      p.portfolio = { totalValue: 100_000, costBasisShare: 1, lossCarryForward: 0 }
      p.savings.yearlyNet = 0
      p.strategy = { type: 'fixed', equity: 1, cash: 0 }
      p.rebalancing = { band: 1, taxAware: false }
      p.market.equity.ter = 0
      p.tax = {
        ...p.tax,
        enabled: true,
        saverAllowance: 0,
        basiszins: { type: 'fixed', rate: 0.032 },
      }
    })
    const [year] = simulatePath(
      plan,
      returns(46, { equity: 0.1, bonds: 0, cash: 0, inflation: 0 }),
      ctx,
    )
    // VP = min(100.000 · 3,2 % · 0,7; 10.000) = 2.240 €, steuerpflichtig 1.568 €
    // Der Einstand steigt um die VP auf 102.240 €; Gewinnanteil eines Verkaufs = 1 − 102.240/110.000
    const gainShare = 1 - 102_240 / 110_000
    const rate = 0.26375
    const tax = (1_568 * rate) / (1 - gainShare * 0.7 * rate)
    // Nachzahlung per Fixpunktiteration auf 1 Cent genau
    expect(Math.abs(year.capitalTax - tax)).toBeLessThan(0.01)
    expect(Math.abs(year.taxSales - tax)).toBeLessThan(0.01)
    expect(Math.abs(year.total - (110_000 - tax))).toBeLessThan(0.01)
  })

  it('zahlt Steuern zum Jahresende vorrangig aus Cash', () => {
    const plan = enginePlan((p) => {
      p.household.currentAge = 50
      p.household.retirementAge = 60
      p.portfolio = { totalValue: 100_000, costBasisShare: 1, lossCarryForward: 0 }
      p.savings.yearlyNet = 0
      p.strategy = { type: 'fixed', equity: 0.9, cash: 0.1 }
      p.rebalancing = { band: 1, taxAware: false }
      p.market.equity.ter = 0
      p.tax = {
        ...p.tax,
        enabled: true,
        saverAllowance: 0,
        basiszins: { type: 'fixed', rate: 0.032 },
      }
    })
    const [year] = simulatePath(
      plan,
      returns(46, { equity: 0.1, bonds: 0, cash: 0.02, inflation: 0 }),
      ctx,
    )
    // VP auf 90.000 €: 2.016 €, steuerpflichtig 1.411,20 €; Zinsen 200 €
    const tax = (2_016 * 0.7 + 200) * 0.26375
    expect(year.capitalTax).toBeCloseTo(tax, 6)
    expect(year.taxSales).toBe(0)
    expect(year.cash).toBeCloseTo(10_200 - tax, 6)
  })
})

describe('Verlustvortrag in der Engine', () => {
  it('wird mit späteren Gewinnen verrechnet und nie negativ', () => {
    const plan = bridgePlan((p) => {
      p.portfolio.lossCarryForward = 20_000
      p.household.planningHorizonAge = 62
    })
    const rows = simulatePath(plan, returns(3), ctx)
    // Gewinn je Jahr nach Teilfreistellung ≈ 40.000 · 0,5 · 0,7 = 14.000 € < 20.000 € Vortrag
    expect(rows[0].capitalTax).toBe(0)
    expect(rows[0].lossCarryForward).toBeCloseTo(20_000 - rows[0].grossSales * 0.35, 6)
    // Im zweiten Jahr ist der Vortrag aufgebraucht; danach bleibt er 0
    expect(rows[1].lossCarryForward).toBe(0)
    expect(rows[1].capitalTax).toBeGreaterThan(0)
    expect(rows.every((r) => r.lossCarryForward >= 0)).toBe(true)
  })

  it('erhöht den Vortrag bei realisierten Verlusten', () => {
    const plan = bridgePlan((p) => {
      p.portfolio.costBasisShare = 1.5
      p.household.planningHorizonAge = 61
    })
    const [year] = simulatePath(plan, returns(2), ctx)
    // Einstand 150 % des Kurswerts: Verlust 0,5 € je Euro Erlös, nach Teilfreistellung 70 %
    expect(year.capitalTax).toBe(0)
    expect(year.lossCarryForward).toBeCloseTo(year.grossSales * 0.5 * 0.7, 6)
  })
})

describe('Steuern abgeschaltet', () => {
  it('erhebt keine Steuern, wohl aber KV-Beiträge', () => {
    const [year] = simulatePath(
      bridgePlan((p) => (p.tax.enabled = false)),
      returns(5),
      ctx,
    )
    expect(year.capitalTax).toBe(0)
    expect(year.incomeTax).toBe(0)
    expect(year.healthInsurance).toBeGreaterThanOrEqual(KV_MIN * 0.205 - 1e-6)
    expect(year.grossSales).toBeCloseTo(40_000 + year.healthInsurance, 6)
  })
})

describe('Default-Szenario mit fixer Allokation', () => {
  it('rechnet mit Steuern, Rente und KV über den ganzen Horizont', () => {
    const rows = runDeterministic(
      enginePlan((p) => {
        const defaults = enginePlan.defaults()
        p.tax = defaults.tax
        p.statePension = defaults.statePension
        p.health = defaults.health
      }),
      ctx,
    )
    const bridge = rows.find((r) => r.age === 60)!
    const pension = rows.find((r) => r.age === 70)!
    expect(bridge.phase).toBe('bridge')
    expect(bridge.healthInsurance).toBeGreaterThan(0)
    expect(pension.pensionGross).toBeGreaterThan(20_000)
    expect(pension.incomeTax).toBeGreaterThan(0)
    expect(pension.pensionNet).toBeLessThan(pension.pensionGross)
    expect(rows.every((r) => Number.isFinite(r.total) && r.total >= 0)).toBe(true)
  })
})
