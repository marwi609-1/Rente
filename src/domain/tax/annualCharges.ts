import type { Phase } from '../engine/types'
import type { IncomeYear } from '../income/schedule'
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
  /** weitere Einkünfte des Jahres */
  income?: IncomeYear | null
}

export interface Charges {
  /** auf Kapitalerträge entfallende Steuer (Abgeltungsteuer bzw. Mehrsteuer bei Günstigerprüfung) */
  capitalTax: number
  /** Einkommensteuer, Soli und Kirchensteuer auf Renten und weitere Einkünfte */
  incomeTax: number
  /** davon auf laufende Renten und Einkünfte, ohne Einmalzahlungen */
  incomeTaxRecurring: number
  /** davon anteilig auf die gesetzliche Rente */
  incomeTaxOnPension: number
  /** KV/PV bzw. PKV */
  health: number
  /** davon auf die Rente entfallend */
  healthOnPension: number
  /** davon auf laufende weitere Einkünfte entfallend */
  healthOnIncome: number
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
 *
 * Weitere Einkünfte in Schichten: laufende Renten und Einkünfte, darauf Einmalzahlungen (mit der
 * Fünftelregelung für Kapitalabfindungen von Versorgungsbezügen), darauf Kapitalerträge. Der
 * Werbungskosten-Pauschbetrag von 102 € gilt für alle Einkünfte nach § 22 EStG zusammen, ein Rest
 * des Sparer-Pauschbetrags mindert den hälftigen Versicherungsertrag. In der Erwerbsphase werden
 * weitere Einkünfte mangels Erwerbseinkommen mit dem Satz der Zone 4 (42 %) besteuert.
 */
export function annualCharges(s: ChargeSettings, year: ChargeYear, capitalNet: number): Charges {
  const { params, tax } = s
  const income = year.income ?? null
  const capital = taxableCapitalIncome(
    capitalNet + (income?.insuranceGain ?? 0),
    year.lossCarryForward,
    tax.saverAllowance,
  )
  // Beitragsgrundlage nur aus den Erträgen des Depots; Versicherungsleistungen zählen mit dem
  // Zahlbetrag unter den weiteren Einnahmen.
  const depotCapital =
    income && income.insuranceGain > 0
      ? taxableCapitalIncome(capitalNet, year.lossCarryForward, tax.saverAllowance)
      : capital
  const health = healthCharge({
    phase: year.phase,
    health: s.health,
    childless: s.childless,
    pensionGross: year.pensionGross,
    capitalBase: params.health.capitalBaseAfterSaverAllowance
      ? depotCapital.taxable
      : depotCapital.afterLosses,
    yearIndex: year.yearIndex,
    params,
    occupational: income ? income.occupationalRecurring + income.occupationalSpread : 0,
    occupationalRecurring: income?.occupationalRecurring ?? 0,
    voluntaryIncome: income ? income.voluntaryRecurring + income.voluntaryLumpSum : 0,
    voluntaryRecurring: income?.voluntaryRecurring ?? 0,
  })

  let incomeTax = 0
  let incomeTaxRecurring = 0
  let incomeTaxOnPension = 0
  let capitalTax = 0
  if (tax.enabled) {
    const capitalRate = capitalTaxRate(params, s.churchTaxRate)
    const deductions = params.pensionTax.specialExpensesLumpSum + health.deductible
    const taxOn = (taxableIncome: number, extraordinary = 0) =>
      incomeTaxTotal(
        extraordinary > 0 ? taxableIncome : Math.max(0, taxableIncome),
        params,
        s.churchTaxRate,
        year.indexFactor,
        extraordinary,
      ).total
    if (!income) {
      const pension = pensionIncome(year.pensionGross, year.pensionAllowance, params)
      incomeTax = taxOn(pension - deductions)
      let total = incomeTax + capital.taxable * capitalRate
      if (tax.guenstigerpruefung && year.phase !== 'work' && capital.taxable > 0) {
        total = Math.min(total, taxOn(pension + capital.taxable - deductions))
      }
      capitalTax = total - incomeTax
      incomeTaxRecurring = incomeTax
      incomeTaxOnPension = incomeTax
    } else {
      const expenses = params.pensionTax.lumpSumExpenses
      const pensionPart = Math.max(0, year.pensionGross - year.pensionAllowance)
      const section22Recurring = pensionPart + income.section22Recurring
      const section22All = section22Recurring + income.section22LumpSum
      const recurringExpenses = Math.min(expenses, section22Recurring)
      const recurring = section22Recurring - recurringExpenses + income.tariffRecurring
      const unusedAllowance = Math.max(0, tax.saverAllowance - capital.afterLosses)
      const lumpSum =
        section22All -
        Math.min(expenses, section22All) -
        (section22Recurring - recurringExpenses) +
        income.tariffLumpSum +
        Math.max(0, income.insuranceHalfGain - unusedAllowance)
      if (year.phase === 'work') {
        const rate =
          params.incomeTax.zone4.rate * (1 + params.solidaritySurcharge.rate + s.churchTaxRate)
        incomeTaxRecurring = recurring * rate
        incomeTax = (recurring + lumpSum + income.extraordinary) * rate
        capitalTax = capital.taxable * capitalRate
      } else {
        const extraordinary = income.extraordinary
        incomeTaxRecurring = taxOn(recurring - deductions)
        incomeTax =
          lumpSum > 0 || extraordinary > 0
            ? taxOn(recurring + lumpSum - deductions, extraordinary)
            : incomeTaxRecurring
        let total = incomeTax + capital.taxable * capitalRate
        if (tax.guenstigerpruefung && capital.taxable > 0) {
          total = Math.min(
            total,
            taxOn(recurring + lumpSum + capital.taxable - deductions, extraordinary),
          )
        }
        capitalTax = total - incomeTax
      }
      // anteilig nach steuerpflichtigem Betrag; der Pauschbetrag mindert § 22-Einkünfte anteilig
      const pensionTaxable =
        section22Recurring > 0
          ? pensionPart - (recurringExpenses * pensionPart) / section22Recurring
          : 0
      incomeTaxOnPension = recurring > 0 ? (incomeTaxRecurring * pensionTaxable) / recurring : 0
    }
  }

  return {
    capitalTax,
    incomeTax,
    incomeTaxRecurring,
    incomeTaxOnPension,
    health: health.total,
    healthOnPension: health.onPension,
    healthOnIncome: health.onIncome,
    total: capitalTax + incomeTax + health.total,
    lossCarryForward: capital.lossCarryForward,
  }
}
