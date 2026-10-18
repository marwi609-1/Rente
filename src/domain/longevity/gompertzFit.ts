import { gompertzSurvival } from './longevity'

export interface GompertzFit {
  modalAge: number
  dispersion: number
}

/**
 * Passt Modalalter m und Dispersion b der Gompertz-Verteilung an eine Überlebenskurve an:
 * kleinste Quadrate auf ln S(x | a) für x = a + 1 … toAge, mit S aus den einjährigen
 * Sterbewahrscheinlichkeiten `qx` ab Alter `fromAge` (Gitter grob, dann fein).
 */
export function fitGompertz(qx: readonly number[], fromAge: number, toAge = 95): GompertzFit {
  const target: { age: number; logS: number }[] = []
  let logS = 0
  for (let k = 0; k < qx.length && fromAge + k + 1 <= toAge; k++) {
    logS += Math.log(1 - qx[k])
    target.push({ age: fromAge + k + 1, logS })
  }
  if (target.length === 0)
    throw new RangeError('Für die Anpassung fehlen Sterbewahrscheinlichkeiten.')
  const error = (m: number, b: number) => {
    let sum = 0
    for (const { age, logS: y } of target) {
      const d = Math.log(gompertzSurvival(fromAge, age, m, b)) - y
      sum += d * d
    }
    return sum
  }
  let best = { m: 85, b: 10, e: Number.POSITIVE_INFINITY }
  const search = (m0: number, m1: number, b0: number, b1: number, step: number) => {
    for (let m = m0; m <= m1 + 1e-9; m += step) {
      for (let b = Math.max(1, b0); b <= b1 + 1e-9; b += step) {
        const e = error(m, b)
        if (e < best.e) best = { m, b, e }
      }
    }
  }
  search(60, 115, 2, 20, 0.5)
  search(best.m - 0.5, best.m + 0.5, best.b - 0.5, best.b + 0.5, 0.05)
  return { modalAge: Math.round(best.m * 10) / 10, dispersion: Math.round(best.b * 10) / 10 }
}
