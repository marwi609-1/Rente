import { describe, expect, it } from 'vitest'

import { deterministicReturnPath } from '@/domain/market/deterministic'
import { geometricMean, lognormalParams, netOfCost } from '@/domain/market/returns'
import { createDefaultPlan } from '@/domain/model/defaults'

describe('lognormalParams', () => {
  it('reproduziert Erwartungswert und Varianz exakt', () => {
    const mean = 0.08
    const vol = 0.15
    const { muLn, sigmaLn } = lognormalParams(mean, vol)
    const expectation = Math.exp(muLn + (sigmaLn * sigmaLn) / 2) - 1
    const variance = (Math.exp(sigmaLn * sigmaLn) - 1) * Math.exp(2 * muLn + sigmaLn * sigmaLn)
    expect(expectation).toBeCloseTo(mean, 14)
    expect(Math.sqrt(variance)).toBeCloseTo(vol, 14)
  })

  it('lehnt Erwartungswerte ≤ −100 % und negative Volatilität ab', () => {
    expect(() => lognormalParams(-1, 0.1)).toThrow(RangeError)
    expect(() => lognormalParams(0.05, -0.1)).toThrow(RangeError)
  })
})

describe('geometricMean', () => {
  it('entspricht bei σ = 0 dem Erwartungswert', () => {
    expect(geometricMean(0.05, 0)).toBeCloseTo(0.05, 15)
  })

  it('liegt nahe μ − σ²/2 und darunter bei μ', () => {
    const g = geometricMean(0.08, 0.15)
    // exakt: 1,08 / √(1 + 0,0225/1,1664) − 1
    expect(g).toBeCloseTo(1.08 / Math.sqrt(1 + 0.0225 / 1.1664) - 1, 14)
    expect(Math.abs(g - (0.08 - 0.15 ** 2 / 2))).toBeLessThan(0.002)
    expect(g).toBeLessThan(0.08)
  })
})

describe('netOfCost', () => {
  it('zieht die TER multiplikativ ab', () => {
    expect(netOfCost(0.1, 0.002)).toBeCloseTo(1.1 * 0.998 - 1, 15)
    expect(netOfCost(-0.2, 0.01)).toBeCloseTo(0.8 * 0.99 - 1, 15)
    expect(netOfCost(0.05, 0)).toBeCloseTo(0.05, 15)
  })
})

describe('deterministicReturnPath', () => {
  it('liefert je Reihe jährlich die geometrische Rendite', () => {
    const market = createDefaultPlan(2026).market
    const path = deterministicReturnPath(market, 3)
    expect(Array.from(path.equity)).toEqual(new Array(3).fill(geometricMean(0.08, 0.15)))
    expect(Array.from(path.bonds)).toEqual(new Array(3).fill(geometricMean(0.03, 0.05)))
    expect(Array.from(path.cash)).toEqual(new Array(3).fill(geometricMean(0.02, 0.01)))
    expect(Array.from(path.inflation)).toEqual(new Array(3).fill(geometricMean(0.02, 0.015)))
  })
})
