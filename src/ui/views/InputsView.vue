<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { INPUT_TABS, type InputTab } from '@/router'
import { provideFieldRegistry, tabOfIssue, usePlanIssues } from '@/ui/forms/issues'
import HealthTab from '@/ui/forms/tabs/HealthTab.vue'
import HouseholdTab from '@/ui/forms/tabs/HouseholdTab.vue'
import MarketTab from '@/ui/forms/tabs/MarketTab.vue'
import PensionTab from '@/ui/forms/tabs/PensionTab.vue'
import PortfolioTab from '@/ui/forms/tabs/PortfolioTab.vue'
import SimulationTab from '@/ui/forms/tabs/SimulationTab.vue'
import SpendingTab from '@/ui/forms/tabs/SpendingTab.vue'
import StrategyTab from '@/ui/forms/tabs/StrategyTab.vue'
import TaxTab from '@/ui/forms/tabs/TaxTab.vue'

const tabs: Record<InputTab, { title: string; component: Component }> = {
  haushalt: { title: 'Haushalt', component: HouseholdTab },
  vermoegen: { title: 'Vermögen & Sparen', component: PortfolioTab },
  konsum: { title: 'Konsum & Entnahme', component: SpendingTab },
  rente: { title: 'Rente', component: PensionTab },
  krankenversicherung: { title: 'Krankenversicherung', component: HealthTab },
  steuern: { title: 'Steuern', component: TaxTab },
  strategie: { title: 'Strategie', component: StrategyTab },
  markt: { title: 'Marktmodell', component: MarketTab },
  simulation: { title: 'Simulation', component: SimulationTab },
}

const route = useRoute()
const router = useRouter()

const active = computed<InputTab>({
  get: () => {
    const tab = route.params.tab
    return typeof tab === 'string' && (INPUT_TABS as readonly string[]).includes(tab)
      ? (tab as InputTab)
      : 'haushalt'
  },
  set: (tab) => void router.replace({ name: 'inputs', params: { tab } }),
})

const registry = provideFieldRegistry()
const { issues } = usePlanIssues()

const issueCount = computed(() => {
  const counts = Object.fromEntries(INPUT_TABS.map((t) => [t, 0])) as Record<InputTab, number>
  for (const issue of issues.value) counts[tabOfIssue(issue.path)]++
  return counts
})

/** Meldungen des aktiven Tabs ohne eigenes Feld (z. B. Regeln über mehrere Felder). */
const unassigned = computed(() =>
  issues.value.filter((i) => tabOfIssue(i.path) === active.value && !registry.paths.has(i.path)),
)
</script>

<template>
  <v-container class="py-4">
    <h1 class="text-h5 mb-2">Eingaben</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Beträge in heutiger Kaufkraft. Die Berechnung startet automatisch eine halbe Sekunde nach der
      letzten Änderung.
    </p>

    <v-tabs v-model="active" show-arrows color="primary" class="mb-4" aria-label="Eingabebereiche">
      <v-tab v-for="tab in INPUT_TABS" :key="tab" :value="tab" :data-testid="`tab-${tab}`">
        {{ tabs[tab].title }}
        <v-badge
          v-if="issueCount[tab] > 0"
          :content="issueCount[tab]"
          color="error"
          inline
          :aria-label="`${issueCount[tab]} Fehler`"
        />
      </v-tab>
    </v-tabs>

    <v-alert
      v-for="issue in unassigned"
      :key="issue.path + issue.message"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
      data-testid="unassigned-issue"
    >
      {{ issue.message }}
    </v-alert>

    <v-tabs-window v-model="active">
      <!-- Abstand oben: Das Fenster schneidet über den Rand ragende Feldbeschriftungen sonst ab. -->
      <v-tabs-window-item v-for="tab in INPUT_TABS" :key="tab" :value="tab" class="pt-3">
        <component :is="tabs[tab].component" />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>
