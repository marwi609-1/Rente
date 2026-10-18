import type { RetirementPlan } from '../model/types'
import { PATH_SERIES, type PathBlock, type PathSeries } from './monteCarlo'

/** Perzentile je Jahr (Spezifikation Abschnitt 11). */
export const PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const

/** Alter für die Kennzahl „Vermögen mit …“. */
export const WEALTH_AGES = [90, 95] as const

/** Anteil der schlechtesten Pfade für den Expected Shortfall. */
const TAIL_SHARE = 0.1

/**
 * Perzentil einer aufsteigend sortierten Stichprobe mit linearer Interpolation zwischen den
 * Ordnungsstatistiken (Hyndman/Fan Typ 7). `p` in [0, 1].
 */
export function percentileOfSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  const h = (n - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, n - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

function sortedFinite(values: ArrayLike<number>): Float64Array {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) out.push(values[i])
  return Float64Array.from(out).sort()
}

export interface WealthAtAge {
  age: number
  median: number
  p10: number
  p90: number
}

export interface ShortfallStats {
  failedPaths: number
  /** über die gescheiterten Pfade; `null`, wenn kein Pfad scheitert */
  medianCumulativeReal: number | null
  p90CumulativeReal: number | null
  meanFailureYears: number | null
}

function shortfallStats(cumulative: number[], failureYearSum: number): ShortfallStats {
  const failed = cumulative.length
  if (failed === 0) {
    return {
      failedPaths: 0,
      medianCumulativeReal: null,
      p90CumulativeReal: null,
      meanFailureYears: null,
    }
  }
  const sorted = Float64Array.from(cumulative).sort()
  return {
    failedPaths: failed,
    medianCumulativeReal: percentileOfSorted(sorted, 0.5),
    p90CumulativeReal: percentileOfSorted(sorted, 0.9),
    meanFailureYears: failureYearSum / failed,
  }
}

function countBy(values: Iterable<number>): { age: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => a[0] - b[0]).map(([age, count]) => ({ age, count }))
}

export interface MonteCarloSummary {
  paths: number
  years: number
  ages: number[]
  calendarYears: number[]
  percentiles: readonly number[]
  /** `bands[reihe][k][t]`: Perzentil `percentiles[k]` im Jahr t */
  bands: Record<PathSeries, number[][]>
  /** Anteil der Pfade ohne Fehljahr bis zum Horizont */
  successRate: number
  /** Standardfehler √(p(1−p)/N) */
  successStdError: number
  /** realer Bestand am Ende des Jahres, in dem das Alter erreicht wird; nur innerhalb des Horizonts */
  wealthAt: WealthAtAge[]
  /** Alter, bis zu dem 10 % der Pfade ihr Depot aufgebraucht haben; `null` = nicht erreicht */
  earliestDepletionAge: number | null
  /** Anzahl der Pfade je Erschöpfungsalter */
  depletionHistogram: { age: number; count: number }[]
  neverDepleted: number
  shortfall: ShortfallStats
  /**
   * Sterblichkeitsgewichtete Sicht: Ein Pfad ist erfolgreich, wenn bis zum gezogenen Sterbealter
   * (höchstens bis zum Horizont) kein Fehljahr auftritt; Fehlbeträge nur bis dahin.
   */
  mortalityWeighted: {
    successRate: number
    successStdError: number
    shortfall: ShortfallStats
  }
  /** Anzahl der Pfade je gezogenem Sterbealter bis zum Horizont */
  deathAgeHistogram: { age: number; count: number }[]
  /** Pfade, deren Sterbealter nach dem Horizont liegt (beim festen Horizont alle) */
  survivingHorizon: number
  /** Mittelwert des realen Endvermögens der schlechtesten 10 % der Pfade */
  expectedShortfallReal: number
  /** Median der annualisierten Portfoliorendite je Pfad */
  cagr: { nominal: number | null; real: number | null }
}

function medianOrNull(values: ArrayLike<number>): number | null {
  const sorted = sortedFinite(values)
  return sorted.length > 0 ? percentileOfSorted(sorted, 0.5) : null
}

/**
 * Verdichtet die Pfade eines Laufs zu Perzentilbändern und Kennzahlen für den festen Horizont und
 * für die sterblichkeitsgewichtete Sicht.
 */
