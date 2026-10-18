// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'

import { usePlanStore } from '@/stores/plan'
import PlanOverviewView from '@/ui/views/PlanOverviewView.vue'
import { inApp, mountWithApp } from '../helpers/mount'

/** Intl setzt vor „€“ und „%“ ein geschütztes Leerzeichen. */
const normalize = (text: string) => text.replace(/ /g, ' ')

describe('Planübersicht', () => {
  it('zeigt die Eckdaten des Default-Plans im Format de-DE', async () => {
    const wrapper = await mountWithApp(inApp(PlanOverviewView))
    const text = normalize(wrapper.text())
    expect(text).toContain('1.300.000 €')
    expect(text).toContain('100.000 €')
    expect(text).toContain('Glidepath')
    expect(text).toContain('Lognormal')
    expect(text).toContain('8,0 % ± 15,0 %')
    // geometrische Rendite zu μ = 8 %, σ = 15 %
    expect(text).toContain('6,97 %')
    expect(wrapper.find('[data-testid="validation-ok"]').exists()).toBe(true)
  })

  it('listet Validierungsfehler mit Feldpfad auf', async () => {
    const pinia = createPinia()
    const wrapper = await mountWithApp(inApp(PlanOverviewView), pinia)
    const store = usePlanStore(pinia)
    store.plan.household.retirementAge = 40
    await wrapper.vm.$nextTick()
    const issues = wrapper.find('[data-testid="validation-issues"]')
    expect(issues.exists()).toBe(true)
    expect(issues.text()).toContain('household.retirementAge')
    expect(issues.text()).toContain('Ruhestandsalter')
  })

  it('weist bei historischen Marktmodellen auf Survivorship-Bias und Wechselkurse hin', async () => {
    const pinia = createPinia()
    const wrapper = await mountWithApp(inApp(PlanOverviewView), pinia)
    expect(wrapper.find('[data-testid="historical-notice"]').exists()).toBe(false)
    usePlanStore(pinia).plan.market.type = 'block-bootstrap'
    await wrapper.vm.$nextTick()
    const notice = wrapper.find('[data-testid="historical-notice"]')
    expect(notice.text()).toContain('Survivorship-Bias')
    expect(notice.text()).toContain('Wechselkurseffekte')
    expect(notice.text()).toContain('1871–2025')
  })

  it('zeigt Rentenbeginn, Zugangsfaktor, Besteuerungsanteil sowie Steuer- und KV-Einstellungen', async () => {
    const pinia = createPinia()
    const wrapper = await mountWithApp(inApp(PlanOverviewView), pinia)
    const store = usePlanStore(pinia)
    store.plan.household.startYear = 2026
    store.plan.statePension.startAge = 64
    await wrapper.vm.$nextTick()
    const text = normalize(wrapper.text())
    // 36 Monate vorzeitig: 89,2 %; Rentenbeginn 2038: Besteuerungsanteil 90,0 %
    expect(text).toContain('89,2 %')
    expect(text).toContain('90,0 %')
    expect(text).toContain('Steuern & Krankenversicherung')
    expect(text).toContain('GKV freiwillig')
    expect(text).toContain('KVdR')
    expect(text).toContain('3,20 %')
  })
})
