import { createLongevityModel } from '../longevity/longevity'
import { createReturnGenerator, createReturnPath } from '../market/generators'
import type { RetirementPlan } from '../model/types'
import type { EngineContext } from './context'
import { createPathSimulator } from './path'
import { simulationYears } from './timeline'

/** Zahl erfolgreicher Pfade eines Pfadbereichs, ohne die Jahresreihen zu speichern. */
export interface SuccessCount {
  paths: number
  /** ohne Fehljahr bis zum Horizont */
  succeeded: number
  /** ohne Fehljahr bis zum gezogenen Sterbealter */
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
  for (let p = start; p < end; p++) {
    generator.fill(p, returns)
    let firstFailureAge = Number.POSITIVE_INFINITY
    simulate(returns, (row) => {
      if (row.shortfall > 0 && row.age < firstFailureAge) firstFailureAge = row.age
    })
    const survived = firstFailureAge === Number.POSITIVE_INFINITY
    if (survived) succeeded++
    if (survived || firstFailureAge > longevity.deathAge(p)) mortalitySucceeded++
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
