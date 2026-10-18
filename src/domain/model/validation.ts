import type { z } from 'zod'

import { retirementPlanSchema } from './schema'
import type { RetirementPlan } from './types'

export interface PlanIssue {
  /** Punktnotation, z. B. `household.retirementAge` oder `strategy.points.1.age` */
  path: string
  message: string
}

export type PlanValidationResult =
  { ok: true; plan: RetirementPlan } | { ok: false; issues: PlanIssue[] }

export class PlanValidationError extends Error {
  readonly issues: PlanIssue[]

  constructor(issues: PlanIssue[]) {
    super(
      `Ungültiger Plan: ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ')}`,
    )
    this.name = 'PlanValidationError'
    this.issues = issues
  }
}

function toIssues(error: z.ZodError): PlanIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

export function validatePlan(input: unknown): PlanValidationResult {
  const result = retirementPlanSchema.safeParse(input)
  return result.success
    ? { ok: true, plan: result.data }
    : { ok: false, issues: toIssues(result.error) }
}

/** Validiert und liefert den Plan; wirft {@link PlanValidationError} bei ungültiger Eingabe. */
export function parsePlan(input: unknown): RetirementPlan {
  const result = validatePlan(input)
  if (!result.ok) throw new PlanValidationError(result.issues)
  return result.plan
}
