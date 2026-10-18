import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { Component } from 'vue'
import { h } from 'vue'
import { VApp } from 'vuetify/components'

import { createAppRouter } from '@/router'
import { createAppVuetify } from '@/ui/vuetify'

/** Montiert eine Komponente mit Vuetify, Pinia und Router wie in der App. */
export async function mountWithApp(component: Component, pinia: Pinia = createPinia()) {
  setActivePinia(pinia)
  const router = createAppRouter()
  await router.push('/')
  await router.isReady()
  return mount(component, {
    global: { plugins: [pinia, router, createAppVuetify()] },
  })
}

/** Montiert eine Ansicht innerhalb von `v-app`, wie sie im Layout gerendert wird. */
export function inApp(view: Component): Component {
  return { render: () => h(VApp, () => h(view)) }
}
