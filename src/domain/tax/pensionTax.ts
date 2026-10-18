import type { LegalParams } from '../model/legalParams'

/**
 * Besteuerungsanteil der gesetzlichen Rente nach dem Jahr des Rentenbeginns (§ 22 Nr. 1 Satz 3
 * Buchst. a Doppelbuchst. aa EStG); vor 2005 gilt der Wert für 2005, nach dem letzten Tabellenjahr 100 %.
 */
export function taxableShare(startYear: number, params: LegalParams): number {
  const { firstYear, shares } = params.pensionTax.taxableShare
  const index = Math.min(Math.max(startYear - firstYear, 0), shares.length - 1)
  return shares[index]
}

/**
 * Steuerfreier Teil der Rente (Rentenfreibetrag): (1 − Besteuerungsanteil) · Jahresbetrag des
 * ersten vollen Bezugsjahres; danach nominal fest.
 */
export function pensionAllowance(
  firstFullYearGross: number,
  startYear: number,
  params: LegalParams,
) {
  return (1 - taxableShare(startYear, params)) * firstFullYearGross
}

/**
 * Einkünfte aus der Rente: steuerpflichtiger Teil abzüglich Werbungskosten-Pauschbetrag
 * (höchstens bis zur Höhe des steuerpflichtigen Teils, § 9a Satz 2 EStG).
 */
export function pensionIncome(gross: number, allowance: number, params: LegalParams): number {
  const taxablePart = Math.max(0, gross - allowance)
  return taxablePart - Math.min(params.pensionTax.lumpSumExpenses, taxablePart)
}

/**
 * Ertragsanteil einer privaten Leibrente nach dem bei Beginn vollendeten Lebensjahr (§ 22 Nr. 1
 * Satz 3 Buchst. a Doppelbuchst. bb EStG).
 */
export function yieldShare(startAge: number, params: LegalParams): number {
  let share = params.pensionTax.yieldShare[0].share
  for (const step of params.pensionTax.yieldShare) if (startAge >= step.fromAge) share = step.share
  return share
}

/**
 * Versorgungsfreibetrag (Prozentsatz, Höchstbetrag) und Zuschlag nach dem Jahr des
 * Versorgungsbeginns (§ 19 Abs. 2 Satz 3 EStG); vor dem ersten Tabellenjahr gilt dessen Zeile, nach
 * dem letzten die letzte.
 */
export function occupationalAllowanceRow(startYear: number, params: LegalParams) {
  const { firstYear, rows } = params.occupationalPension.allowance
  return rows[Math.min(Math.max(startYear - firstYear, 0), rows.length - 1)]
}
