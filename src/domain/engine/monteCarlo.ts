import { createReturnGenerator, createReturnPath } from '../market/generators'
import type { HistoricalData } from '../market/historical'
import type { RetirementPlan } from '../model/types'
import { createPathSimulator } from './path'
import { simulationYears } from './timeline'

/** Je Pfad und Jahr gespeicherte Reihen; Beträge real in Euro von heute bzw. nominal (`total`). */
export const PATH_SERIES = [
  'total',
  'totalReal',
  'consumptionReal',
  'shortfallReal',
  'equityShare',
  'bondShare',
  'cashShare',
] as const

export type PathSeries = (typeof PATH_SERIES)[number]

/** Ein leeres Depot (unter einem Cent) gilt als erschöpft. */
const DEPLETION_TOLERANCE = 0.01

/**
 * Ergebnisse eines zusammenhängenden Pfadbereichs. Reihen liegen pfadweise hintereinander:
 * Index `p · years + t` für den p-ten Pfad des Blocks und das Jahr t.
 */
export interface PathBlock {
  /** Index des ersten Pfades im Gesamtlauf */
  start: number
  paths: number
  years: number
  series: Record<PathSeries, Float64Array>
  /** Alter, an dessen Jahresende das Depot erstmals leer ist; NaN, wenn nie */
  depletionAge: Float64Array
  /** Anzahl der Fehljahre bis zum Horizont */
  failureYears: Float64Array
  /** Summe der realen Fehlbeträge bis zum Horizont */
  cumulativeShortfallReal: Float64Array
  /** annualisierte Portfoliorendite über die Jahre mit investiertem Kapital; NaN, wenn keines */
  cagrNominal: Float64Array
  cagrReal: Float64Array
}

export interface MonteCarloContext {
  /** nur für die historischen Marktmodelle erforderlich */
  historical?: HistoricalData
}

/** Anzahl der Pfade eines Laufs (bei `historical-sequence` die Zahl der Startjahre). */
export function monteCarloPathCount(plan: RetirementPlan, ctx: MonteCarloContext = {}): number {
  return createReturnGenerator({
    market: plan.market,
    simulation: plan.simulation,
    years: simulationYears(plan.household),
    historical: ctx.historical,
  }).paths
}

function emptyBlock(start: number, paths: number, years: number): PathBlock {
  const series = {} as Record<PathSeries, Float64Array>
  for (const name of PATH_SERIES) series[name] = new Float64Array(paths * years)
  return {
    start,
    paths,
    years,
    series,
    depletionAge: new Float64Array(paths),
    failureYears: new Float64Array(paths),
    cumulativeShortfallReal: new Float64Array(paths),
    cagrNominal: new Float64Array(paths),
    cagrReal: new Float64Array(paths),
  }
}

/** Simuliert die Pfade `start` bis ausschließlich `end`. Der Plan muss validiert sein. */
export function simulateBlock(
  plan: RetirementPlan,
  start: number,
  end: number,
  ctx: MonteCarloContext = {},
): PathBlock {
  const years = simulationYears(plan.household)
  const generator = createReturnGenerator({
    market: plan.market,
    simulation: plan.simulation,
    years,
    historical: ctx.historical,
  })
  if (!(start >= 0 && end <= generator.paths && start <= end)) {
    throw new RangeError(`Pfadbereich ${start}–${end} liegt außerhalb von 0–${generator.paths}.`)
  }
  const simulate = createPathSimulator(plan)
  const block = emptyBlock(start, end - start, years)
  const { series } = block
  const returns = createReturnPath(years)

  for (let p = 0; p < block.paths; p++) {
    generator.fill(start + p, returns)
    const offset = p * years
    let t = 0
    let depletionAge = NaN
    let failureYears = 0
    let shortfallReal = 0
    let logNominal = 0
    let logReal = 0
    let investedYears = 0
    simulate(returns, (row) => {
      const i = offset + t
      series.total[i] = row.total
      series.totalReal[i] = row.total / row.inflationIndexEnd
      series.consumptionReal[i] = row.netConsumption / row.inflationIndex
      series.shortfallReal[i] = row.shortfall / row.inflationIndex
      series.equityShare[i] = row.equityShare
      series.bondShare[i] = row.bondShare
      series.cashShare[i] = row.cashShare
      if (Number.isNaN(depletionAge) && row.total < DEPLETION_TOLERANCE) depletionAge = row.age
      if (row.shortfall > 0) {
        failureYears++
        shortfallReal += row.shortfall / row.inflationIndex
      }
      if (row.portfolioReturn !== null) {
        const log = Math.log1p(row.portfolioReturn)
        logNominal += log
        logReal += log - Math.log1p(returns.inflation[t])
        investedYears++
      }
      t++
    })
    block.depletionAge[p] = depletionAge
    block.failureYears[p] = failureYears
    block.cumulativeShortfallReal[p] = shortfallReal
    block.cagrNominal[p] = investedYears > 0 ? Math.expm1(logNominal / investedYears) : NaN
    block.cagrReal[p] = investedYears > 0 ? Math.expm1(logReal / investedYears) : NaN
  }
  return block
}

/** Fügt lückenlos aneinandergrenzende Blöcke (in beliebiger Reihenfolge) zu einem Block zusammen. */
export function mergeBlocks(blocks: readonly PathBlock[]): PathBlock {
  if (blocks.length === 0) throw new RangeError('Es gibt keine Pfadblöcke zum Zusammenführen.')
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const years = sorted[0].years
  const start = sorted[0].start
  let paths = 0
  for (const b of sorted) {
    if (b.years !== years || b.start !== start + paths) {
      throw new RangeError('Die Pfadblöcke grenzen nicht lückenlos aneinander.')
    }
    paths += b.paths
  }
  const merged = emptyBlock(start, paths, years)
  let offset = 0
  for (const b of sorted) {
    for (const name of PATH_SERIES) merged.series[name].set(b.series[name], offset * years)
    merged.depletionAge.set(b.depletionAge, offset)
    merged.failureYears.set(b.failureYears, offset)
    merged.cumulativeShortfallReal.set(b.cumulativeShortfallReal, offset)
    merged.cagrNominal.set(b.cagrNominal, offset)
    merged.cagrReal.set(b.cagrReal, offset)
    offset += b.paths
  }
  return merged
}

/** Alle Puffer eines Blocks, z. B. für eine Übertragung ohne Kopie zwischen Worker und Hauptthread. */
export function blockBuffers(block: PathBlock): ArrayBuffer[] {
  return [
    ...PATH_SERIES.map((name) => block.series[name].buffer as ArrayBuffer),
    block.depletionAge.buffer as ArrayBuffer,
    block.failureYears.buffer as ArrayBuffer,
    block.cumulativeShortfallReal.buffer as ArrayBuffer,
    block.cagrNominal.buffer as ArrayBuffer,
    block.cagrReal.buffer as ArrayBuffer,
  ]
}
