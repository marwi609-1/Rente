import { describe, expect, it } from 'vitest'

import { mortalityDe } from '@/data/mortality'
import {
  createLongevityModel,
  gompertzDeathAge,
  gompertzSurvival,
} from '@/domain/longevity/longevity'
import { createDefaultPlan } from '@/domain/model/defaults'
import type { Household } from '@/domain/model/types'

function household(patch: Partial<Household> = {}): Household {
  return { ...createDefaultPlan(2026).household, ...patch }
}

function drawAges(h: Household, n: number, seed = 42) {
  const model = createLongevityModel(h, seed, mortalityDe)
  return Array.from({ length: n }, (_, p) => model.deathAge(p))
}

function mode(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}

describe('Gompertz', () => {
  it('Überlebenskurve ist monoton fallend von 1 gegen 0', () => {
    let previous = gompertzSurvival(52, 52, 88, 10)
    expect(previous).toBe(1)
    for (let age = 53; age <= 120; age++) {
      const s = gompertzSurvival(52, age, 88, 10)
      expect(s).toBeLessThan(previous)
      previous = s
    }
    expect(previous).toBeLessThan(1e-6)
  })

  it('Inversion trifft die Überlebenskurve', () => {
    for (const u of [0.9, 0.5, 0.1, 0.01]) {
      const age = gompertzDeathAge(52, 88, 10, u)
      expect(gompertzSurvival(52, age, 88, 10)).toBeCloseTo(u, 12)
    }
  })

  it('das häufigste gezogene Sterbealter liegt beim Modalalter', () => {
    const ages = drawAges(household(), 200_000)
    // ganzzahliges Alter im Todesjahr; das Dichtemaximum liegt bei m, der Jahresbucket also bei m − 1 oder m
    expect(Math.abs(mode(ages) - 88)).toBeLessThanOrEqual(1)
    expect(Math.min(...ages.slice(0, 1_000))).toBeGreaterThanOrEqual(52)
  })

  it('Anteil der Pfade, die ein Alter erleben, entspricht der Überlebenskurve', () => {
    const h = household()
    const model = createLongevityModel(h, 42)
    const ages = drawAges(h, 100_000)
    for (const age of [70, 85, 95]) {
      const share = ages.filter((a) => a >= age).length / ages.length
      const p = model.survival(age)
      expect(Math.abs(share - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / ages.length))
    }
  })
})

describe('Sterbetafel', () => {
  const h = household({ longevity: { type: 'table' } })

  it('Überlebenskurve ist monoton fallend und endet spätestens mit 100', () => {
    const model = createLongevityModel(h, 42, mortalityDe)
    let previous = 1
    for (let age = 52; age <= 101; age++) {
      const s = model.survival(age)
      expect(s).toBeLessThanOrEqual(previous)
      previous = s
    }
    expect(model.survival(101)).toBe(0)
    expect(model.survival(52)).toBe(1)
  })

  it('gezogene Sterbealter folgen der Tafel', () => {
    const model = createLongevityModel(h, 42, mortalityDe)
    const ages = drawAges(h, 100_000)
    expect(Math.max(...ages.slice(0, 10_000))).toBeLessThanOrEqual(100)
    for (const age of [70, 85, 95]) {
      const share = ages.filter((a) => a >= age).length / ages.length
      const p = model.survival(age)
      expect(Math.abs(share - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / ages.length))
    }
  })

  it('nutzt Geschlecht und Geburtsjahrgang', () => {
    const men = createLongevityModel(h, 42, mortalityDe)
    const women = createLongevityModel({ ...h, sex: 'w' }, 42, mortalityDe)
    expect(women.survival(90)).toBeGreaterThan(men.survival(90))
  })

  it('lehnt nicht abgedeckte Jahrgänge und fehlende Tafeln ab', () => {
    expect(() => createLongevityModel({ ...h, currentAge: 10 }, 42, mortalityDe)).toThrow(
      RangeError,
    )
    expect(() => createLongevityModel({ ...h, currentAge: 110 }, 42, mortalityDe)).toThrow(
      RangeError,
    )
    expect(() => createLongevityModel(h, 42)).toThrow(RangeError)
  })
})

describe('Zufallsstrom', () => {
  it('ist reproduzierbar, je Pfad verschieden und hängt vom Seed ab', () => {
    expect(drawAges(household(), 50)).toEqual(drawAges(household(), 50))
    expect(new Set(drawAges(household(), 50)).size).toBeGreaterThan(10)
    expect(drawAges(household(), 50, 43)).not.toEqual(drawAges(household(), 50))
  })

  it('fester Horizont: kein Sterbealter, Überleben 1', () => {
    const model = createLongevityModel(household({ longevity: { type: 'fixed' } }), 42)
    expect(model.deathAge(0)).toBe(Number.POSITIVE_INFINITY)
    expect(model.survival(120)).toBe(1)
  })
})
