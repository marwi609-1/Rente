import type { AssetVector } from '../model/types'
import { ASSET_CLASSES, sharesOf, totalOf } from './flows'

/** Größte absolute Abweichung eines Ist-Anteils vom Zielanteil; 0 bei leerem Depot. */
export function maxDeviation(holdings: AssetVector, target: AssetVector): number {
  if (totalOf(holdings) <= 0) return 0
  const shares = sharesOf(holdings)
  let deviation = 0
  for (const k of ASSET_CLASSES) deviation = Math.max(deviation, Math.abs(shares[k] - target[k]))
  return deviation
}

export interface RebalanceResult {
  holdings: AssetVector
  /** Verkaufsvolumen der übergewichteten Klassen */
  sales: number
}

/**
 * Stellt die Zielallokation her, wenn die Abweichung das Band erreicht („ab der rebalanciert wird“);
 * sonst bleibt der Bestand unverändert.
 */
export function rebalanceIfOutsideBand(
  holdings: AssetVector,
  target: AssetVector,
  band: number,
): RebalanceResult {
  const total = totalOf(holdings)
  if (total <= 0 || maxDeviation(holdings, target) < band) return { holdings, sales: 0 }
  const next: AssetVector = {
    equity: target.equity * total,
    bonds: target.bonds * total,
    cash: target.cash * total,
  }
  let sales = 0
  for (const k of ASSET_CLASSES) sales += Math.max(0, holdings[k] - next[k])
  return { holdings: next, sales }
}
