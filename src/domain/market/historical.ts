import { z } from 'zod'

import type { MarketModel } from '../model/types'

/** Eine historische Jahreszeile: nominale einfache Renditen und Inflation des Jahres. */
export interface HistoricalRow {
  year: number
  equity: number
  bonds: number
  cash: number
  inflation: number
}

export interface HistoricalData {
  rows: HistoricalRow[]
}

const rate = z.number().gt(-1).lt(10)

/** Validiert die Datendatei: lückenlose, aufsteigende Jahre und Renditen > −100 %. */
export const historicalDataSchema = z.object({
  rows: z
    .array(
      z.object({
        year: z.number().int(),
        equity: rate,
        bonds: rate,
        cash: rate,
        inflation: rate,
      }),
    )
    .min(1)
    .superRefine((rows, ctx) => {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].year !== rows[i - 1].year + 1) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'year'],
            message: 'Die historischen Jahre müssen lückenlos aufsteigen.',
          })
          return
        }
      }
    }),
})

/**
 * Datenfenster für die historischen Modelle: `market.bootstrap.fromYear`/`toYear`, sonst der gesamte
 * Datenbestand. Wirft einen RangeError, wenn das Fenster außerhalb der Daten liegt.
 */
export function historicalWindow(market: MarketModel, data: HistoricalData): HistoricalRow[] {
  const first = data.rows[0].year
  const last = data.rows[data.rows.length - 1].year
  const from = market.bootstrap?.fromYear ?? first
  const to = market.bootstrap?.toYear ?? last
  if (from < first || to > last || from > to) {
    throw new RangeError(
      `Der historische Zeitraum ${from}–${to} liegt außerhalb der verfügbaren Daten (${first}–${last}).`,
    )
  }
  return data.rows.slice(from - first, to - first + 1)
}
