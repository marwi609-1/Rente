import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Component } from 'vue'
import { h } from 'vue'
import { VApp } from 'vuetify/components'

import { createAppRouter } from '@/router'
import { setSimulationBackendFactory } from '@/stores/results'
import { createAppVuetify } from '@/ui/vuetify'
import { pendingBackend } from './backends'

/**
 * Montiert eine Komponente mit Vuetify, Pinia und Router wie in der App. Simulationen laufen gegen
 * ein Backend, das nie fertig wird, damit Oberflächentests keine Rechenlast erzeugen.
 */
export async function mountWithApp(component: Component, pinia: Pinia = createPinia(), path = '/') {
  setSimulationBackendFactory(() => [pendingBackend()])
  setActivePinia(pinia)
  const router = createAppRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, {
    global: { plugins: [pinia, router, createAppVuetify()] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

/** Montiert eine Ansicht innerhalb von `v-app`, wie sie im Layout gerendert wird. */
export function inApp(view: Component): Component {
  return { render: () => h(VApp, () => h(view)) }
}
