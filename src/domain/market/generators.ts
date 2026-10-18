import type { MarketModel, SimulationSettings } from '../model/types'
import { cholesky } from '../random/cholesky'
import { NormalSampler, sampleChiSquare } from '../random/distributions'
import { Xoshiro128, pathSeed } from '../random/xoshiro'
import { deterministicReturnPath } from './deterministic'
import { historicalWindow, type HistoricalData, type HistoricalRow } from './historical'
import { lognormalParams } from './returns'
import type { ReturnPath } from './types'

/** Reihenfolge der gemeinsam gezogenen Reihen, wie in der Korrelationsmatrix. */
const SERIES = ['equity', 'bonds', 'cash', 'inflation'] as const

/**
 * Erzeugt die Renditen eines Pfades. `fill` ist allein durch den Pfadindex bestimmt; dadurch sind
 * Ergebnisse unabhängig von der Aufteilung der Pfade auf Worker und Blöcke.
 */
export interface ReturnGenerator {
  /** Anzahl der Pfade, die das Modell erzeugt */
  readonly paths: number
  fill(pathIndex: number, out: ReturnPath): void
}

export function createReturnPath(years: number): ReturnPath {
  return {
    equity: new Float64Array(years),
    bonds: new Float64Array(years),
    cash: new Float64Array(years),
    inflation: new Float64Array(years),
  }
}

export interface GeneratorContext {
  market: MarketModel
  simulation: SimulationSettings
  years: number
  /** nur für die historischen Modelle erforderlich */
  historical?: HistoricalData
}

export function createReturnGenerator(ctx: GeneratorContext): ReturnGenerator {
  switch (ctx.market.type) {
    case 'deterministic':
      return deterministicGenerator(ctx)
    case 'lognormal':
      return parametricGenerator(ctx, null)
    case 'student-t': {
      const df = ctx.market.studentDf
      if (df === undefined)
        throw new RangeError('Für das Student-t-Modell fehlen die Freiheitsgrade.')
      return parametricGenerator(ctx, df)
    }
    case 'historical-sequence':
      return historicalSequenceGenerator(ctx, requireHistorical(ctx))
    case 'block-bootstrap':
      return blockBootstrapGenerator(ctx, requireHistorical(ctx))
  }
}

function requireHistorical(ctx: GeneratorContext): HistoricalRow[] {
  if (!ctx.historical) throw new RangeError('Für historische Marktmodelle fehlen die Daten.')
  return historicalWindow(ctx.market, ctx.historical)
}

/** Alle Pfade sind identisch; ein einziger Pfad genügt. */
function deterministicGenerator({ market, years }: GeneratorContext): ReturnGenerator {
  const path = deterministicReturnPath(market, years)
  return {
    paths: 1,
    fill(_pathIndex, out) {
      for (const k of SERIES) out[k].set(path[k])
    },
  }
}

/**
 * Lognormal bzw. Student-t: korrelierte Standardnormale über Cholesky, 1 + r = exp(μ_ln + σ_ln·x).
 * Für Student-t wird der Vektor mit einer gemeinsamen Chi-Quadrat-Variable W gemischt
 * (multivariate t) und auf Varianz 1 skaliert: x · √((ν − 2) / W).
 * Ziehungsreihenfolge je Jahr: vier Normale (Aktien, Anleihen, Cash, Inflation), danach W.
 */
function parametricGenerator(
  { market, simulation, years }: GeneratorContext,
  studentDf: number | null,
): ReturnGenerator {
  const lower = cholesky(market.correlation)
  const params = [market.equity, market.bonds, market.cash, market.inflation].map((s) =>
    lognormalParams(s.mean, s.vol),
  )
  const z = new Float64Array(4)
  return {
    paths: simulation.paths,
    fill(pathIndex, out) {
      const rng = Xoshiro128.fromSeed(pathSeed(simulation.seed, pathIndex))
      const normal = new NormalSampler(rng)
      for (let t = 0; t < years; t++) {
        for (let i = 0; i < 4; i++) z[i] = normal.next()
        const scale =
          studentDf === null
            ? 1
            : Math.sqrt((studentDf - 2) / sampleChiSquare(studentDf, normal, rng))
        for (let i = 0; i < 4; i++) {
          let x = 0
          for (let j = 0; j <= i; j++) x += lower[i][j] * z[j]
          out[SERIES[i]][t] = Math.expm1(params[i].muLn + params[i].sigmaLn * x * scale)
        }
      }
    },
  }
}

function copyRow(row: HistoricalRow, out: ReturnPath, t: number): void {
  out.equity[t] = row.equity
  out.bonds[t] = row.bonds
  out.cash[t] = row.cash
  out.inflation[t] = row.inflation
}

/**
 * Alle rollierenden Startjahre des Datenfensters ohne Zufall; Pfad p beginnt mit dem p-ten Jahr.
 * Reicht das Fenster nicht bis zum Horizont, wird zyklisch mit dem ersten Jahr fortgesetzt.
 */
function historicalSequenceGenerator(
  { years }: GeneratorContext,
  rows: HistoricalRow[],
): ReturnGenerator {
  return {
    paths: rows.length,
    fill(pathIndex, out) {
      for (let t = 0; t < years; t++) copyRow(rows[(pathIndex + t) % rows.length], out, t)
    },
  }
}

/**
 * Stationärer Bootstrap (Politis/Romano 1994): zufälliges Startjahr, danach mit Wahrscheinlichkeit
 * 1/L ein neuer Block an zufälliger Stelle, sonst das Folgejahr (zyklisch). Die Blocklänge ist
 * geometrisch mit Mittel L. Gezogen werden ganze Jahreszeilen aller Reihen.
 */
function blockBootstrapGenerator(
  { market, simulation, years }: GeneratorContext,
  rows: HistoricalRow[],
): ReturnGenerator {
  const restartProbability = 1 / (market.bootstrap?.meanBlockLength ?? 5)
  const n = rows.length
  return {
    paths: simulation.paths,
    fill(pathIndex, out) {
      const rng = Xoshiro128.fromSeed(pathSeed(simulation.seed, pathIndex))
      let index = Math.floor(rng.nextFloat() * n)
      for (let t = 0; t < years; t++) {
        if (t > 0) {
          index =
            rng.nextFloat() < restartProbability ? Math.floor(rng.nextFloat() * n) : (index + 1) % n
        }
        copyRow(rows[index], out, t)
      }
    },
  }
}
