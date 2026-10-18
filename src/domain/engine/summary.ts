import type { RetirementPlan } from '../model/types'
import { histogramOfSorted, type Histogram } from './histogram'
import type { PathBlock, PathSeries } from './monteCarlo'
import { percentileOfSorted, percentilesOf } from './percentile'

export { percentileOfSorted }

/** Perzentile je Jahr (Spezifikation Abschnitt 11). */
export const PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const

/**
 * Reihen mit Perzentilbändern: Depotwert (Fan Chart, Vermögen mit 90/95) und Anteile (Asset
 * Allocation beim Bucket). Die übrigen Reihen speisen Median-Pfad und Kennzahlen; Bänder dafür
 * würden nur Sortierzeit kosten.
 */
export const BAND_SERIES = ['total', 'totalReal', 'equityShare', 'bondShare', 'cashShare'] as const

export type BandSeries = (typeof BAND_SERIES)[number]

/** Alter für die Kennzahl „Vermögen mit …“. */
export const WEALTH_AGES = [90, 95] as const

/** Anteil der schlechtesten Pfade für den Expected Shortfall. */
const TAIL_SHARE = 0.1

function sortedFinite(values: ArrayLike<number>): Float64Array {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) out.push(values[i])
  return Float64Array.from(out).sort()
}

export interface WealthQuantiles {
  median: number
  p10: number
  p90: number
}

export interface WealthAtAge {
  age: number
  /** in Euro von heute */
  real: WealthQuantiles
  nominal: WealthQuantiles
}

/** Reale und nominale Variante einer Kennzahl. */
export interface RealNominal<T> {
  real: T
  nominal: T
}

/**
 * Repräsentativer Pfad: Rang des mittleren realen Endvermögens; bei Gleichstand (etwa vieler
 * erschöpfter Pfade) entscheidet das mittlere reale Vermögen über alle Jahre. Beträge real, der
 * Preisindex zu Jahresbeginn erlaubt die Rückrechnung der Zahlungen auf nominal.
 */
export interface MedianPath {
  /** Index des Pfades im Lauf */
  path: number
  totalReal: number[]
  total: number[]
  consumptionReal: number[]
  pensionNetReal: number[]
  /** laufende weitere Einkünfte netto */
  otherIncomeNetReal: number[]
  capitalTaxReal: number[]
  incomeTaxReal: number[]
  healthInsuranceReal: number[]
  equityShare: number[]
  bondShare: number[]
  cashShare: number[]
  priceIndex: number[]
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
  bands: Record<BandSeries, number[][]>
  /** Anteil der Pfade ohne Fehljahr bis zum Horizont */
  successRate: number
  /** Standardfehler √(p(1−p)/N) */
  successStdError: number
  /** Bestand am Ende des Jahres, in dem das Alter erreicht wird; nur innerhalb des Horizonts */
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
  /** Mittelwert des Endvermögens der schlechtesten 10 % der Pfade */
  expectedShortfall: RealNominal<number>
  /** Verteilung des Endvermögens im Horizontjahr */
  terminalWealth: RealNominal<Histogram>
  medianPath: MedianPath
  /** Median der annualisierten Portfoliorendite je Pfad */
  cagr: { nominal: number | null; real: number | null }
}

function medianOrNull(values: ArrayLike<number>): number | null {
  const sorted = sortedFinite(values)
  return sorted.length > 0 ? percentileOfSorted(sorted, 0.5) : null
}

/** Wählt den repräsentativen Pfad (siehe {@link MedianPath}) und liest seine Reihen aus. */
export function medianPath(block: PathBlock): MedianPath {
  const { paths, years, series } = block
  const terminal = new Float64Array(paths)
  const mean = new Float64Array(paths)
  for (let p = 0; p < paths; p++) {
    let sum = 0
    for (let t = 0; t < years; t++) sum += series.totalReal[p * years + t]
    terminal[p] = series.totalReal[p * years + years - 1]
    mean[p] = sum / years
  }
  const order = Array.from({ length: paths }, (_, p) => p).sort(
    (a, b) => terminal[a] - terminal[b] || mean[a] - mean[b] || a - b,
  )
  const path = order[Math.floor((paths - 1) / 2)]
  const read = (name: PathSeries) =>
    Array.from(series[name].subarray(path * years, (path + 1) * years))
  return {
    path: block.start + path,
    totalReal: read('totalReal'),
    total: read('total'),
    consumptionReal: read('consumptionReal'),
    pensionNetReal: read('pensionNetReal'),
    otherIncomeNetReal: read('otherIncomeNetReal'),
    capitalTaxReal: read('capitalTaxReal'),
    incomeTaxReal: read('incomeTaxReal'),
    healthInsuranceReal: read('healthInsuranceReal'),
    equityShare: read('equityShare'),
    bondShare: read('bondShare'),
    cashShare: read('cashShare'),
    priceIndex: read('priceIndex'),
  }
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
  const fractions = PERCENTILES.map((q) => q / 100)
  const bands = {} as Record<BandSeries, number[][]>
  for (const name of BAND_SERIES) {
    const values = block.series[name]
    const band = PERCENTILES.map(() => new Array<number>(years))
    for (let t = 0; t < years; t++) {
      for (let p = 0; p < paths; p++) column[p] = values[p * years + t]
      percentilesOf(column, fractions).forEach((value, k) => (band[k][t] = value))
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
    const quantiles = (name: 'totalReal' | 'total'): WealthQuantiles => {
      const at = (q: number) => bands[name][(PERCENTILES as readonly number[]).indexOf(q)][t]
      return { median: at(50), p10: at(10), p90: at(90) }
    }
    wealthAt.push({ age, real: quantiles('totalReal'), nominal: quantiles('total') })
  }

  // Erschöpfungsalter: nie erschöpfte Pfade zählen als +∞.
  const depletion = Float64Array.from(block.depletionAge, (a) =>
    Number.isNaN(a) ? Number.POSITIVE_INFINITY : a,
  ).sort()
  const tenthPath = depletion[Math.max(0, Math.ceil(TAIL_SHARE * paths) - 1)]
  const depletedAges = depletion.filter((age) => age !== Number.POSITIVE_INFINITY)

  const terminalOf = (name: 'totalReal' | 'total') => {
    const values = new Float64Array(paths)
    for (let p = 0; p < paths; p++) values[p] = block.series[name][p * years + years - 1]
    return values.sort()
  }
  const terminal = { real: terminalOf('totalReal'), nominal: terminalOf('total') }
  const tailCount = Math.max(1, Math.ceil(TAIL_SHARE * paths))
  const tailMean = (sorted: Float64Array) => {
    let sum = 0
    for (let i = 0; i < tailCount; i++) sum += sorted[i]
    return sum / tailCount
  }

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
    expectedShortfall: { real: tailMean(terminal.real), nominal: tailMean(terminal.nominal) },
    terminalWealth: {
      real: histogramOfSorted(terminal.real),
      nominal: histogramOfSorted(terminal.nominal),
    },
    medianPath: medianPath(block),
    cagr: { nominal: medianOrNull(block.cagrNominal), real: medianOrNull(block.cagrReal) },
  }
}
