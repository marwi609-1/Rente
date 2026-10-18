// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'

import App from '@/App.vue'
import { DISCLAIMER } from '@/ui/texts'
import { mountWithApp } from '../helpers/mount'

let current: VueWrapper | null = null
afterEach(() => {
  current?.unmount()
  current = null
})

async function mountApp(path = '/') {
  const mounted = await mountWithApp(App, undefined, path)
  current = mounted.wrapper
  return mounted
}

describe('App-Shell', () => {
  it('zeigt dauerhaft den Haftungshinweis im Footer', async () => {
    const { wrapper } = await mountApp()
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain(DISCLAIMER)
    expect(footer.text()).toContain('Rechtsstand Deutschland 2026')
  })

  it('startet mit dem Dashboard und zeigt den Fortschritt der Berechnung', async () => {
    const { wrapper } = await mountApp()
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.find('[data-testid="results-placeholder"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="run-status"]').text()).toContain('Berechnung')
  })

  it('erreicht alle Ansichten über die Navigation', async () => {
    const { wrapper, router } = await mountApp()
    for (const [path, heading] of [
      ['/eingaben', 'Eingaben'],
      ['/monte-carlo', 'Monte Carlo'],
      ['/heatmap', 'Heatmap'],
      ['/szenarien', 'Szenarien'],
      ['/annahmen', 'Annahmen'],
    ]) {
      await router.push(path)
      await flushPromises()
      expect(wrapper.get('h1').text()).toBe(heading)
    }
    expect(wrapper.get('[data-testid="assumptions-disclaimer"]').text()).toContain(DISCLAIMER)
    expect(wrapper.get('[data-testid="assumptions-doc"]').text()).toContain('Annahmen')
  })

  it('schaltet zwischen hellem und dunklem Design um', async () => {
    const { wrapper } = await mountApp()
    const button = wrapper.get('button[aria-label$="Design aktivieren"]')
    const before = button.attributes('aria-label')
    await button.trigger('click')
    const after = wrapper.get('button[aria-label$="Design aktivieren"]').attributes('aria-label')
    expect(after).not.toBe(before)
    await wrapper.get('button[aria-label$="Design aktivieren"]').trigger('click')
    expect(wrapper.get('button[aria-label$="Design aktivieren"]').attributes('aria-label')).toBe(
      before,
    )
  })

  it('bricht die laufende Berechnung über die Statusleiste ab', async () => {
    const { wrapper } = await mountApp()
    await wrapper.get('[data-testid="cancel-run"]').trigger('click')
    expect(wrapper.get('[data-testid="run-status"]').text()).toBe('Berechnung abgebrochen.')
  })
})
