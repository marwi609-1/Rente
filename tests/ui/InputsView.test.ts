// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'

import { validatePlan } from '@/domain/model/validation'
import { INPUT_TABS } from '@/router'
import { usePlanStore } from '@/stores/plan'
import InputsView from '@/ui/views/InputsView.vue'
import { inApp, mountWithApp } from '../helpers/mount'

let current: VueWrapper | null = null
afterEach(() => {
  current?.unmount()
  current = null
})

async function open(tab: string) {
  const pinia = createPinia()
  const { wrapper } = await mountWithApp(inApp(InputsView), pinia, `/eingaben/${tab}`)
  current = wrapper
  return { wrapper, store: usePlanStore(pinia) }
}

/** Gibt einen Text in das Feld mit dem Planpfad ein und liefert dessen Meldungen. */
async function type(wrapper: VueWrapper, path: string, text: string) {
  const field = wrapper.get(`[data-path="${path}"]`)
  await field.get('input').setValue(text)
  await flushPromises()
  return () => wrapper.get(`[data-path="${path}"]`).find('.v-messages').text()
}

describe('Eingabeformulare', () => {
  it('zeigt Fehler der zod-Validierung direkt am Feld', async () => {
    const { wrapper, store } = await open('haushalt')
    const messages = await type(wrapper, 'household.retirementAge', '40')
    expect(store.plan.household.retirementAge).toBe(40)
    expect(messages()).toBe('Das Ruhestandsalter darf nicht unter dem aktuellen Alter liegen.')
    // Der Tab zeigt die Zahl der Fehler an.
    expect(wrapper.get('[data-testid="tab-haushalt"]').text()).toContain('1')
  })

  it('übernimmt die Meldung des Schemas bei Bereichsfehlern', async () => {
    const { wrapper, store } = await open('simulation')
    const messages = await type(wrapper, 'simulation.paths', '500')
    const result = validatePlan(store.plan)
    expect(result.ok).toBe(false)
    const expected = result.ok
      ? ''
      : result.issues.find((i) => i.path === 'simulation.paths')!.message
    expect(expected).not.toBe('')
    expect(messages()).toBe(expected)
  })

  it('meldet unlesbare Zahlen und macht den Plan ungültig', async () => {
    const { wrapper, store } = await open('vermoegen')
    const messages = await type(wrapper, 'portfolio.totalValue', '1,3 Mio')
    expect(messages()).toBe('Bitte eine Zahl eingeben.')
    expect(Number.isNaN(store.plan.portfolio.totalValue)).toBe(true)
    expect(store.validation.ok).toBe(false)
  })

  it('liest deutsche Zahlenformate und Prozentangaben', async () => {
    const { wrapper, store } = await open('vermoegen')
    await type(wrapper, 'portfolio.totalValue', '1.500.000')
    await type(wrapper, 'portfolio.costBasisShare', '62,5')
    expect(store.plan.portfolio.totalValue).toBe(1_500_000)
    expect(store.plan.portfolio.costBasisShare).toBe(0.625)
    expect(store.validation.ok).toBe(true)
  })

  it('zeigt Regeln über mehrere Felder am betroffenen Feld der gewählten Variante', async () => {
    const { wrapper, store } = await open('strategie')
    store.plan.strategy = {
      type: 'bond-tent',
      startAge: 52,
      startEquity: 0.7,
      peakAge: 57,
      peakEquity: 0.4,
      endAge: 72,
      endEquity: 0.7,
      cash: 0.05,
    }
    await flushPromises()
    const messages = await type(wrapper, 'strategy.peakEquity', '80')
    expect(messages()).toBe(
      'Die Aktienquote am Tiefpunkt des Bond Tents darf nicht über Start- und Endquote liegen.',
    )
  })

  it('listet Meldungen ohne eigenes Feld oberhalb des Tabs auf', async () => {
    const { wrapper, store } = await open('markt')
    store.plan.market.correlation = [
      [1, 0.9, 0.9, 0],
      [0.9, 1, -0.9, 0],
      [0.9, -0.9, 1, 0],
      [0, 0, 0, 1],
    ]
    await flushPromises()
    expect(wrapper.text()).toContain('nicht positiv definit')
    // Die Meldung erscheint genau einmal (im Korrelationseditor, nicht zusätzlich als Sammelmeldung).
    expect(wrapper.findAll('[data-testid="unassigned-issue"]')).toHaveLength(0)
  })

  it.each(INPUT_TABS)('zeigt im Tab %s jedes Feld mit Hilfetext', async (tab) => {
    const { wrapper } = await open(tab)
    // Der Tab „Weitere Einkünfte“ beginnt leer.
    if (tab === 'einkuenfte') await wrapper.get('[data-testid="income-add"]').trigger('click')
    const fields = wrapper.findAll('[data-path]')
    expect(fields.length).toBeGreaterThanOrEqual(1)
    for (const field of fields) {
      expect(field.find('[aria-label^="Hilfe: "]').exists()).toBe(true)
    }
  })

  it('zeigt die Einheit am Feld', async () => {
    const { wrapper } = await open('konsum')
    expect(wrapper.get('[data-path="spending.netConsumption"]').text()).toContain('€ p. a.')
  })
})

