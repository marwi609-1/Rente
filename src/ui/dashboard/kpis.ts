import type { MonteCarloSummary, ShortfallStats } from '@/domain/engine/summary'
import type { RetirementPlan } from '@/domain/model/types'
import { formatEuro, formatNumber, formatPercent } from '@/utils/format'

export interface KpiDetail {
  label: string
  value: string
}

export interface KpiCardModel {
  id: 'success' | 'wealth' | 'depletion' | 'shortfall' | 'expected-shortfall' | 'cagr'
  title: string
  /** Definition der Kennzahl für den Hilfetext */
  help: string
  value: string
  caption: string
  details: KpiDetail[]
  status?: { tone: 'success' | 'warning'; text: string }
}

export interface KpiView {
  /** Beträge in Euro von heute statt nominal */
  real: boolean
  /** sterblichkeitsgewichtete statt Horizont-Sicht für Erfolgsquote und Fehlbetrag */
  mortalityWeighted: boolean
}

const share = (count: number, total: number) => formatPercent(total > 0 ? count / total : 0, 1)

function successCard(s: MonteCarloSummary, plan: RetirementPlan, view: KpiView): KpiCardModel {
  const horizon = plan.household.planningHorizonAge
  const primary = view.mortalityWeighted
    ? { rate: s.mortalityWeighted.successRate, se: s.mortalityWeighted.successStdError }
    : { rate: s.successRate, se: s.successStdError }
  const target = plan.simulation.successTargetRate
  const reached = primary.rate >= target
  return {
    id: 'success',
    title: 'Erfolgsquote',
    help: 'Anteil der Pfade ohne Fehljahr: Der finanzierte Netto-Konsum liegt in jedem Ruhestandsjahr mindestens beim Mindestkonsum. Sterblichkeitsgewichtet zählen nur Jahre bis zum gezogenen Sterbealter. Der Standardfehler √(p(1−p)/N) gibt die Unsicherheit durch die endliche Pfadzahl an.',
    value: formatPercent(primary.rate, 1),
    caption: view.mortalityWeighted
      ? 'sterblichkeitsgewichtet'
      : `fester Horizont bis ${horizon} Jahre`,
    details: [
      {
        label: 'Standardfehler',
        value: `± ${formatNumber(primary.se * 100, 1)} Prozentpunkte`,
      },
      view.mortalityWeighted
        ? { label: `Fester Horizont bis ${horizon}`, value: formatPercent(s.successRate, 1) }
        : {
            label: 'Sterblichkeitsgewichtet',
            value: formatPercent(s.mortalityWeighted.successRate, 1),
          },
      { label: 'Pfade', value: formatNumber(s.paths) },
    ],
    status: {
      tone: reached ? 'success' : 'warning',
      text: `Ziel ${formatPercent(target, 0)} ${reached ? 'erreicht' : 'verfehlt'}`,
    },
  }
}

function wealthCard(s: MonteCarloSummary, view: KpiView): KpiCardModel {
  const unit = view.real ? 'Euro von heute' : 'nominal'
  const ages = s.wealthAt.map((w) => w.age).join(' / ')
  const first = s.wealthAt[0]
  const quantiles = (w: MonteCarloSummary['wealthAt'][number]) => (view.real ? w.real : w.nominal)
  return {
    id: 'wealth',
    title: ages ? `Vermögen mit ${ages}` : 'Vermögen mit 90 / 95',
    help: 'Depotwert am Ende des Jahres, in dem das Alter erreicht wird: Median sowie 10. und 90. Perzentil über alle Pfade. Liegt das Alter nach dem Planungshorizont, entfällt der Wert.',
    value: first ? formatEuro(quantiles(first).median) : '–',
    caption: first ? `Median mit ${first.age}, ${unit}` : 'Planungshorizont vor dem 90. Lebensjahr',
    details: s.wealthAt.flatMap((w, k) => [
      ...(k > 0 ? [{ label: `Median mit ${w.age}`, value: formatEuro(quantiles(w).median) }] : []),
      {
        label: `10.–90. Perzentil mit ${w.age}`,
        value: `${formatEuro(quantiles(w).p10)} – ${formatEuro(quantiles(w).p90)}`,
      },
    ]),
  }
}

