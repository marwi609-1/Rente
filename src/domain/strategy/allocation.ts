import { UnsupportedFeatureError } from '../model/errors'
import type { Allocation, FixedStrategy, StrategyConfig } from '../model/types'

/** Liefert die Zielallokation für ein Lebensalter. */
export type AllocationPolicy = (age: number) => Allocation

export function fixedAllocation(strategy: FixedStrategy): Allocation {
  return {
    equity: strategy.equity,
    // Rest Anleihen; Rundungsrauschen unter 0 wird abgeschnitten.
    bonds: Math.max(0, 1 - strategy.equity - strategy.cash),
    cash: strategy.cash,
  }
}

export function allocationPolicy(strategy: StrategyConfig): AllocationPolicy {
  switch (strategy.type) {
    case 'fixed': {
      const allocation = fixedAllocation(strategy)
      return () => allocation
    }
    case 'glidepath':
    case 'bond-tent':
    case 'bucket':
      throw new UnsupportedFeatureError(`Die Strategie „${strategy.type}“`)
  }
}
