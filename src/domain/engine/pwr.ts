import { createReturnGenerator, createReturnPath } from '../market/generators'
import { historicalWindow } from '../market/historical'
import type { RetirementPlan } from '../model/types'
import { profileFactor } from '../withdrawal/profile'
import type { EngineContext } from './context'
import { histogramOfSorted, type Histogram } from './histogram'
import { createPathSimulator } from './path'
import { percentileOfSorted } from './percentile'
import { withFixedRealConsumption } from './planVariants'
import { PERCENTILES } from './summary'
import { simulationYears } from './timeline'

/** Genauigkeit der PWR in Euro. */
const PWR_TOLERANCE = 0.5
const MAX_ITERATIONS = 60
const MAX_DOUBLINGS = 40

/**
 * Perfect Withdrawal Rate je Pfad (Spezifikation Abschnitt 11): die konstante reale Entnahme
 * (feste reale Entnahme, Netto-Konsum in heutiger Kaufkraft), mit der das Depot genau zum Horizont
 * bis auf das Zielvermögen aufgebraucht ist. Gelöst wird g(c) = reales Endvermögen − Zielvermögen
 * − Summe der realen ungedeckten Konsumbeträge = 0 mit dem Illinois-Verfahren; g fällt in c und ist
 * stetig bis auf Rundungssprünge der Steuer. Reicht das Depot schon ohne Entnahme nicht für das
 * Zielvermögen, ist die PWR 0.
 */
export function perfectWithdrawalRates(
  plan: RetirementPlan,
  start: number,
  end: number,
  ctx: EngineContext,
): Float64Array {
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
  const returns = createReturnPath(years)
  const { retirementAge } = plan.household
  const profile = plan.spending.ageProfile
  const target = plan.spending.targetWealth

  const balance = (c: number): number => {
    const simulate = createPathSimulator(withFixedRealConsumption(plan, c), ctx)
    let terminal = 0
    let unfunded = 0
    simulate(returns, (row) => {
      if (row.age >= retirementAge) {
        const wanted = c * profileFactor(profile, row.age)
        unfunded += Math.max(0, wanted - row.netConsumption / row.inflationIndex)
      }
      terminal = row.total / row.inflationIndexEnd
    })
    return terminal - target - unfunded
  }

  const out = new Float64Array(end - start)
  for (let p = start; p < end; p++) {
    generator.fill(p, returns)
    out[p - start] = solve(balance, Math.max(plan.spending.netConsumption, 1_000))
  }
  return out
}

/** Nullstelle der fallenden Funktion g mit g(0) > 0 per Illinois-Verfahren. */
function solve(g: (c: number) => number, guess: number): number {
  let lo = 0
  let glo = g(0)
  if (glo <= 0) return 0
  let hi = guess
  let ghi = g(hi)
  for (let i = 0; i < MAX_DOUBLINGS && ghi > 0; i++) {
    lo = hi
    glo = ghi
    hi *= 2
    ghi = g(hi)
  }
  if (ghi > 0) return hi
  let side = 0
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > PWR_TOLERANCE; i++) {
    const c = (lo * ghi - hi * glo) / (ghi - glo)
    const gc = g(c)
    if (Math.abs(gc) < PWR_TOLERANCE) return c
    if (gc > 0) {
      lo = c
      glo = gc
      if (side === 1) ghi /= 2
      side = 1
    } else {
      hi = c
      ghi = gc
      if (side === -1) glo /= 2
      side = -1
    }
  }
  return (lo + hi) / 2
}

export interface PwrSummary {
  paths: number
  /** Perzentile der PWR in Euro p. a. (heutige Kaufkraft), Reihenfolge wie `PERCENTILES` */
  percentiles: { p: number; amount: number }[]
  /** Bezugsgröße der Raten: heutiger Depotwert */
  portfolioValue: number
  /** Zielvermögen am Horizont, heutige Kaufkraft */
  targetWealth: number
  /** Netto-Konsum laut Plan als Vergleichsgröße, heutige Kaufkraft */
  plannedConsumption: number
  histogram: Histogram
  /** PWR je historischem Startjahr (nur `historical-sequence`), sonst `null` */
  byStartYear: { year: number; amount: number }[] | null
  /**
   * Erstes Startjahr, dessen Folge über das Datenende hinausreicht und zyklisch mit dem ersten Jahr
   * des Fensters fortgesetzt wird (A22); `null`, wenn keines
   */
  cyclicFromYear: number | null
}

/**
 * Startjahre der Pfade bei historischen Sequenzen: Pfad p beginnt mit dem p-ten Jahr des
 * Datenfensters. Bei anderen Marktmodellen `null`.
 */
export function pwrStartYears(plan: RetirementPlan, ctx: EngineContext): number[] | null {
  if (plan.market.type !== 'historical-sequence') return null
  if (!ctx.historical) throw new RangeError('Für historische Marktmodelle fehlen die Daten.')
  return historicalWindow(plan.market, ctx.historical).map((row) => row.year)
}

export function summarizePwr(
  values: Float64Array,
  plan: RetirementPlan,
  startYears: readonly number[] | null = null,
): PwrSummary {
  if (startYears && startYears.length !== values.length) {
    throw new RangeError('Die Zahl der Startjahre passt nicht zur Zahl der Pfade.')
  }
  const sorted = Float64Array.from(values).sort()
  // Pfad p reicht bis zum Jahr startYears[p] + Jahre − 1; danach zyklisch (A22)
  const years = simulationYears(plan.household)
  const cyclic = startYears?.find((year) => year + years - 1 > startYears.at(-1)!)
  return {
    paths: sorted.length,
    percentiles: PERCENTILES.map((p) => ({ p, amount: percentileOfSorted(sorted, p / 100) })),
    portfolioValue: plan.portfolio.totalValue,
    targetWealth: plan.spending.targetWealth,
    plannedConsumption: plan.spending.netConsumption,
    histogram: histogramOfSorted(sorted),
    byStartYear: startYears ? startYears.map((year, p) => ({ year, amount: values[p] })) : null,
    cyclicFromYear: cyclic ?? null,
  }
}
