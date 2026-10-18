import { interpolateLinear } from '../interpolation'
import type {
  Allocation,
  BondTentStrategy,
  FixedStrategy,
  GlidepathStrategy,
  StrategyConfig,
} from '../model/types'

/** Strategien mit einer altersabhängigen Zielallokation (alle außer Bucket). */
export type AllocationStrategy = Exclude<StrategyConfig, { type: 'bucket' }>

/** Liefert die Zielallokation für ein Lebensalter. */
export type AllocationPolicy = (age: number) => Allocation

/** Allokation aus Aktien- und Cash-Anteil; der Rest sind Anleihen (Rundungsrauschen unter 0 entfällt). */
export function allocationFromEquity(equity: number, cash: number): Allocation {
  return { equity, bonds: Math.max(0, 1 - equity - cash), cash }
}

export function fixedAllocation(strategy: FixedStrategy): Allocation {
  return allocationFromEquity(strategy.equity, strategy.cash)
}

/** Glidepath: Aktienquote linear zwischen den Punkten, davor und danach konstant. */
export function glidepathEquity(strategy: GlidepathStrategy, age: number): number {
  return interpolateLinear(
    strategy.points,
    age,
    (p) => p.age,
    (p) => p.equity,
  )
}

/**
 * Bond Tent: Aktienquote stückweise linear von `startEquity` (startAge) über `peakEquity` (peakAge,
 * Minimum der Aktienquote) zu `endEquity` (endAge), davor und danach konstant.
 */
export function bondTentEquity(strategy: BondTentStrategy, age: number): number {
  const points: [number, number][] = [
    [strategy.startAge, strategy.startEquity],
    [strategy.peakAge, strategy.peakEquity],
    [strategy.endAge, strategy.endEquity],
  ]
  return interpolateLinear(
    points,
    age,
    (p) => p[0],
    (p) => p[1],
  )
}

export function allocationPolicy(strategy: AllocationStrategy): AllocationPolicy {
  switch (strategy.type) {
    case 'fixed': {
      const allocation = fixedAllocation(strategy)
      return () => allocation
    }
    case 'glidepath':
      return (age) => allocationFromEquity(glidepathEquity(strategy, age), strategy.cash)
    case 'bond-tent':
      return (age) => allocationFromEquity(bondTentEquity(strategy, age), strategy.cash)
  }
}
