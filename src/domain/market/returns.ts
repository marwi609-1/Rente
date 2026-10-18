import type { Rate } from '../model/types'

export interface LognormalParams {
  /** μ_ln = ln(1+μ) − σ_ln²/2 */
  muLn: number
  /** σ_ln = √ln(1 + σ²/(1+μ)²) */
  sigmaLn: number
}

/**
 * Parameter der Lognormalverteilung von 1 + r, sodass E[r] = mean und Var[r] = vol² exakt gelten
 * (Spezifikation Abschnitt 8).
 */
export function lognormalParams(mean: Rate, vol: Rate): LognormalParams {
  if (!(mean > -1)) throw new RangeError('Die erwartete Rendite muss größer als −100 % sein.')
  if (!(vol >= 0)) throw new RangeError('Die Volatilität darf nicht negativ sein.')
  const growth = 1 + mean
  const sigmaLnSquared = Math.log1p((vol * vol) / (growth * growth))
  return {
    muLn: Math.log(growth) - sigmaLnSquared / 2,
    sigmaLn: Math.sqrt(sigmaLnSquared),
  }
}

/**
 * Geometrische Jahresrendite (Median von 1 + r) zu arithmetischem Mittel und Volatilität unter der
 * Lognormalannahme: exp(μ_ln) − 1 = (1+μ) / √(1 + σ²/(1+μ)²) − 1 ≈ μ − σ²/2.
 */
export function geometricMean(mean: Rate, vol: Rate): Rate {
  return Math.expm1(lognormalParams(mean, vol).muLn)
}

/**
 * Rendite nach laufenden Kosten. Die TER wird über das Jahr aus dem Fondsvermögen entnommen;
 * bei täglicher Abgrenzung entspricht das dem Faktor (1 − TER) auf die Bruttorendite.
 */
export function netOfCost(grossReturn: Rate, ter: Rate): Rate {
  return (1 + grossReturn) * (1 - ter) - 1
}
