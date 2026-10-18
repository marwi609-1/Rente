import { createRouter, createWebHashHistory } from 'vue-router'

import PlanOverviewView from '@/ui/views/PlanOverviewView.vue'

export const routes = [
  { path: '/', name: 'plan', component: PlanOverviewView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// Hash-Historie: läuft als statische Seite ohne serverseitige Fallback-Konfiguration.
export function createAppRouter() {
  return createRouter({ history: createWebHashHistory(), routes })
}
