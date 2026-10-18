import type { LegalParams } from '../model/legalParams'
import type { AdditionalIncome, RetirementPlan } from '../model/types'
import { occupationalAllowanceRow, taxableShare, yieldShare } from '../tax/pensionTax'

/**
 * Weitere Einkünfte eines Simulationsjahres, nominal. Die Beträge stehen je Vertrag fest und sind in
 * allen Pfaden gleich. Die Felder trennen, was Steuer und KV/PV unterschiedlich behandeln.
 */
export interface IncomeYear {
  /** laufende Zahlungen brutto */
  recurring: number
  /** Einmalzahlungen brutto */
  lumpSum: number
  /** steuerpflichtiger Teil nach § 22 EStG vor dem Werbungskosten-Pauschbetrag */
  section22Recurring: number
  section22LumpSum: number
  /** übrige tariflich besteuerte Einkünfte nach Frei- und Pauschbeträgen */
  tariffRecurring: number
  tariffLumpSum: number
  /** Kapitalabfindung von Versorgungsbezügen nach Freibeträgen, ermäßigt nach § 34 Abs. 1 EStG */
  extraordinary: number
  /** halber Versicherungsertrag, tariflich besteuert (§ 32d Abs. 2 Nr. 2 EStG) */
  insuranceHalfGain: number
  /** Versicherungsertrag mit Abgeltungsteuer */
  insuranceGain: number
  /** beitragspflichtige Versorgungsbezüge: laufend und verteilte Kapitalleistungen */
  occupationalRecurring: number
  occupationalSpread: number
  /** Einnahmen, die nur bei freiwillig Versicherten beitragspflichtig sind */
  voluntaryRecurring: number
  voluntaryLumpSum: number
}

function emptyYear(): IncomeYear {
  return {
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
  }
}

/**
 * Bruttozahlungen einer Einkunftsquelle je Simulationsjahr. Laufende Zahlungen: zwölf Monatsbeträge
 * je Jahr, ab dem zweiten Jahr um `growth` gesteigert; lebenslang bis zum Horizont. Beträge in
 * heutiger Kaufkraft werden mit der erwarteten Inflation umgerechnet und danach zusätzlich mit ihr
 * fortgeschrieben.
 */
export function incomePayments(
  income: AdditionalIncome,
  currentAge: number,
  years: number,
  expectedInflation: number,
): Float64Array {
  const out = new Float64Array(years)
  const start = income.startAge - currentAge
  if (start < 0 || start >= years) return out
  const real = income.basis === 'today'
  const level = real ? Math.pow(1 + expectedInflation, start) : 1
  if (income.payout === 'lump-sum') {
    out[start] = income.amount * level
    return out
  }
  const step = (1 + income.growth) * (real ? 1 + expectedInflation : 1)
  const end = income.payout === 'lifelong' ? years : Math.min(years, start + income.years)
  for (let t = start; t < end; t++) out[t] = income.amount * 12 * level * Math.pow(step, t - start)
  return out
}

/** Versorgungsbezug für den Versorgungsfreibetrag: Prozentsatz × Bemessungsgrundlage, Beginnjahr. */
interface OccupationalStart {
  allowance: number
  base: number
  startYear: number
}

/**
 * Zahlungsplan der weiteren Einkünfte über den Planungszeitraum; `null` ohne weitere Einkünfte.
 *
 * - Betriebsrente aus Direktversicherung, Pensionskasse, Pensionsfonds, Riester und
 *   Altersvorsorgedepot: voll steuerpflichtig (§ 22 Nr. 5 Satz 1 EStG).
 * - Direktzusage, Unterstützungskasse: Versorgungsbezüge (§ 19 EStG) ab 63 mit Versorgungsfreibetrag
 *   und Zuschlag nach dem Jahr des Versorgungsbeginns sowie 102 € Pauschbetrag, vorher Arbeitslohn
 *   mit 1.230 € Pauschbetrag; Kapitalabfindungen nach der Fünftelregelung.
 * - Basisrente: Besteuerungsanteil nach dem Jahr des Beginns, Rentenfreibetrag aus dem ersten Jahr.
 * - Private Renten- und Lebensversicherung: lebenslange Rente mit dem Ertragsanteil; Kapital- oder
 *   Ratenzahlung mit dem Unterschiedsbetrag aus Zahlung und anteiligen Beiträgen (§ 20 Abs. 1 Nr. 6
 *   EStG), zur Hälfte tariflich nach 60 bzw. 62 Jahren und 12 Jahren Laufzeit, sonst mit
 *   Abgeltungsteuer; Verträge vor 2005 steuerfrei.
 * - KV/PV: Betriebsrenten sind Versorgungsbezüge, Kapitalleistungen zählen zehn Jahre lang mit einem
 *   Zehntel (§ 229 Abs. 1 Satz 3 SGB V); die übrigen Zahlungen zählen nur bei freiwillig Versicherten.
 */
