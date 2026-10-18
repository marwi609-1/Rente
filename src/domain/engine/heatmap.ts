import { z } from 'zod'

import type { RetirementPlan } from '../model/types'
import { withEquityShare, withNetConsumption } from './planVariants'

/** Aktienquoten der Spalten: 0–100 % in Schritten von 10 % (Spezifikation 12.1). */
export const HEATMAP_EQUITY = Array.from({ length: 11 }, (_, i) => i / 10)

/** Pfade je Zelle (Spezifikation 12.1). */
export const HEATMAP_PATHS = 2_000

export const MAX_HEATMAP_ROWS = 25

/**
 * Zeilen der Heatmap: Entnahmerate (Netto-Konsum in Prozent des heutigen Depotwerts) oder
 * Netto-Konsum in Euro, jeweils von–bis in festen Schritten.
 */
export const heatmapConfigSchema = z
  .object({
    mode: z.enum(['rate', 'consumption']),
    from: z.number().min(0),
    to: z.number().min(0),
    step: z.number().gt(0),
  })
  .superRefine((c, ctx) => {
    if (c.to < c.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Das Ende liegt vor dem Anfang.' })
      return
    }
    if (Math.floor((c.to - c.from) / c.step + 1e-9) + 1 > MAX_HEATMAP_ROWS) {
      ctx.addIssue({
        code: 'custom',
        path: ['step'],
        message: `Höchstens ${MAX_HEATMAP_ROWS} Zeilen; bitte die Schrittweite vergrößern.`,
      })
    }
    if (c.mode === 'rate' && c.to > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Die Entnahmerate darf 100 % nicht übersteigen.',
      })
    }
  })

export type HeatmapConfig = z.infer<typeof heatmapConfigSchema>

/** Zeilenwerte von `from` bis einschließlich `to` (Rundungsrauschen der Schritte entfernt). */
export function heatmapRows(config: HeatmapConfig): number[] {
  const count = Math.floor((config.to - config.from) / config.step + 1e-9) + 1
  return Array.from({ length: count }, (_, i) =>
    Number((config.from + i * config.step).toPrecision(12)),
  )
}

/** Netto-Konsum einer Zeile; die Entnahmerate bezieht sich auf den heutigen Depotwert. */
export function heatmapConsumption(plan: RetirementPlan, config: HeatmapConfig, row: number) {
  return config.mode === 'rate' ? row * plan.portfolio.totalValue : row
}

/**
 * Plan einer Zelle: feste Allokation mit der Aktienquote der Spalte und feste reale Entnahme mit
 * dem Netto-Konsum der Zeile; der Mindestkonsum wird im Verhältnis mitgeführt.
 */
export function heatmapCellPlan(
  plan: RetirementPlan,
  config: HeatmapConfig,
  equity: number,
  row: number,
): RetirementPlan {
  const next = withEquityShare(
    withNetConsumption(plan, heatmapConsumption(plan, config, row)),
    equity,
  )
  next.spending.rule = { type: 'fixed-real' }
  return next
}

/** Erfolgsquoten je Zeile (Entnahme) und Spalte (Aktienquote). */
export interface HeatmapResult {
  config: HeatmapConfig
  equity: number[]
  rows: number[]
  /** `success[zeile][spalte]` */
  success: number[][]
  pathsPerCell: number
}