export function summarize(plan: RetirementPlan, block: PathBlock): MonteCarloSummary {
  const { paths, years } = block
  if (paths === 0) throw new RangeError('Für die Auswertung wird mindestens ein Pfad benötigt.')
  const { currentAge, startYear } = plan.household
  const ages = Array.from({ length: years }, (_, t) => currentAge + t)

  const column = new Float64Array(paths)
  const bands = {} as Record<PathSeries, number[][]>
  for (const name of PATH_SERIES) {
    const values = block.series[name]
    const band = PERCENTILES.map(() => new Array<number>(years))
    for (let t = 0; t < years; t++) {
      for (let p = 0; p < paths; p++) column[p] = values[p * years + t]
      column.sort()
      PERCENTILES.forEach((q, k) => (band[k][t] = percentileOfSorted(column, q / 100)))
    }
    bands[name] = band
  }

  const horizonAge = currentAge + years - 1
  let succeeded = 0
  const failedShortfalls: number[] = []
  let failureYearSum = 0
  let survivedSucceeded = 0
  const survivedShortfalls: number[] = []
  let survivedFailureYearSum = 0
  const deathAges: number[] = []
  for (let p = 0; p < paths; p++) {
    if (block.failureYears[p] === 0) {
      succeeded++
    } else {
      failedShortfalls.push(block.cumulativeShortfallReal[p])
      failureYearSum += block.failureYears[p]
    }
    const deathAge = block.deathAge[p]
    if (deathAge <= horizonAge) deathAges.push(deathAge)
    const firstFailure = block.firstFailureAge[p]
    if (Number.isNaN(firstFailure) || firstFailure > deathAge) {
      survivedSucceeded++
    } else {
      // Fehlbeträge bis zum Sterbealter
      const lastYear = Math.min(years - 1, deathAge - currentAge)
      let sum = 0
      let count = 0
      for (let t = 0; t <= lastYear; t++) {
        const value = block.series.shortfallReal[p * years + t]
        if (value > 0) {
          sum += value
          count++
        }
      }
      survivedShortfalls.push(sum)
      survivedFailureYearSum += count
    }
  }
  const successRate = succeeded / paths
  const mortalitySuccess = survivedSucceeded / paths

  const wealthAt: WealthAtAge[] = []
  for (const age of WEALTH_AGES) {
    const t = age - currentAge
    if (t < 0 || t >= years) continue
    const at = (q: number) => bands.totalReal[(PERCENTILES as readonly number[]).indexOf(q)][t]
    wealthAt.push({ age, median: at(50), p10: at(10), p90: at(90) })
  }

  // Erschöpfungsalter: nie erschöpfte Pfade zählen als +∞.
  const depletion = Float64Array.from(block.depletionAge, (a) =>
    Number.isNaN(a) ? Number.POSITIVE_INFINITY : a,
  ).sort()
  const tenthPath = depletion[Math.max(0, Math.ceil(TAIL_SHARE * paths) - 1)]
  const depletedAges = depletion.filter((age) => age !== Number.POSITIVE_INFINITY)

  const terminal = new Float64Array(paths)
  for (let p = 0; p < paths; p++) terminal[p] = block.series.totalReal[p * years + years - 1]
  terminal.sort()
  const tailCount = Math.max(1, Math.ceil(TAIL_SHARE * paths))
  let tailSum = 0
  for (let i = 0; i < tailCount; i++) tailSum += terminal[i]

  return {
    paths,
    years,
    ages,
    calendarYears: ages.map((_, t) => startYear + t),
    percentiles: PERCENTILES,
    bands,
    successRate,
    successStdError: Math.sqrt((successRate * (1 - successRate)) / paths),
    wealthAt,
    earliestDepletionAge: Number.isFinite(tenthPath) ? tenthPath : null,
    depletionHistogram: countBy(depletedAges),
    neverDepleted: paths - depletedAges.length,
    shortfall: shortfallStats(failedShortfalls, failureYearSum),
    mortalityWeighted: {
      successRate: mortalitySuccess,
      successStdError: Math.sqrt((mortalitySuccess * (1 - mortalitySuccess)) / paths),
      shortfall: shortfallStats(survivedShortfalls, survivedFailureYearSum),
    },
    deathAgeHistogram: countBy(deathAges),
    survivingHorizon: paths - deathAges.length,
    expectedShortfallReal: tailSum / tailCount,
    cagr: { nominal: medianOrNull(block.cagrNominal), real: medianOrNull(block.cagrReal) },
  }
}
