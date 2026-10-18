// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import KpiCards from '@/ui/dashboard/KpiCards.vue'
import { createAppVuetify } from '@/ui/vuetify'
import { formatEuro, formatPercent } from '@/utils/format'
import { smallRun } from '../helpers/summary'

const run = smallRun()

function mountCards(
  props: Partial<{ real: boolean; mortalityWeighted: boolean }> = {},
  fixture = run,
) {
  return mount(KpiCards, {
    props: {
      summary: fixture.summary,
      plan: fixture.plan,
      real: props.real ?? true,
      mortalityWeighted: props.mortalityWeighted ?? false,
    },
    global: { plugins: [createAppVuetify()] },
  })
}

const card = (wrapper: ReturnType<typeof mountCards>, id: string) =>
  wrapper.get(`[data-testid="kpi-${id}"]`)
const value = (wrapper: ReturnType<typeof mountCards>, id: string) =>
  card(wrapper, id).get('[data-testid="kpi-value"]').text()

describe('KPI-Karten', () => {
  it('zeigt alle Kennzahlen aus Abschnitt 11 außer denen von M6', () => {
    const wrapper = mountCards()
    for (const id of [
      'success',
      'wealth',
      'depletion',
      'shortfall',
      'expected-shortfall',
      'cagr',
    ]) {
      expect(wrapper.find(`[data-testid="kpi-${id}"]`).exists()).toBe(true)
    }
  })

  it('zeigt die Erfolgsquote mit Standardfehler und Zielvergleich', () => {
    const wrapper = mountCards()
    const { summary, plan } = run
    expect(value(wrapper, 'success')).toBe(formatPercent(summary.successRate, 1))
    expect(card(wrapper, 'success').text()).toContain('Standardfehler')
    const reached = summary.successRate >= plan.simulation.successTargetRate
    expect(card(wrapper, 'success').get('[data-testid="kpi-status"]').text()).toBe(
      `Ziel ${formatPercent(0.9, 0)} ${reached ? 'erreicht' : 'verfehlt'}`,
    )
  })

  it('wechselt zur sterblichkeitsgewichteten Sicht', () => {
    const wrapper = mountCards({ mortalityWeighted: true })
    const { summary } = run
    expect(summary.mortalityWeighted.successRate).not.toBe(summary.successRate)
    expect(value(wrapper, 'success')).toBe(formatPercent(summary.mortalityWeighted.successRate, 1))
    expect(card(wrapper, 'success').get('[data-testid="kpi-caption"]').text()).toBe(
      'sterblichkeitsgewichtet',
    )
  })

  it('zeigt Vermögen und Expected Shortfall real oder nominal', () => {
    const { summary } = run
    const real = mountCards({ real: true })
    const nominal = mountCards({ real: false })
    expect(value(real, 'wealth')).toBe(formatEuro(summary.wealthAt[0].real.median))
    expect(value(nominal, 'wealth')).toBe(formatEuro(summary.wealthAt[0].nominal.median))
    expect(value(nominal, 'expected-shortfall')).toBe(formatEuro(summary.expectedShortfall.nominal))
    expect(card(real, 'wealth').text()).toContain('Euro von heute')
    expect(card(nominal, 'wealth').text()).toContain('nominal')
  })

  it('meldet „nicht erreicht“ und „keine Fehljahre“, wenn kein Pfad scheitert', () => {
    const safe = smallRun((p) => {
      p.spending.netConsumption = 20_000
      p.spending.minimumAcceptableConsumption = 20_000
    })
    const wrapper = mountCards({}, safe)
    expect(value(wrapper, 'depletion')).toBe('nicht erreicht')
    expect(value(wrapper, 'shortfall')).toBe('keine Fehljahre')
    expect(card(wrapper, 'success').get('[data-testid="kpi-status"]').text()).toBe(
      `Ziel ${formatPercent(0.9, 0)} erreicht`,
    )
  })

  it('lässt das Vermögen mit 90 bei kürzerem Horizont weg', () => {
    const short = smallRun((p) => (p.household.planningHorizonAge = 85))
    const wrapper = mountCards({}, short)
    expect(value(wrapper, 'wealth')).toBe('–')
    expect(card(wrapper, 'wealth').text()).toContain('Planungshorizont vor dem 90. Lebensjahr')
  })

  it('zeigt Fehlbeträge gescheiterter Pfade in Euro von heute', () => {
    const risky = smallRun((p) => (p.spending.netConsumption = 110_000))
    const wrapper = mountCards({ real: false }, risky)
    const stats = risky.summary.shortfall
    expect(stats.failedPaths).toBeGreaterThan(0)
    expect(value(wrapper, 'shortfall')).toBe(formatEuro(stats.medianCumulativeReal!))
    expect(card(wrapper, 'shortfall').text()).toContain('Euro von heute')
  })
})