function depletionCard(s: MonteCarloSummary): KpiCardModel {
  const depleted = s.paths - s.neverDepleted
  return {
    id: 'depletion',
    title: 'Frühester Kapitalverzehr',
    help: 'Alter, bis zu dem 10 % der Pfade ihr Depot aufgebraucht haben (10. Perzentil des Erschöpfungsalters). „Nicht erreicht“: Weniger als 10 % der Pfade erschöpfen das Depot bis zum Horizont.',
    value: s.earliestDepletionAge === null ? 'nicht erreicht' : `${s.earliestDepletionAge} Jahre`,
    caption: '10 % der Pfade haben ihr Depot bis zu diesem Alter aufgebraucht',
    details: [
      {
        label: 'Pfade mit erschöpftem Depot',
        value: `${formatNumber(depleted)} (${share(depleted, s.paths)})`,
      },
    ],
  }
}

function shortfallCard(s: MonteCarloSummary, view: KpiView): KpiCardModel {
  const stats: ShortfallStats = view.mortalityWeighted ? s.mortalityWeighted.shortfall : s.shortfall
  const none = stats.failedPaths === 0
  return {
    id: 'shortfall',
    title: 'Fehlbetrag',
    help: 'Kumulierte Lücke zwischen Mindestkonsum und finanziertem Konsum über alle Fehljahre eines gescheiterten Pfades, in Euro von heute (Summen über Jahrzehnte sind nur real vergleichbar). Median und 90. Perzentil über die gescheiterten Pfade, dazu deren mittlere Zahl an Fehljahren.',
    value: none ? 'keine Fehljahre' : formatEuro(stats.medianCumulativeReal ?? 0),
    caption: none
      ? 'kein Pfad unterschreitet den Mindestkonsum'
      : 'Median über die gescheiterten Pfade, Euro von heute',
    details: none
      ? []
      : [
          { label: '90. Perzentil', value: formatEuro(stats.p90CumulativeReal ?? 0) },
          {
            label: 'Fehljahre im Mittel',
            value: formatNumber(stats.meanFailureYears ?? 0, 1),
          },
          {
            label: 'Gescheiterte Pfade',
            value: `${formatNumber(stats.failedPaths)} (${share(stats.failedPaths, s.paths)})`,
          },
        ],
  }
}

function expectedShortfallCard(
  s: MonteCarloSummary,
  plan: RetirementPlan,
  view: KpiView,
): KpiCardModel {
  return {
    id: 'expected-shortfall',
    title: 'Expected Shortfall',
    help: 'Mittelwert des Endvermögens im Horizontjahr über die schlechtesten 10 % der Pfade. Ein Wert nahe 0 heißt: In den ungünstigsten Verläufen ist das Depot am Ende aufgebraucht.',
    value: formatEuro(view.real ? s.expectedShortfall.real : s.expectedShortfall.nominal),
    caption: `Endvermögen mit ${plan.household.planningHorizonAge}, schlechteste 10 % der Pfade, ${view.real ? 'Euro von heute' : 'nominal'}`,
    details: [],
  }
}

function cagrCard(s: MonteCarloSummary, view: KpiView): KpiCardModel {
  const fmt = (v: number | null) => (v === null ? '–' : formatPercent(v, 2))
  return {
    id: 'cagr',
    title: 'Portfolio-Rendite p. a.',
    help: 'Median der annualisierten Rendite je Pfad (CAGR) nach Kosten, über die Jahre mit investiertem Kapital; real nach Abzug der Inflation des Pfades.',
    value: fmt(view.real ? s.cagr.real : s.cagr.nominal),
    caption: `Median, ${view.real ? 'real' : 'nominal'}`,
    details: [
      {
        label: view.real ? 'Nominal' : 'Real',
        value: fmt(view.real ? s.cagr.nominal : s.cagr.real),
      },
    ],
  }
}

/** Kennzahlen des Dashboards (Spezifikation Abschnitt 11) in der gewählten Sicht. */
export function buildKpis(
  summary: MonteCarloSummary,
  plan: RetirementPlan,
  view: KpiView,
): KpiCardModel[] {
  return [
    successCard(summary, plan, view),
    wealthCard(summary, view),
    depletionCard(summary),
    shortfallCard(summary, view),
    expectedShortfallCard(summary, plan, view),
    cagrCard(summary, view),
  ]
}