describe('Mindestkonsum', () => {
  it('lehnt bei festem realem Konsum einen Mindestkonsum über dem Netto-Konsum ab', async () => {
    const { wrapper, store } = await open('konsum')
    const messages = await type(wrapper, 'spending.netConsumption', '40.000')
    expect(messages()).toBe('')
    expect(
      wrapper.get('[data-path="spending.minimumAcceptableConsumption"]').find('.v-messages').text(),
    ).toContain('darf der Mindestkonsum nicht über dem Netto-Konsum liegen')
    expect(store.validation.ok).toBe(false)
  })
})

describe('Langlebigkeit', () => {
  it('passt den Gompertz-Hinweis an Jahrgang und Geschlecht an und übernimmt die Werte', async () => {
    const { wrapper, store } = await open('haushalt')
    await type(wrapper, 'household.currentAge', '53')
    const hint = () => wrapper.get('[data-testid="gompertz-fit"]').text()
    expect(hint()).toContain(`Jahrgang ${store.plan.household.startYear - 53} (männlich)`)
    store.plan.household.sex = 'w'
    await flushPromises()
    expect(hint()).toContain('(weiblich)')
    await wrapper.get('[data-testid="gompertz-fit"] button').trigger('click')
    const l = store.plan.household.longevity
    expect(l.type === 'gompertz' && l.modalAge > 90).toBe(true)
    expect(wrapper.find('[data-testid="gompertz-fit"] button').exists()).toBe(false)
  })
})

describe('Weitere Einkünfte', () => {
  it('legt Einkünfte an, zeigt die steuerliche Behandlung und entfernt sie wieder', async () => {
    const { wrapper, store } = await open('einkuenfte')
    expect(wrapper.text()).toContain('Keine weiteren Einkünfte erfasst.')
    await wrapper.get('[data-testid="income-add"]').trigger('click')
    await flushPromises()
    expect(store.plan.additionalIncome).toHaveLength(1)
    expect(store.plan.additionalIncome[0]).toMatchObject({
      product: 'bav-insurance',
      payout: 'lifelong',
      startAge: 67,
    })
    expect(store.validation.ok).toBe(true)
    const treatment = wrapper.get('[data-testid="income-treatment"]').text()
    expect(treatment).toContain('§ 22 Nr. 5 EStG')
    expect(treatment).toContain('Versorgungsbezug')

    // Einmalzahlung einer Lebensversicherung: Beiträge und Vertragsjahr werden abgefragt
    store.plan.additionalIncome[0].product = 'life-insurance'
    store.plan.additionalIncome[0].payout = 'lump-sum'
    await flushPromises()
    expect(wrapper.find('[data-path="additionalIncome.0.contributions"]').exists()).toBe(true)
    expect(wrapper.find('[data-path="additionalIncome.0.years"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="income-treatment"]').text()).toContain('Abgeltungsteuer')

    const messages = await type(wrapper, 'additionalIncome.0.startAge', '40')
    expect(messages()).toBe('Der Beginn muss zwischen aktuellem Alter und Planungshorizont liegen.')
    expect(store.validation.ok).toBe(false)

    await wrapper.get('[aria-label="Einkunft 1 entfernen"]').trigger('click')
    expect(store.plan.additionalIncome).toHaveLength(0)
  })
})
