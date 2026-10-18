import { z } from 'zod'

/** Einjährige Sterbewahrscheinlichkeiten q_x je Geschlecht und Geburtsjahrgang. */
export interface MortalityTable {
  firstCohort: number
  lastCohort: number
  firstAge: number
  /** letztes Alter mit q_x < 1; ab lastAge + 1 gilt q = 1 */
  lastAge: number
  /** qx[Geschlecht][Jahrgang − firstCohort][Alter − firstAge] */
  qx: { m: number[][]; w: number[][] }
}

const qxRows = z.array(z.array(z.number().gt(0).lt(1)))

export const mortalityTableSchema = z
  .object({
    firstCohort: z.number().int(),
    lastCohort: z.number().int(),
    firstAge: z.number().int().min(0),
    lastAge: z.number().int(),
    qx: z.object({ m: qxRows, w: qxRows }),
  })
  .superRefine((t, ctx) => {
    const cohorts = t.lastCohort - t.firstCohort + 1
    const ages = t.lastAge - t.firstAge + 1
    for (const sex of ['m', 'w'] as const) {
      if (t.qx[sex].length !== cohorts || t.qx[sex].some((row) => row.length !== ages)) {
        ctx.addIssue({
          code: 'custom',
          path: ['qx', sex],
          message: 'Die Sterbetafel passt nicht zu den angegebenen Jahrgängen und Altern.',
        })
      }
    }
  })

/**
 * q_x eines Jahrgangs ab Alter `fromAge` bis einschließlich `lastAge`. Wirft einen RangeError, wenn
 * Jahrgang oder Alter nicht abgedeckt sind.
 */
export function cohortQx(
  table: MortalityTable,
  sex: 'm' | 'w',
  cohort: number,
  fromAge: number,
): number[] {
  if (cohort < table.firstCohort || cohort > table.lastCohort) {
    throw new RangeError(
      `Die Sterbetafel deckt den Geburtsjahrgang ${cohort} nicht ab (${table.firstCohort}–${table.lastCohort}).`,
    )
  }
  if (fromAge < table.firstAge) {
    throw new RangeError(`Die Sterbetafel beginnt erst mit dem Alter ${table.firstAge}.`)
  }
  return table.qx[sex][cohort - table.firstCohort].slice(fromAge - table.firstAge)
}
