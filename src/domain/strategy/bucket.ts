import type { Allocation, AssetVector, BucketStrategy } from '../model/types'
import { totalOf, zeroVector } from './flows'

export interface BucketTargets {
  /** Zielbetrag Cash: cashYears × erwartete Netto-Lücke */
  cash: number
  /** Zielbetrag Anleihen: bondYears × erwartete Netto-Lücke */
  bonds: number
}

export function bucketTargets(strategy: BucketStrategy, expectedGap: number): BucketTargets {
  const gap = Math.max(0, expectedGap)
  return { cash: strategy.cashYears * gap, bonds: strategy.bondYears * gap }
}

/**
 * Allokation, die die Zielbeträge bei einem Depotwert `total` ergeben: zuerst Cash, dann Anleihen,
 * der Rest Aktien. Bei leerem Depot fließt ein Zufluss zuerst in Cash.
 */
export function bucketAllocation(targets: BucketTargets, total: number): Allocation {
  if (total <= 0) return { equity: 0, bonds: 0, cash: 1 }
  const cash = Math.min(1, targets.cash / total)
  const bonds = Math.min(1 - cash, targets.bonds / total)
  return { equity: Math.max(0, 1 - cash - bonds), bonds, cash }
}

/** Entnahme der Reihe nach aus Cash, Anleihen und Aktien (höchstens der gesamte Bestand). */
export function sequentialSale(holdings: AssetVector, amount: number): AssetVector {
  const amounts = zeroVector()
  let remaining = Math.min(Math.max(0, amount), totalOf(holdings))
  for (const k of ['cash', 'bonds', 'equity'] as const) {
    amounts[k] = Math.min(holdings[k], remaining)
    remaining -= amounts[k]
  }
  return amounts
}

export interface RefillPlan {
  /** Verkauf von Anleihen zugunsten von Cash */
  bondsToCash: number
  /** Verkauf von Aktien zugunsten von Anleihen */
  equityToBonds: number
}

/**
 * Auffüllen zum Jahresende: Cash aus Anleihen bis zum Cash-Ziel, dann Anleihen aus Aktien bis zum
 * Anleihe-Ziel. Bei `equity-up-only` werden Aktien nur verkauft, wenn ihre Rendite im abgelaufenen
 * Jahr über `equityUpThreshold` lag. Überschüsse über den Zielen bleiben stehen.
 */
export function refillPlan(
  strategy: BucketStrategy,
  holdings: AssetVector,
  targets: BucketTargets,
  equityReturn: number,
): RefillPlan {
  const bondsToCash = Math.min(holdings.bonds, Math.max(0, targets.cash - holdings.cash))
  const bondsAfter = holdings.bonds - bondsToCash
  const equityAllowed =
    strategy.refillRule === 'annual' || equityReturn > strategy.equityUpThreshold
  const equityToBonds = equityAllowed
    ? Math.min(holdings.equity, Math.max(0, targets.bonds - bondsAfter))
    : 0
  return { bondsToCash, equityToBonds }
}
