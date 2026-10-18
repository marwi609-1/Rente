import type { RetirementPlan } from '../model/types'
import {
  consumptionDrivesRule,
  minimumRatio,
  withNetConsumption,
  withRetirementAge,
} from './planVariants'

/** Pfadzahl der Suchen (Spezifikation Abschnitt 11); bestätigt wird mit der vollen Pfadzahl. */
export const SEARCH_PATHS = 2_000

/** Raster der sicheren Entnahme in Euro (heutige Kaufkraft). */
export const CONSUMPTION_STEP = 100

/** Höchstens so viele Verdopplungen bei der Suche einer oberen Schranke. */
const MAX_DOUBLINGS = 30

/**
 * Erfolgsquote (fester Horizont) eines validierten Plans auf den ersten `paths` Pfaden. Gleicher
 * Seed und gleiche Pfadindizes ergeben dieselben Renditepfade (Common Random Numbers).
 */
export type SuccessEvaluator = (plan: RetirementPlan, paths: number) => Promise<number>

export interface SearchOptions {
  /** Ziel-Erfolgsquote */
  target: number
  /** volle Pfadzahl des Laufs (bei historischen Sequenzen die Zahl der Startjahre) */
  fullPaths: number
  searchPaths?: number
}

/**
 * Größtes k zwischen `lo` (erfüllt) und `hi` (nicht erfüllt) mit erfülltem Kriterium; Bisektion
 * über ganze Zahlen unter der Annahme, dass das Kriterium mit k nur einmal kippt.
 */
async function largestFeasible(
  feasible: (k: number) => Promise<boolean>,
  lo: number,
  hi: number,
): Promise<number> {
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await feasible(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** Kleinstes k zwischen `lo` (nicht erfüllt) und `hi` (erfüllt) mit erfülltem Kriterium. */
async function smallestFeasible(
  feasible: (k: number) => Promise<boolean>,
  lo: number,
  hi: number,
): Promise<number> {
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await feasible(mid)) hi = mid
    else lo = mid
  }
  return hi
}

export type SafeWithdrawalResult =
  | {
      applicable: false
    }
  | {
      applicable: true
      /** höchster Netto-Konsum p. a. im 100-€-Raster; `null`, wenn schon 100 € das Ziel verfehlen */
      netConsumption: number | null
      /** Erfolgsquote dort mit voller Pfadzahl */
      successRate: number | null
      /** mitgeführtes Verhältnis Mindestkonsum / Netto-Konsum */
      minimumRatio: number
      searchPaths: number
      fullPaths: number
    }

/**
 * Sichere Entnahme (Spezifikation Abschnitt 11): höchster Netto-Konsum, bei dem die Erfolgsquote die
 * Ziel-Erfolgsquote erreicht. Bisektion im 100-€-Raster auf den ersten 2.000 Pfaden, danach
 * Bestätigung mit der vollen Pfadzahl; verfehlt der Wert dort das Ziel, wird mit voller Pfadzahl
 * unterhalb weitergesucht. Nur für Regeln, deren Konsumhöhe der Netto-Konsum bestimmt.
 */
export async function findSafeWithdrawal(
  plan: RetirementPlan,
  evaluate: SuccessEvaluator,
  options: SearchOptions,
): Promise<SafeWithdrawalResult> {
  if (!consumptionDrivesRule(plan)) return { applicable: false }
  const { target, fullPaths } = options
  const searchPaths = Math.min(options.searchPaths ?? SEARCH_PATHS, fullPaths)
  const cache = new Map<string, number>()
  const rate = async (k: number, paths: number) => {
    const key = `${k}/${paths}`
    let value = cache.get(key)
    if (value === undefined) {
      // Konsum 0 ist ohne Mindestkonsum stets erfolgreich.
      value = k === 0 ? 1 : await evaluate(withNetConsumption(plan, k * CONSUMPTION_STEP), paths)
      cache.set(key, value)
    }
    return value
  }
  const feasibleWith = (paths: number) => async (k: number) => (await rate(k, paths)) >= target

  // obere Schranke: verdoppeln, bis das Ziel verfehlt wird
  let lo = 0
  let hi = Math.max(1, Math.ceil(plan.spending.netConsumption / CONSUMPTION_STEP))
  for (let i = 0; i < MAX_DOUBLINGS && (await feasibleWith(searchPaths)(hi)); i++) {
    lo = hi
    hi *= 2
  }
  let k = (await feasibleWith(searchPaths)(hi))
    ? hi
    : await largestFeasible(feasibleWith(searchPaths), lo, hi)
  if (searchPaths < fullPaths && !(await feasibleWith(fullPaths)(k))) {
    k = await largestFeasible(feasibleWith(fullPaths), 0, k)
  }
  return {
    applicable: true,
    netConsumption: k > 0 ? k * CONSUMPTION_STEP : null,
    successRate: k > 0 ? await rate(k, fullPaths) : null,
    minimumRatio: minimumRatio(plan),
    searchPaths,
    fullPaths,
  }
}

export interface FireResult {
  /** Ziel beim gewählten Ruhestandsalter erreicht */
  reached: boolean
  retirementAge: number
  /** Erfolgsquote beim gewählten Ruhestandsalter (volle Pfadzahl) */
  successRate: number
  /** frühestes Ausstiegsalter mit erreichtem Ziel; `null`, wenn bis zum Horizont keines */
  earliestAge: number | null
  earliestSuccessRate: number | null
}

/**
 * FIRE-Status (Spezifikation Abschnitt 11): „erreicht“, wenn die Erfolgsquote beim gewählten
 * Ruhestandsalter das Ziel erreicht; sonst das früheste spätere Ausstiegsalter (ganze Jahre bis zum
 * Horizont), bei dem das zutrifft. Bisektion auf 2.000 Pfaden, Bestätigung mit voller Pfadzahl.
 */
export async function findFireAge(
  plan: RetirementPlan,
  evaluate: SuccessEvaluator,
  options: SearchOptions & { successRate: number },
): Promise<FireResult> {
  const { target, fullPaths, successRate } = options
  const chosen = plan.household.retirementAge
  const base = { retirementAge: chosen, successRate }
  if (successRate >= target) {
    return { ...base, reached: true, earliestAge: chosen, earliestSuccessRate: successRate }
  }
  const searchPaths = Math.min(options.searchPaths ?? SEARCH_PATHS, fullPaths)
  const horizon = plan.household.planningHorizonAge
  const rate = (age: number, paths: number) => evaluate(withRetirementAge(plan, age), paths)
  const feasible = async (age: number) => (await rate(age, searchPaths)) >= target
  const none = { ...base, reached: false, earliestAge: null, earliestSuccessRate: null }
  if (chosen >= horizon || !(await feasible(horizon))) return none

  let age = await smallestFeasible(feasible, chosen, horizon)
  for (; age <= horizon; age++) {
    const full = await rate(age, fullPaths)
    if (full >= target) {
      return { ...base, reached: false, earliestAge: age, earliestSuccessRate: full }
    }
  }
  return none
}
