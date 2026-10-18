import type { Household } from '../model/types'
import { Xoshiro128, pathSeed, splitMix32 } from '../random/xoshiro'
import { cohortQx, type MortalityTable } from './mortalityTable'

/** Unterscheidet den Zufallsstrom der Sterblichkeit von dem der Marktrenditen. */
const LONGEVITY_STREAM = 0x6c8e9cf5

/**
 * Überlebenswahrscheinlichkeit nach Gompertz mit Modalalter m und Dispersion b (Sterbeintensität
 * μ(x) = exp((x − m)/b) / b): S(x | a) = exp(exp((a − m)/b) · (1 − exp((x − a)/b))).
 */
export function gompertzSurvival(fromAge: number, toAge: number, m: number, b: number): number {
  if (toAge <= fromAge) return 1
  return Math.exp(Math.exp((fromAge - m) / b) * (1 - Math.exp((toAge - fromAge) / b)))
}

/** Stetiges Sterbealter nach Gompertz durch Inversion von S(x | a) = u. */
export function gompertzDeathAge(fromAge: number, m: number, b: number, u: number): number {
  return fromAge + b * Math.log(1 - Math.log(u) * Math.exp((m - fromAge) / b))
}

export interface LongevityModel {
  /** P(der Haushalt erlebt den Beginn des Jahres, in dem er `age` wird), ausgehend vom aktuellen Alter */
  survival(age: number): number
  /**
   * Sterbealter des Pfades: das Alter im Todesjahr; alle Jahre bis einschließlich dieses Alters werden
   * erlebt. Beim festen Horizont +∞.
   */
  deathAge(pathIndex: number): number
}

/** Zufallszahl des Pfades für das Sterbealter, unabhängig vom Strom der Marktrenditen. */
function longevityUniform(seed: number, pathIndex: number): number {
  const streamSeed = splitMix32((pathSeed(seed, pathIndex) ^ LONGEVITY_STREAM) >>> 0)()
  return Xoshiro128.fromSeed(streamSeed).nextFloat()
}

/** Sterbetafel: Überlebenskurve aus q_x und Ziehung über die inverse Verteilungsfunktion. */
function tableModel(household: Household, table: MortalityTable, seed: number): LongevityModel {
  const a = household.currentAge
  const qx = cohortQx(table, household.sex, household.startYear - a, a)
  // survivalFrom[k] = P(erlebt Alter a + k); nach dem letzten Tabellenalter gilt q = 1
  const survivalFrom = [1]
  for (const q of qx) survivalFrom.push(survivalFrom[survivalFrom.length - 1] * (1 - q))
  survivalFrom.push(0)
  return {
    survival(age) {
      const k = age - a
      if (k <= 0) return 1
      return k < survivalFrom.length ? survivalFrom[k] : 0
    },
    deathAge(pathIndex) {
      const u = longevityUniform(seed, pathIndex)
      // erstes k mit P(erlebt a + k + 1) < u ≤ P(erlebt a + k)
      let k = 0
      while (survivalFrom[k + 1] >= u) k++
      return a + k
    },
  }
}

export function createLongevityModel(
  household: Household,
  seed: number,
  mortality?: MortalityTable,
): LongevityModel {
  const { longevity, currentAge } = household
  switch (longevity.type) {
    case 'fixed':
      return { survival: () => 1, deathAge: () => Number.POSITIVE_INFINITY }
    case 'gompertz': {
      const { modalAge: m, dispersion: b } = longevity
      return {
        survival: (age) => gompertzSurvival(currentAge, age, m, b),
        deathAge: (pathIndex) =>
          Math.floor(gompertzDeathAge(currentAge, m, b, longevityUniform(seed, pathIndex))),
      }
    }
    case 'table':
      if (!mortality) throw new RangeError('Die Sterbetafel ist nicht verfügbar.')
      return tableModel(household, mortality, seed)
  }
}
