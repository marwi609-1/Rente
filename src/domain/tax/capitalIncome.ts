import type { LegalParams } from '../model/legalParams'

/**
 * Gesamtbelastung je Euro steuerpflichtiger Kapitalerträge (Abgeltungsteuer, Soli, Kirchensteuer).
 * Mit Kirchensteuersatz k gilt KapESt = e / (4 + k) = 25 % · e / (1 + 25 % · k)
 * (§ 32d Abs. 1 Satz 4 EStG); darauf entfallen 5,5 % Soli und k Kirchensteuer.
 * Ohne Kirchensteuer: 25 % · 1,055 = 26,375 %.
 */
export function capitalTaxRate(params: LegalParams, churchRate: number): number {
  const rate = params.capitalIncome.rate
  const withholding = rate / (1 + rate * churchRate)
  return withholding * (1 + params.solidaritySurcharge.rate + churchRate)
}

/**
 * Vorabpauschale eines thesaurierenden Fonds (§ 18 InvStG): Basisertrag = Wert zu Jahresbeginn ·
 * Basiszins · 70 %, begrenzt auf den Wertzuwachs des Jahres; bei Basiszins ≤ 0 keine Vorabpauschale.
 */
export function vorabpauschale(
  valueAtStart: number,
  valueGrowth: number,
  basiszins: number,
  params: LegalParams,
): number {
  if (basiszins <= 0 || valueAtStart <= 0) return 0
  const basisertrag = valueAtStart * basiszins * params.capitalIncome.vorabpauschaleFactor
  return Math.min(basisertrag, Math.max(0, valueGrowth))
}

export interface TaxableCapitalIncome {
  /** Erträge nach Verrechnung mit dem Verlustvortrag, vor Sparer-Pauschbetrag */
  afterLosses: number
  /** steuerpflichtig nach Sparer-Pauschbetrag */
  taxable: number
  /** Verlustvortrag nach Ablauf des Jahres */
  lossCarryForward: number
}

/**
 * Verrechnung der Kapitalerträge eines Jahres (Summe nach Teilfreistellung, Verluste negativ)
 * mit dem Verlustvortrag (§ 20 Abs. 6 EStG) und danach mit dem Sparer-Pauschbetrag (§ 20 Abs. 9).
 * Ein Verlust des Jahres erhöht den Verlustvortrag; der Vortrag wird nie negativ.
 */
export function taxableCapitalIncome(
  netIncome: number,
  lossCarryForward: number,
  saverAllowance: number,
): TaxableCapitalIncome {
  if (netIncome <= 0) {
    return { afterLosses: 0, taxable: 0, lossCarryForward: lossCarryForward - netIncome }
  }
  const used = Math.min(lossCarryForward, netIncome)
  const afterLosses = netIncome - used
  return {
    afterLosses,
    taxable: Math.max(0, afterLosses - saverAllowance),
    lossCarryForward: lossCarryForward - used,
  }
}
