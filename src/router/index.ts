import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

export const INPUT_TABS = [
  'haushalt',
  'vermoegen',
  'konsum',
  'rente',
  'einkuenfte',
  'krankenversicherung',
  'steuern',
  'strategie',
  'markt',
  'simulation',
] as const

export type InputTab = (typeof INPUT_TABS)[number]

export const ASSUMPTION_DOCS = ['annahmen', 'modell', 'datenquellen'] as const

export type AssumptionDoc = (typeof ASSUMPTION_DOCS)[number]

export const routes: RouteRecordRaw[] = [
  // Ansichten werden erst beim Aufruf geladen; ECharts landet so nicht im Start-Bundle der Shell.
  { path: '/', name: 'dashboard', component: () => import('@/ui/views/DashboardView.vue') },
  {
    path: `/eingaben/:tab(${INPUT_TABS.join('|')})?`,
    name: 'inputs',
    component: () => import('@/ui/views/InputsView.vue'),
  },
  {
    path: '/monte-carlo',
    name: 'monte-carlo',
    component: () => import('@/ui/views/MonteCarloView.vue'),
  },
  { path: '/heatmap', name: 'heatmap', component: () => import('@/ui/views/HeatmapView.vue') },
  {
    path: '/szenarien',
    name: 'scenarios',
    component: () => import('@/ui/views/ScenariosView.vue'),
  },
  {
    path: `/annahmen/:doc(${ASSUMPTION_DOCS.join('|')})?`,
    name: 'assumptions',
    component: () => import('@/ui/views/AssumptionsView.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// Hash-Historie: läuft als statische Seite ohne serverseitige Fallback-Konfiguration.
export function createAppRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })
}
