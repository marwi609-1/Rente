import type { MarketModel } from '../model/types'
import { geometricMean } from './returns'
import type { ReturnPath } from './types'

/**
 * Deterministischer Referenzpfad (Spezifikation Abschnitt 8): jedes Jahr exakt die geometrische
 * Rendite, die sich aus μ und σ unter der Lognormalannahme ergibt. Gilt für alle vier Reihen,
 * auch für die Inflation. Unabhängig von `market.type`.
 */
export function deterministicReturnPath(market: MarketModel, years: number): ReturnPath {
  return {
    equity: new Float64Array(years).fill(geometricMean(market.equity.mean, market.equity.vol)),
    bonds: new Float64Array(years).fill(geometricMean(market.bonds.mean, market.bonds.vol)),
    cash: new Float64Array(years).fill(geometricMean(market.cash.mean, market.cash.vol)),
    inflation: new Float64Array(years).fill(
      geometricMean(market.inflation.mean, market.inflation.vol),
    ),
  }
}