export function additionalIncomeSchedule(
  plan: RetirementPlan,
  years: number,
  params: LegalParams,
  expectedInflation: number,
): IncomeYear[] | null {
  if (plan.additionalIncome.length === 0) return null
  const { currentAge, startYear } = plan.household
  const out = Array.from({ length: years }, emptyYear)
  const occupational = Array.from({ length: years }, () => ({
    recurring: 0,
    lumpSum: 0,
    starts: [] as OccupationalStart[],
  }))
  const { minimumAge } = params.occupationalPension
  const spreadYears = params.health.lumpSumSpreadYears

  for (const income of plan.additionalIncome) {
    const pay = incomePayments(income, currentAge, years, expectedInflation)
    const lump = income.payout === 'lump-sum'
    const start = income.startAge - currentAge
    if (start < 0 || start >= years) continue
    for (let t = start; t < years; t++) {
      if (pay[t] === 0) continue
      if (lump) out[t].lumpSum += pay[t]
      else out[t].recurring += pay[t]
    }

    switch (income.product) {
      case 'bav-insurance':
      case 'bav-direct': {
        for (let t = start; t < years; t++) {
          if (pay[t] === 0) continue
          if (lump) {
            for (let k = t; k < Math.min(years, t + spreadYears); k++) {
              out[k].occupationalSpread += pay[t] / spreadYears
            }
          } else {
            out[t].occupationalRecurring += pay[t]
          }
          if (income.product === 'bav-insurance') {
            if (lump) out[t].section22LumpSum += pay[t]
            else out[t].section22Recurring += pay[t]
          }
        }
        if (income.product === 'bav-direct') {
          // Versorgungsbeginn: erstes Zahlungsjahr ab dem Mindestalter
          const begin = Math.max(start, minimumAge - currentAge)
          const base = begin < years ? pay[begin] : 0
          const row = occupationalAllowanceRow(startYear + begin, params)
          const entry = { allowance: row.share * base, base, startYear: startYear + begin }
          for (let t = start; t < years; t++) {
            if (pay[t] === 0) continue
            const target = occupational[t]
            if (lump) target.lumpSum += pay[t]
            else target.recurring += pay[t]
            if (t >= begin) target.starts.push(entry)
          }
        }
        break
      }
      case 'riester':
      case 'avd':
        for (let t = start; t < years; t++) {
          if (lump) {
            out[t].section22LumpSum += pay[t]
            out[t].voluntaryLumpSum += pay[t]
          } else {
            out[t].section22Recurring += pay[t]
            out[t].voluntaryRecurring += pay[t]
          }
        }
        break
      case 'basis': {
        // Rentenfreibetrag aus dem Betrag des ersten Jahres, danach nominal fest
        const free = (1 - taxableShare(startYear + start, params)) * pay[start]
        for (let t = start; t < years; t++) {
          if (pay[t] === 0) continue
          out[t].section22Recurring += Math.max(0, pay[t] - free)
          out[t].voluntaryRecurring += pay[t]
        }
        break
      }
      case 'private-annuity':
      case 'life-insurance':
        addInsurance(income, pay, out, currentAge, startYear, params)
        break
      case 'other-taxable':
        for (let t = start; t < years; t++) {
          if (lump) {
            out[t].tariffLumpSum += pay[t]
            out[t].voluntaryLumpSum += pay[t]
          } else {
            out[t].tariffRecurring += pay[t]
            out[t].voluntaryRecurring += pay[t]
          }
        }
        break
      case 'other-tax-free':
        break
    }
  }

  // Versorgungsbezüge: Frei- und Pauschbeträge zuerst auf laufende Zahlungen, der Rest der
  // Kapitalabfindung wird ermäßigt besteuert.
  const op = params.occupationalPension
  for (let t = 0; t < years; t++) {
    const { recurring, lumpSum, starts } = occupational[t]
    const gross = recurring + lumpSum
    if (gross <= 0) continue
    let deduction: number
    if (currentAge + t >= minimumAge && starts.length > 0) {
      // § 19 Abs. 2 Satz 6 EStG: Höchstbetrag und Zuschlag nach dem Jahr des ersten Bezugs
      const first = starts.reduce((a, b) => (b.startYear < a.startYear ? b : a))
      const row = occupationalAllowanceRow(first.startYear, params)
      const allowance = Math.min(
        row.cap,
        starts.reduce((sum, s) => sum + s.allowance, 0),
      )
      const base = starts.reduce((sum, s) => sum + s.base, 0)
      const surcharge = Math.min(row.surcharge, Math.max(0, base - allowance))
      deduction = allowance + surcharge + op.lumpSumExpenses
    } else {
      deduction = op.employeeLumpSum
    }
    const fromRecurring = Math.min(recurring, deduction)
    out[t].tariffRecurring += recurring - fromRecurring
    out[t].extraordinary += Math.max(0, lumpSum - (deduction - fromRecurring))
  }
  return out
}

/** Private Renten- und Lebensversicherung: Ertragsanteil oder Unterschiedsbetrag. */
function addInsurance(
  income: AdditionalIncome,
  pay: Float64Array,
  out: IncomeYear[],
  currentAge: number,
  startYear: number,
  params: LegalParams,
): void {
  const years = pay.length
  const start = income.startAge - currentAge
  const lump = income.payout === 'lump-sum'
  for (let t = start; t < years; t++) {
    if (lump) out[t].voluntaryLumpSum += pay[t]
    else out[t].voluntaryRecurring += pay[t]
  }
  if (income.payout === 'lifelong') {
    const share = yieldShare(income.startAge, params)
    for (let t = start; t < years; t++) out[t].section22Recurring += pay[t] * share
    return
  }
  const li = params.lifeInsurance
  if (income.contractYear < li.taxableFromContractYear) return
  // Ertrag = Zahlung abzüglich des auf sie entfallenden Anteils der Beiträge
  let total = 0
  for (let t = start; t < years; t++) total += pay[t]
  if (total <= 0) return
  const gainShare =
    Math.max(0, 1 - income.contributions / total) * (income.fundLinked ? 1 - li.fundExemption : 1)
  const halfAge =
    income.contractYear >= li.laterAgeFromContractYear ? li.halfIncomeAgeLater : li.halfIncomeAge
  for (let t = start; t < years; t++) {
    const gain = pay[t] * gainShare
    if (gain <= 0) continue
    const half =
      currentAge + t >= halfAge && startYear + t - income.contractYear >= li.minimumTermYears
    if (half) out[t].insuranceHalfGain += gain / 2
    else out[t].insuranceGain += gain
  }
}
