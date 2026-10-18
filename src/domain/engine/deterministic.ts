import { deterministicReturnPath } from '../market/deterministic'
import { parsePlan } from '../model/validation'
import type { EngineContext } from './context'
import { simulatePath } from './path'
import { simulationYears } from './timeline'
import type { YearResult } from './types'

/**
 * Deterministischer Referenzpfad eines Plans: validiert die Eingabe und simuliert mit der
 * geometrischen Rendite jeder Reihe. Ergebnis nominal; Umrechnung siehe `realNominal.ts`.
 */
export function runDeterministic(input: unknown, ctx: EngineContext): YearResult[] {
  const plan = parsePlan(input)
  return simulatePath(
    plan,
    deterministicReturnPath(plan.market, simulationYears(plan.household)),
    ctx,
  )
}
