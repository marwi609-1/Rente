// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'

import { useAnalysisStore } from '@/stores/analysis'
import HeatmapView from '@/ui/views/HeatmapView.vue'
import { inApp, mountWithApp } from '../helpers/mount'

let current: VueWrapper | null = null
afterEach(() => {
  current?.unmount()
  current = null
})

async function open() {
  const pinia = createPinia()
  const { wrapper } = await mountWithApp(inApp(HeatmapView), pinia, '/heatmap')
  current = wrapper
  return { wrapper, analysis: useAnalysisStore(pinia) }
}

describe('Heatmap-Ansicht', () => {
  it('zeigt Raster und Rechenaufwand und startet auf Knopfdruck', async () => {
    const { wrapper, analysis } = await open()
    // Voreinstellung 2–8 % in Schritten von 1 %: 7 Zeilen × 11 Spalten
    expect(wrapper.text()).toContain('77 Zellen')
    await wrapper.get('[data-testid="heatmap-run"]').trigger('click')
    await flushPromises()
    expect(analysis.heatmap.status).toBe('running')
    expect(wrapper.text()).toContain('Abbrechen')
  })

  it('meldet ungültige Raster am Feld und sperrt die Berechnung', async () => {
    const { wrapper } = await open()
    const step = wrapper.get('[data-path="heatmap.step"]')
    await step.get('input').setValue('0,1')
    await flushPromises()
    expect(step.find('.v-messages').text()).toContain('Höchstens 25 Zeilen')
    expect(wrapper.get('[data-testid="heatmap-run"]').attributes('disabled')).toBeDefined()
  })
})
