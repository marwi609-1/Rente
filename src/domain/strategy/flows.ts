import type { AssetClass, AssetVector } from '../model/types'

export const ASSET_CLASSES: readonly AssetClass[] = ['equity', 'bonds', 'cash']

export function zeroVector(): AssetVector {
  return { equity: 0, bonds: 0, cash: 0 }
}

export function totalOf(v: AssetVector): number {
  return v.equity + v.bonds + v.cash
}

/** Anteile je Anlageklasse; bei leerem Depot alle 0. */
export function sharesOf(holdings: AssetVector): AssetVector {
  const total = totalOf(holdings)
  if (total <= 0) return zeroVector()
  return {
    equity: holdings.equity / total,
    bonds: holdings.bonds / total,
    cash: holdings.cash / total,
  }
}

export interface FlowResult {
  holdings: AssetVector
  /** Betrag je Anlageklasse (Kauf bzw. Verkauf, jeweils positiv) */
  amounts: AssetVector
  /** Summe der Beträge; bei Verkäufen der tatsächlich erzielte Erlös */
  total: number
}

/**
 * Verteilt `amount` proportional zu `weights`, ohne die Obergrenzen `caps` zu überschreiten.
 * Überschüsse gesättigter Klassen gehen anteilig an die übrigen; haben alle verbleibenden
 * Klassen Gewicht 0, wird nach verbleibender Kapazität verteilt. Erwartet amount ≤ Σ caps.
 */
function distributeWithCaps(amount: number, weights: AssetVector, caps: AssetVector): AssetVector {
  const result = zeroVector()
  let remaining = amount
  let active = ASSET_CLASSES.filter((k) => caps[k] > 0)
  while (remaining > 0 && active.length > 0) {
    let weightSum = 0
    for (const k of active) weightSum += weights[k]
    const byCapacity = weightSum <= 0
    const weight = (k: AssetClass) => (byCapacity ? caps[k] - result[k] : weights[k])
    if (byCapacity) {
      weightSum = 0
      for (const k of active) weightSum += weight(k)
    }
    const saturated = active.filter(
      (k) => (remaining * weight(k)) / weightSum >= caps[k] - result[k],
    )
    if (saturated.length === 0) {
      for (const k of active) result[k] += (remaining * weight(k)) / weightSum
      break
    }
    for (const k of saturated) {
      remaining -= caps[k] - result[k]
      result[k] = caps[k]
    }
    active = active.filter((k) => !saturated.includes(k))
  }
  return result
}

/**
 * Investiert `amount` gemäß Zielallokation. Mit `taxAware` fließt der Betrag in die untergewichteten
 * Klassen (anteilig zur Lücke gegenüber dem Ziel nach dem Zufluss), sonst proportional zum Ziel.
 */
export function invest(
  holdings: AssetVector,
  target: AssetVector,
  amount: number,
  taxAware: boolean,
): FlowResult {
  const amounts = zeroVector()
  if (amount > 0) {
    let weights = target
    if (taxAware) {
      const newTotal = totalOf(holdings) + amount
      const deficits = zeroVector()
      for (const k of ASSET_CLASSES) deficits[k] = Math.max(0, target[k] * newTotal - holdings[k])
      // Σ Lücken ≥ amount, weil Σ max(h, Ziel) ≥ Σ Ziel = Bestand + amount.
      if (totalOf(deficits) > 0) weights = sharesOf(deficits)
    }
    for (const k of ASSET_CLASSES) amounts[k] = amount * weights[k]
  }
  return {
    holdings: {
      equity: holdings.equity + amounts.equity,
      bonds: holdings.bonds + amounts.bonds,
      cash: holdings.cash + amounts.cash,
    },
    amounts,
    total: totalOf(amounts),
  }
}

/**
 * Verkauft Anteile im Wert von `amount` (höchstens den gesamten Bestand). Mit `taxAware` wird aus den
 * übergewichteten Klassen verkauft (anteilig zum Überhang gegenüber dem Ziel nach dem Abfluss), sonst
 * proportional zur Zielallokation; reicht eine Klasse nicht aus, tragen die übrigen den Rest.
 */
export function sell(
  holdings: AssetVector,
  target: AssetVector,
  amount: number,
  taxAware: boolean,
): FlowResult {
  const total = totalOf(holdings)
  let amounts: AssetVector
  if (amount <= 0) {
    amounts = zeroVector()
  } else if (amount >= total) {
    amounts = { ...holdings }
  } else {
    let weights = target
    if (taxAware) {
      const newTotal = total - amount
      const excess = zeroVector()
      for (const k of ASSET_CLASSES) excess[k] = Math.max(0, holdings[k] - target[k] * newTotal)
      // Σ Überhänge ≥ amount, weil Σ min(h, Ziel) ≤ Σ Ziel = Bestand − amount; jede Klasse
      // gibt daher höchstens ihren Überhang ab und die Obergrenzen greifen nicht.
      if (totalOf(excess) > 0) weights = sharesOf(excess)
    }
    amounts = distributeWithCaps(amount, weights, holdings)
  }
  return {
    holdings: {
      equity: holdings.equity - amounts.equity,
      bonds: holdings.bonds - amounts.bonds,
      cash: holdings.cash - amounts.cash,
    },
    amounts,
    total: totalOf(amounts),
  }
}
