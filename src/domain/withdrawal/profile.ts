import type { AgeFactor, OneOff } from '../model/types'

/**
 * Faktor des Ausgabenprofils für ein Alter: lineare Interpolation zwischen den Stützstellen,
 * vor der ersten und nach der letzten Stützstelle konstant, leeres Profil = 1.
 * Erwartet nach Alter aufsteigend sortierte Stützstellen (durch das Schema sichergestellt).
 */
export function profileFactor(profile: readonly AgeFactor[], age: number): number {
  if (profile.length === 0) return 1
  const first = profile[0]
  const last = profile[profile.length - 1]
  if (age <= first.age) return first.factor
  if (age >= last.age) return last.factor
  let i = 1
  while (profile[i].age < age) i++
  const lo = profile[i - 1]
  const hi = profile[i]
  return lo.factor + ((hi.factor - lo.factor) * (age - lo.age)) / (hi.age - lo.age)
}

/** Summe der Einmalausgaben in einem Alter (heutige Kaufkraft). */
export function oneOffsAt(oneOffs: readonly OneOff[], age: number): number {
  let sum = 0
  for (const o of oneOffs) if (o.age === age) sum += o.amount
  return sum
}
