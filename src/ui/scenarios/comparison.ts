import type { ComparedScenario } from '@/stores/scenarios'
import { marketModelLabels, strategyLabels, withdrawalRuleLabels } from '@/ui/labels'
import { formatEuro, formatNumber, formatPercent } from '@/utils/format'

export interface ComparisonRow {
  label: string
  values: string[]
}

/** Eingaben und Kennzahlen der verglichenen Szenarien, je Zeile eine Größe. */
export function comparisonRows(items: readonly ComparedScenario[], real: boolean): ComparisonRow[] {
  const row = (label: string, value: (item: ComparedScenario) => string): ComparisonRow => ({
    label,
    values: items.map(value),
  })
  const wealth = (item: ComparedScenario, age: number) => {
    const w = item.summary.wealthAt.find((x) => x.age === age)
    return w ? formatEuro(real ? w.real.median : w.nominal.median) : '–'
  }
  return [
    row('Ruhestand ab', (i) => `${i.plan.household.retirementAge} Jahre`),
    row('Netto-Konsum p. a.', (i) => formatEuro(i.plan.spending.netConsumption)),
    row('Entnahmeregel', (i) => withdrawalRuleLabels[i.plan.spending.rule.type]),
    row('Strategie', (i) => strategyLabels[i.plan.strategy.type]),
    row('Marktmodell', (i) => marketModelLabels[i.plan.market.type]),
    row('Pfade', (i) => formatNumber(i.summary.paths)),
    row(
      'Erfolgsquote',
      (i) =>
        `${formatPercent(i.summary.successRate, 1)} ± ${formatNumber(i.summary.successStdError * 100, 1)}`,
    ),
    row('Erfolgsquote sterblichkeitsgewichtet', (i) =>
      formatPercent(i.summary.mortalityWeighted.successRate, 1),
    ),
    row('Vermögen mit 90 (Median)', (i) => wealth(i, 90)),
    row('Vermögen mit 95 (Median)', (i) => wealth(i, 95)),
    row('Frühester Kapitalverzehr', (i) =>
      i.summary.earliestDepletionAge === null
        ? 'nicht erreicht'
        : `${i.summary.earliestDepletionAge} Jahre`,
    ),
    row('Fehlbetrag (Median, real)', (i) =>
      i.summary.shortfall.medianCumulativeReal === null
        ? 'keine Fehljahre'
        : formatEuro(i.summary.shortfall.medianCumulativeReal),
    ),
    row('Expected Shortfall', (i) =>
      formatEuro(real ? i.summary.expectedShortfall.real : i.summary.expectedShortfall.nominal),
    ),
    row(`Portfolio-Rendite p. a. (${real ? 'real' : 'nominal'})`, (i) => {
      const v = real ? i.summary.cagr.real : i.summary.cagr.nominal
      return v === null ? '–' : formatPercent(v, 2)
    }),
  ]
}
