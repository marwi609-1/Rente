import { interpolateLinear } from '../interpolation'
import type { AgeFactor, OneOff } from '../model/types'

/**
 * Faktor des Ausgabenprofils für ein Alter: lineare Interpolation zwischen den Stützstellen,
 * vor der ersten und nach der letzten Stützstelle konstant, leeres Profil = 1.
 * Erwartet nach Alter aufsteigend sortierte Stützstellen (durch das Schema sichergestellt).
 */
export function profileFactor(profile: readonly AgeFactor[], age: number): number {
  if (profile.length === 0) return 1
  return interpolateLinear(
    profile,
    age,
    (p) => p.age,
    (p) => p.factor,
  )
}

/** Summe der Einmalausgaben in einem Alter (heutige Kaufkraft). */
export function oneOffsAt(oneOffs: readonly OneOff[], age: number): number {
  let sum = 0
  for (const o of oneOffs) if (o.age === age) sum += o.amount
  return sum
}
