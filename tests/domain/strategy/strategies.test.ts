import { describe, expect, it } from 'vitest'

import type { BondTentStrategy, BucketStrategy, GlidepathStrategy } from '@/domain/model/types'
import { allocationPolicy, bondTentEquity, glidepathEquity } from '@/domain/strategy/allocation'
import {
  bucketAllocation,
  bucketTargets,
  refillPlan,
  sequentialSale,
} from '@/domain/strategy/bucket'

const glidepath: GlidepathStrategy = {
  type: 'glidepath',
  points: [
    { age: 57, equity: 0.55 },
    { age: 62, equity: 0.6 },
    { age: 67, equity: 0.65 },
    { age: 72, equity: 0.7 },
  ],
  cash: 0.05,
}

const tent: BondTentStrategy = {
  type: 'bond-tent',
  startAge: 50,
  startEquity: 0.7,
  peakAge: 60,
  peakEquity: 0.4,
  endAge: 75,
  endEquity: 0.7,
  cash: 0.05,
}

describe('Glidepath', () => {
  it('interpoliert linear zwischen den Punkten', () => {
    expect(glidepathEquity(glidepath, 59.5)).toBeCloseTo(0.575, 12)
    expect(glidepathEquity(glidepath, 64)).toBeCloseTo(0.62, 12)
    expect(glidepathEquity(glidepath, 62)).toBe(0.6)
  })

  it('ist vor dem ersten und nach dem letzten Punkt konstant', () => {
    expect(glidepathEquity(glidepath, 40)).toBe(0.55)
    expect(glidepathEquity(glidepath, 57)).toBe(0.55)
    expect(glidepathEquity(glidepath, 72)).toBe(0.7)
    expect(glidepathEquity(glidepath, 95)).toBe(0.7)
  })

  it('setzt Cash fest und den Rest in Anleihen', () => {
    const allocation = allocationPolicy(glidepath)(64)
    expect(allocation.cash).toBe(0.05)
    expect(allocation.bonds).toBeCloseTo(1 - 0.62 - 0.05, 12)
  })

  it('funktioniert mit einem einzigen Punkt', () => {
    const single: GlidepathStrategy = {
      type: 'glidepath',
      points: [{ age: 60, equity: 0.5 }],
      cash: 0,
    }
    expect(glidepathEquity(single, 30)).toBe(0.5)
    expect(glidepathEquity(single, 90)).toBe(0.5)
  })
})

describe('Bond Tent', () => {
  it('hat das Minimum der Aktienquote beim Tiefpunktalter', () => {
    const minimum = bondTentEquity(tent, tent.peakAge)
    expect(minimum).toBe(0.4)
    const others = Array.from({ length: 56 }, (_, i) => 40 + i).filter((a) => a !== tent.peakAge)
    for (const age of others) expect(bondTentEquity(tent, age)).toBeGreaterThan(minimum)
  })

  it('nimmt das Minimum auch an, wenn Start- und Tiefpunktalter zusammenfallen', () => {
    const immediate: BondTentStrategy = { ...tent, startAge: 60, peakAge: 60 }
    expect(bondTentEquity(immediate, 60)).toBe(0.4)
    expect(bondTentEquity(immediate, 59)).toBe(0.7)
    expect(bondTentEquity(immediate, 67.5)).toBeCloseTo(0.55, 12)
  })

  it('verläuft stückweise linear und ist an den Rändern konstant', () => {
    expect(bondTentEquity(tent, 55)).toBeCloseTo(0.55, 12)
    expect(bondTentEquity(tent, 67.5)).toBeCloseTo(0.55, 12)
    expect(bondTentEquity(tent, 45)).toBe(0.7)
    expect(bondTentEquity(tent, 90)).toBe(0.7)
  })
})

describe('Bucket', () => {
  const bucket: BucketStrategy = {
    type: 'bucket',
    cashYears: 2,
    bondYears: 5,
    refillRule: 'annual',
    equityUpThreshold: 0,
  }

  it('bemisst Cash- und Anleiheziel an der erwarteten Netto-Lücke', () => {
    expect(bucketTargets(bucket, 40_000)).toEqual({ cash: 80_000, bonds: 200_000 })
    expect(bucketTargets(bucket, -5_000)).toEqual({ cash: 0, bonds: 0 })
    const allocation = bucketAllocation({ cash: 80_000, bonds: 200_000 }, 1_000_000)
    expect(allocation).toEqual({ equity: 0.72, bonds: 0.2, cash: 0.08 })
  })

  it('füllt bei kleinem Depot zuerst Cash, dann Anleihen', () => {
    expect(bucketAllocation({ cash: 80_000, bonds: 200_000 }, 50_000)).toEqual({
      equity: 0,
      bonds: 0,
      cash: 1,
    })
    const a = bucketAllocation({ cash: 80_000, bonds: 200_000 }, 160_000)
    expect(a.cash).toBeCloseTo(0.5, 12)
    expect(a.bonds).toBeCloseTo(0.5, 12)
    expect(a.equity).toBe(0)
  })

  it('entnimmt zuerst aus Cash, dann aus Anleihen, dann aus Aktien', () => {
    const holdings = { equity: 500_000, bonds: 100_000, cash: 50_000 }
    expect(sequentialSale(holdings, 30_000)).toEqual({ equity: 0, bonds: 0, cash: 30_000 })
    expect(sequentialSale(holdings, 70_000)).toEqual({ equity: 0, bonds: 20_000, cash: 50_000 })
    expect(sequentialSale(holdings, 200_000)).toEqual({
      equity: 50_000,
      bonds: 100_000,
      cash: 50_000,
    })
    expect(sequentialSale(holdings, 1e9)).toEqual(holdings)
  })

  it('füllt jährlich Cash aus Anleihen und Anleihen aus Aktien auf', () => {
    const plan = refillPlan(
      bucket,
      { equity: 700_000, bonds: 180_000, cash: 20_000 },
      { cash: 80_000, bonds: 200_000 },
      -0.2,
    )
    expect(plan).toEqual({ bondsToCash: 60_000, equityToBonds: 80_000 })
  })

  it('equity-up-only verkauft in Verlustjahren keine Aktien zum Auffüllen', () => {
    const upOnly: BucketStrategy = {
      ...bucket,
      refillRule: 'equity-up-only',
      equityUpThreshold: 0.02,
    }
    const holdings = { equity: 700_000, bonds: 180_000, cash: 20_000 }
    const targets = { cash: 80_000, bonds: 200_000 }
    expect(refillPlan(upOnly, holdings, targets, -0.2)).toEqual({
      bondsToCash: 60_000,
      equityToBonds: 0,
    })
    expect(refillPlan(upOnly, holdings, targets, 0.02)).toEqual({
      bondsToCash: 60_000,
      equityToBonds: 0,
    })
    expect(refillPlan(upOnly, holdings, targets, 0.05)).toEqual({
      bondsToCash: 60_000,
      equityToBonds: 80_000,
    })
  })

  it('lässt Überschüsse über den Zielen stehen', () => {
    const plan = refillPlan(
      bucket,
      { equity: 500_000, bonds: 300_000, cash: 120_000 },
      { cash: 80_000, bonds: 200_000 },
      0.1,
    )
    expect(plan).toEqual({ bondsToCash: 0, equityToBonds: 0 })
  })
})
