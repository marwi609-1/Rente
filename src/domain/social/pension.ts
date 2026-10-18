import type { LegalParams } from '../model/legalParams'
import type { Household, StatePension } from '../model/types'
import { pensionAllowance } from '../tax/pensionTax'

/**
 * Monatlicher Anspruch bei Ausstieg in heutigen Werten (Spezifikation 10.3): lineare Näherung
 * current + (projected − current) · min(1, (retirementAge − currentAge) / (regularAge − currentAge)).
 */
export function claimAtExit(household: Household, pension: StatePension): number {
  const remaining = pension.regularAge - household.currentAge
  const share =
    remaining > 0
      ? Math.min(1, Math.max(0, (household.retirementAge - household.currentAge) / remaining))
      : 1
  return (
    pension.monthlyGrossCurrent +
    (pension.monthlyGrossProjected - pension.monthlyGrossCurrent) * share
  )
}

/**
 * Zugangsfaktor (§ 77 SGB VI): 0,3 % Abschlag je Monat vor der Regelaltersgrenze, 0,5 % Zuschlag je
 * Monat danach; dauerhaft.
 */
export function accessFactor(pension: StatePension, params: LegalParams): number {
  const months = (pension.startAge - pension.regularAge) * 12
  const perMonth =
    months < 0
      ? params.statutoryPension.earlyReductionPerMonth
      : params.statutoryPension.lateIncreasePerMonth
  return 1 + months * perMonth
}

export interface PensionSchedule {
  /** Jahresbrutto je Simulationsjahr, nominal; 0 vor Rentenbeginn und in der Erwerbsphase */
  gross: Float64Array
  /** Rentenfreibetrag, nominal fest */
  allowance: number
  /** Kalenderjahr des Rentenbeginns */
  startYear: number
  accessFactor: number
  /** Monatsrente bei Beginn in heutigen Werten, nach Zugangsfaktor */
  monthlyToday: number
}

/**
 * Rentenzahlungen über den Planungszeitraum: Anspruch bei Ausstieg × Zugangsfaktor in heutigen
 * Werten, ab heute nominal mit `adjustmentRate` fortgeschrieben. Gezahlt wird ab `startAge`, aber
 * nicht in Jahren mit Erwerbseinkommen (vor `retirementAge`).
 */
export function pensionSchedule(
  household: Household,
  pension: StatePension,
  years: number,
  params: LegalParams,
): PensionSchedule {
  const factor = accessFactor(pension, params)
  const monthlyToday = claimAtExit(household, pension) * factor
  const annualAt = (t: number) => monthlyToday * 12 * Math.pow(1 + pension.adjustmentRate, t)
  const gross = new Float64Array(years)
  for (let t = 0; t < years; t++) {
    const age = household.currentAge + t
    if (age >= pension.startAge && age >= household.retirementAge) gross[t] = annualAt(t)
  }
  const startOffset = pension.startAge - household.currentAge
  const startYear = household.startYear + startOffset
  return {
    gross,
    allowance: pensionAllowance(annualAt(startOffset), startYear, params),
    startYear,
    accessFactor: factor,
    monthlyToday,
  }
}
