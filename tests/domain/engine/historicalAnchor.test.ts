import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { historicalUs } from '@/data/historical'
import { monteCarloPathCount, simulateBlock } from '@/domain/engine/monteCarlo'
import { summarize } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import { enginePlan } from '../../helpers/plans'

/**
 * Plausibilitätsanker (Spezifikation M2): historische Sequenzen ab 1926, alle vollständigen
 * 30-Jahres-Fenster, 50/50 Aktien/Anleihen, 4 % reale Anfangsentnahme, ohne Steuern, KV und Kosten.
 *
 * Die Spezifikation erwartet ≥ 95 % (Bengen 1994, Trinity-Studie 1998). Mit Shillers Daten
 * (10-jährige US-Staatsanleihen, Jahre von Januar bis Januar) ergeben sich 65 von 71 Fenstern
 * (91,5 %); die Ausfälle sind die Startjahre 1964–1969. Eine unabhängige Nachrechnung bestätigt den
 * Wert; je nach Startmonat der Jahreskonvention liegt er zwischen 91,5 % und 94,4 %. Bengen nutzte
 * mittelfristige Staatsanleihen, die Trinity-Studie langfristige Unternehmensanleihen. Das Ergebnis
 * ist als Anker akzeptiert; Einordnung in docs/ASSUMPTIONS.md (A26).
 */
function anchorPlan(rate: number): RetirementPlan {
  return enginePlan((p) => {
    p.household.currentAge = 65
    p.household.retirementAge = 65
    p.household.planningHorizonAge = 94 // 30 Entnahmejahre einschließlich Horizontjahr
    p.portfolio.totalValue = 1_000_000
    p.savings.yearlyNet = 0
    p.spending.netConsumption = rate * 1_000_000
    p.spending.minimumAcceptableConsumption = rate * 1_000_000
    p.strategy = { type: 'fixed', equity: 0.5, cash: 0 }
    p.rebalancing = { band: 0, taxAware: false }
    p.market.type = 'historical-sequence'
    p.market.equity.ter = 0
    p.market.bonds.ter = 0
    p.market.bootstrap = { meanBlockLength: 5, fromYear: 1926 }
  })
}

const lastYear = historicalUs.rows[historicalUs.rows.length - 1].year
/** Startjahre 1926 bis zum letzten Jahr mit vollständigem 30-Jahres-Fenster */
const completeWindows = lastYear - 29 - 1926 + 1

describe('Plausibilitätsanker Bengen/Trinity', () => {
  it('erzeugt ab 1926 je Startjahr einen Pfad', () => {
    expect(monteCarloPathCount(anchorPlan(0.04), ctx)).toBe(lastYear - 1926 + 1)
    expect(completeWindows).toBe(71)
  })

  it('4 %: 65 von 71 Fenstern erfolgreich, Ausfälle nur 1964–1969 und erst ab Jahr 26', () => {
    const plan = anchorPlan(0.04)
    const block = simulateBlock(plan, 0, completeWindows, ctx)
    const summary = summarize(plan, block)
    expect(summary.successRate).toBeCloseTo(65 / 71, 12)
    // Größenordnung der Literatur, aber unter der Spezifikationsschwelle von 95 %
    expect(summary.successRate).toBeGreaterThan(0.9)

    const failedStartYears = Array.from(block.failureYears)
      .map((f, p) => (f > 0 ? 1926 + p : null))
      .filter((y) => y !== null)
    expect(failedStartYears).toEqual([1964, 1965, 1966, 1967, 1968, 1969])

    for (const startYear of failedStartYears) {
      const p = startYear - 1926
      const firstFailure = Array.from(
        block.series.shortfallReal.subarray(p * block.years, (p + 1) * block.years),
      ).findIndex((s) => s > 0)
      expect(firstFailure + 1).toBeGreaterThanOrEqual(26)
    }
  })

  it('3,9 %: mindestens 95 % der Fenster erfolgreich', () => {
    const plan = anchorPlan(0.039)
    const summary = summarize(plan, simulateBlock(plan, 0, completeWindows, ctx))
    expect(summary.successRate).toBeGreaterThanOrEqual(0.95)
  })
})