describe('KPI-Karten sichere Entnahme und FIRE-Status', () => {
  const mountWith = (extras: InstanceType<typeof KpiCards>['$props']['extras']) =>
    mount(KpiCards, {
      props: { summary: run.summary, plan: run.plan, real: true, mortalityWeighted: false, extras },
      global: { plugins: [createAppVuetify()] },
    })
  const valueOf = (wrapper: ReturnType<typeof mountWith>, id: string) =>
    wrapper.get(`[data-testid="kpi-${id}"] [data-testid="kpi-value"]`).text()

  it('zeigt laufende Suchen an', () => {
    const wrapper = mountWith({ status: 'running', error: null, safeWithdrawal: null, fire: null })
    expect(valueOf(wrapper, 'safe-withdrawal')).toBe('wird berechnet …')
    expect(valueOf(wrapper, 'fire')).toBe('wird berechnet …')
  })

  it('zeigt sichere Entnahme und frühestes Ausstiegsalter', () => {
    const wrapper = mountWith({
      status: 'done',
      error: null,
      safeWithdrawal: {
        applicable: true,
        netConsumption: 61_300,
        successRate: 0.904,
        minimumRatio: 0.7,
        searchPaths: 2_000,
        fullPaths: 10_000,
      },
      fire: {
        reached: false,
        retirementAge: 57,
        successRate: 0.42,
        earliestAge: 63,
        earliestSuccessRate: 0.91,
      },
    })
    expect(valueOf(wrapper, 'safe-withdrawal')).toBe(`${formatEuro(61_300)} p. a.`)
    expect(wrapper.get('[data-testid="kpi-safe-withdrawal"]').text()).toContain(
      formatPercent(0.904, 1),
    )
    expect(valueOf(wrapper, 'fire')).toBe('ab 63 Jahren')
    expect(wrapper.get('[data-testid="kpi-fire"] [data-testid="kpi-status"]').text()).toContain(
      'zu früh',
    )
  })

  it('erklärt nicht anwendbare und nicht erreichbare Ergebnisse', () => {
    const wrapper = mountWith({
      status: 'done',
      error: null,
      safeWithdrawal: { applicable: false },
      fire: {
        reached: false,
        retirementAge: 57,
        successRate: 0.1,
        earliestAge: null,
        earliestSuccessRate: null,
      },
    })
    expect(valueOf(wrapper, 'safe-withdrawal')).toBe('–')
    expect(wrapper.get('[data-testid="kpi-safe-withdrawal"]').text()).toContain(
      'Nur für feste reale Entnahme',
    )
    expect(valueOf(wrapper, 'fire')).toBe('nicht erreichbar')
  })

  it('meldet einen erreichten FIRE-Status', () => {
    const wrapper = mountWith({
      status: 'done',
      error: null,
      safeWithdrawal: null,
      fire: {
        reached: true,
        retirementAge: 57,
        successRate: 0.93,
        earliestAge: 57,
        earliestSuccessRate: 0.93,
      },
    })
    expect(valueOf(wrapper, 'fire')).toBe('erreicht')
  })
})
