import { describe, expect, it } from 'vitest'

import { NormalSampler, sampleChiSquare, sampleGamma } from '@/domain/random/distributions'
import { Xoshiro128, pathSeed, splitMix32 } from '@/domain/random/xoshiro'
import { kurtosis, mean, variance } from '../../helpers/stats'

describe('xoshiro128**', () => {
  it('liefert den Referenzvektor für den Zustand (1, 2, 3, 4)', () => {
    const rng = new Xoshiro128([1, 2, 3, 4])
    const values = Array.from({ length: 10 }, () => rng.nextUint32())
    expect(values).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ])
  })

  it('ist bei gleichem Seed reproduzierbar und bei anderem Seed verschieden', () => {
    const draw = (seed: number) => {
      const rng = Xoshiro128.fromSeed(seed)
      return Array.from({ length: 5 }, () => rng.nextUint32())
    }
    expect(draw(42)).toEqual(draw(42))
    expect(draw(42)).not.toEqual(draw(43))
  })

  it('ersetzt den unzulässigen Nullzustand', () => {
    const rng = new Xoshiro128([0, 0, 0, 0])
    const values = Array.from({ length: 4 }, () => rng.nextUint32())
    expect(values.some((v) => v !== 0)).toBe(true)
  })

  it('erzeugt Gleitkommazahlen im offenen Intervall (0, 1) mit Mittel ½ und Varianz 1/12', () => {
    const rng = Xoshiro128.fromSeed(7)
    const values = Float64Array.from({ length: 200_000 }, () => rng.nextFloat())
    expect(values.reduce((a, b) => Math.min(a, b))).toBeGreaterThan(0)
    expect(values.reduce((a, b) => Math.max(a, b))).toBeLessThan(1)
    expect(Math.abs(mean(values) - 0.5)).toBeLessThan(3 * Math.sqrt(1 / 12 / values.length))
    expect(variance(values)).toBeCloseTo(1 / 12, 3)
  })
})

describe('Seed-Ableitung', () => {
  it('ist deterministisch und je Pfad verschieden', () => {
    expect(pathSeed(42, 7)).toBe(pathSeed(42, 7))
    const seeds = new Set(Array.from({ length: 10_000 }, (_, p) => pathSeed(42, p)))
    expect(seeds.size).toBe(10_000)
  })

  it('leitet den Pfad-Seed über SplitMix32 aus seed + Pfadindex ab', () => {
    expect(pathSeed(40, 2)).toBe(splitMix32(42)())
    expect(pathSeed(0xffff_ffff, 1)).toBe(splitMix32(0)())
  })
})

describe('Verteilungen', () => {
  it('Box-Muller liefert Standardnormalverteilung', () => {
    const normal = new NormalSampler(Xoshiro128.fromSeed(1))
    const values = Float64Array.from({ length: 200_000 }, () => normal.next())
    expect(Math.abs(mean(values))).toBeLessThan(3 / Math.sqrt(values.length))
    expect(variance(values)).toBeCloseTo(1, 1)
    expect(kurtosis(values)).toBeGreaterThan(2.9)
    expect(kurtosis(values)).toBeLessThan(3.1)
  })

  it('Chi-Quadrat hat Mittel ν und Varianz 2ν', () => {
    const rng = Xoshiro128.fromSeed(2)
    const normal = new NormalSampler(rng)
    for (const df of [3, 5, 12.5]) {
      const values = Float64Array.from({ length: 100_000 }, () => sampleChiSquare(df, normal, rng))
      expect(Math.abs(mean(values) - df)).toBeLessThan(3 * Math.sqrt((2 * df) / values.length))
      expect(variance(values) / (2 * df)).toBeCloseTo(1, 1)
    }
  })

  it('Gamma mit Formparameter < 1 hat das richtige Mittel', () => {
    const rng = Xoshiro128.fromSeed(3)
    const normal = new NormalSampler(rng)
    const values = Float64Array.from({ length: 100_000 }, () => sampleGamma(0.4, normal, rng))
    expect(Math.abs(mean(values) - 0.4)).toBeLessThan(3 * Math.sqrt(0.4 / values.length))
  })

  it('lehnt einen nicht positiven Formparameter ab', () => {
    const rng = Xoshiro128.fromSeed(4)
    expect(() => sampleGamma(0, new NormalSampler(rng), rng)).toThrow(RangeError)
  })
})
