// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import App from '@/App.vue'
import { DISCLAIMER } from '@/ui/texts'
import { mountWithApp } from '../helpers/mount'

describe('App-Shell', () => {
  it('zeigt dauerhaft den Haftungshinweis im Footer', async () => {
    const wrapper = await mountWithApp(App)
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain(DISCLAIMER)
    expect(footer.text()).toContain('Rechtsstand Deutschland 2026')
  })

  it('rendert die Planübersicht als Startansicht', async () => {
    const wrapper = await mountWithApp(App)
    expect(wrapper.text()).toContain('Plan „Basis“')
  })

  it('schaltet zwischen hellem und dunklem Design um', async () => {
    const wrapper = await mountWithApp(App)
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
})
