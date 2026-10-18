import type { IncomeTaxTariff, LegalParams } from '../model/legalParams'

/**
 * Tarifliche Einkommensteuer nach § 32a Abs. 1 EStG (Grundtarif): zvE auf volle Euro abgerundet,
 * Steuer auf volle Euro abgerundet.
 */
export function tariffIncomeTax(taxableIncome: number, t: IncomeTaxTariff): number {
  const x = Math.floor(Math.max(0, taxableIncome))
  let tax: number
  if (x <= t.basicAllowance) {
    tax = 0
  } else if (x <= t.zone2End) {
    const y = (x - t.basicAllowance) / 10_000
    tax = (t.zone2.a * y + t.zone2.b) * y
  } else if (x <= t.zone3End) {
    const z = (x - t.zone2End) / 10_000
    tax = (t.zone3.a * z + t.zone3.b) * z + t.zone3.c
  } else if (x <= t.zone4End) {
    tax = t.zone4.rate * x - t.zone4.deduction
  } else {
    tax = t.zone5.rate * x - t.zone5.deduction
  }
  return Math.floor(tax)
}

/**
 * Solidaritätszuschlag auf die tarifliche Einkommensteuer (§§ 3, 4 SolZG): 5,5 %, nur oberhalb der
 * Freigrenze, in der Milderungszone höchstens 11,9 % des Betrags über der Freigrenze; auf Cent
 * abgerundet.
 */
export function solidaritySurcharge(
  incomeTax: number,
  soli: LegalParams['solidaritySurcharge'],
): number {
  if (incomeTax <= soli.exemptionLimit) return 0
  const full = soli.rate * incomeTax
  const phaseIn = soli.phaseInRate * (incomeTax - soli.exemptionLimit)
  // Bruchteile eines Cents bleiben außer Ansatz; der Zuschlag gleicht Gleitkommafehler aus.
  return Math.floor(Math.min(full, phaseIn) * 100 + 1e-6) / 100
}

export interface IncomeTaxResult {
  incomeTax: number
  solidaritySurcharge: number
  churchTax: number
  total: number
}

/**
 * Einkommensteuer mit Solidaritätszuschlag und Kirchensteuer (Satz × Einkommensteuer).
 * `indexFactor` > 1 schreibt alle Tarifeckwerte und die Soli-Freigrenze proportional fort:
 * Steuer(zvE) = indexFactor · Steuer₂₀₂₆(zvE / indexFactor).
 */
export function incomeTaxTotal(
  taxableIncome: number,
  params: LegalParams,
  churchRate: number,
  indexFactor = 1,
): IncomeTaxResult {
  const base = tariffIncomeTax(taxableIncome / indexFactor, params.incomeTax)
  const soli = solidaritySurcharge(base, params.solidaritySurcharge)
  const incomeTax = base * indexFactor
  const solidarity = soli * indexFactor
  const churchTax = churchRate * incomeTax
  return {
    incomeTax,
    solidaritySurcharge: solidarity,
    churchTax,
    total: incomeTax + solidarity + churchTax,
  }
}
