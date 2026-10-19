import { createLongevityModel } from '../longevity/longevity'
import { createReturnGenerator, createReturnPath } from '../market/generators'
import type { RetirementPlan } from '../model/types'
import type { EngineContext } from './context'
import { createPathSimulator } from './path'
import { meetsTargetWealth } from './target'
import { simulationYears } from './timeline'

/** Zahl erfolgreicher Pfade eines Pfadbereichs, ohne die Jahresreihen zu speichern. */
export interface SuccessCount {
  paths: number
  /** ohne Fehljahr bis zum Horizont und mit Zielvermögen am Horizont */
  succeeded: number
  /** ohne Fehljahr bis zum gezogenen Sterbealter und mit Zielvermögen am Ende des Sterbejahres */
  mortalitySucceeded: number
}

/** Zählt die erfolgreichen Pfade `start` bis ausschließlich `end`. Der Plan muss validiert sein. */
export function countSuccess(
  plan: RetirementPlan,
  start: number,
  end: number,
  ctx: EngineContext,
): SuccessCount {
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
  const simulate = createPathSimulator(plan, ctx)
  const longevity = createLongevityModel(plan.household, plan.simulation.seed, ctx.mortality)
  const returns = createReturnPath(years)
  let succeeded = 0
  let mortalitySucceeded = 0
  const target = plan.spending.targetWealth
  for (let p = start; p < end; p++) {
    generator.fill(p, returns)
    const deathAge = longevity.deathAge(p)
    let firstFailureAge = Number.POSITIVE_INFINITY
    let horizonWealth = 0
    let deathWealth = 0
    simulate(returns, (row) => {
      if (row.shortfall > 0 && row.age < firstFailureAge) firstFailureAge = row.age
      horizonWealth = row.total / row.inflationIndexEnd
      if (row.age <= deathAge) deathWealth = horizonWealth
    })
    const survived = firstFailureAge === Number.POSITIVE_INFINITY
    if (survived && meetsTargetWealth(horizonWealth, target)) succeeded++
    if ((survived || firstFailureAge > deathAge) && meetsTargetWealth(deathWealth, target)) {
      mortalitySucceeded++
    }
  }
  return { paths: end - start, succeeded, mortalitySucceeded }
}

export function addCounts(a: SuccessCount, b: SuccessCount): SuccessCount {
  return {
    paths: a.paths + b.paths,
    succeeded: a.succeeded + b.succeeded,
    mortalitySucceeded: a.mortalitySucceeded + b.mortalitySucceeded,
  }
}
