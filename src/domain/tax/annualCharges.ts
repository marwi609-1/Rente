import type { Phase } from '../engine/types'
import type { LegalParams } from '../model/legalParams'
import type { HealthInsurance, TaxConfig } from '../model/types'
import { healthCharge } from '../social/health'
import { capitalTaxRate, taxableCapitalIncome } from './capitalIncome'
import { incomeTaxTotal } from './incomeTax'
import { pensionIncome } from './pensionTax'

/** Je Plan feste Größen der Jahresabrechnung. */
export interface ChargeSettings {
  params: LegalParams
  tax: TaxConfig
  health: HealthInsurance
  childless: boolean
  churchTaxRate: number
}

/** Je Jahr feste Größen der Jahresabrechnung. */
export interface ChargeYear {
  phase: Phase
  /** Jahre seit dem Startjahr */
  yearIndex: number
  pensionGross: number
  /** Rentenfreibetrag */
  pensionAllowance: number
  /** Verlustvortrag zu Jahresbeginn */
  lossCarryForward: number
  /** Faktor für die Fortschreibung der Tarifeckwerte (1 = Rechtsstand) */
  indexFactor: number
}

export interface Charges {
  /** auf Kapitalerträge entfallende Steuer (Abgeltungsteuer bzw. Mehrsteuer bei Günstigerprüfung) */
  capitalTax: number
  /** Einkommensteuer, Soli und Kirchensteuer auf die Rente */
  incomeTax: number
  /** KV/PV bzw. PKV */
  health: number
  /** davon auf die Rente entfallend */
  healthOnPension: number
  total: number
  /** Verlustvortrag nach Ablauf des Jahres */
  lossCarryForward: number
}

/**
 * Steuern und Krankenversicherung eines Jahres zu den bis dahin angefallenen Kapitalerträgen
 * (`capitalNet`: Summe nach Teilfreistellung, Verluste negativ). Weil die Abrechnung stets das
 * ganze Jahr betrachtet, ergibt die Differenz zweier Aufrufe die bei einem weiteren Ereignis
 * fällige Zahlung bzw. Erstattung – wie die laufende Verlustverrechnung einer depotführenden Bank.
 *
 * Kapitalerträge: Verrechnung mit dem Verlustvortrag, dann Sparer-Pauschbetrag, Abgeltungsteuer.
 * Rente: Besteuerungsanteil abzüglich Werbungskosten-, Sonderausgaben-Pauschbetrag und
 * Basis-Vorsorgeaufwendungen (KV/PV), Tarif nach § 32a EStG. Günstigerprüfung (§ 32d Abs. 6 EStG)
 * außerhalb der Erwerbsphase, weil dort das Erwerbseinkommen nicht modelliert ist.
 */
export function annualCharges(s: ChargeSettings, year: ChargeYear, capitalNet: number): Charges {
  const { params, tax } = s
  const capital = taxableCapitalIncome(capitalNet, year.lossCarryForward, tax.saverAllowance)
  const health = healthCharge({
    phase: year.phase,
    health: s.health,
    childless: s.childless,
    pensionGross: year.pensionGross,
    capitalBase: params.health.capitalBaseAfterSaverAllowance
      ? capital.taxable
      : capital.afterLosses,
    yearIndex: year.yearIndex,
    params,
  })

  let incomeTax = 0
  let capitalTax = 0
  if (tax.enabled) {
    const income = pensionIncome(year.pensionGross, year.pensionAllowance, params)
    const deductions = params.pensionTax.specialExpensesLumpSum + health.deductible
    const taxOn = (taxableIncome: number) =>
      incomeTaxTotal(Math.max(0, taxableIncome), params, s.churchTaxRate, year.indexFactor).total
    incomeTax = taxOn(income - deductions)
    let total = incomeTax + capital.taxable * capitalTaxRate(params, s.churchTaxRate)
    if (tax.guenstigerpruefung && year.phase !== 'work' && capital.taxable > 0) {
      total = Math.min(total, taxOn(income + capital.taxable - deductions))
    }
    capitalTax = total - incomeTax
  }

  return {
    capitalTax,
    incomeTax,
    health: health.total,
    healthOnPension: health.onPension,
    total: capitalTax + incomeTax + health.total,
    lossCarryForward: capital.lossCarryForward,
  }
}
