<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import {
  mdiBookOpenVariant,
  mdiChartBellCurve,
  mdiFolderMultipleOutline,
  mdiGrid,
  mdiTune,
  mdiViewDashboard,
  mdiWeatherNight,
  mdiWeatherSunny,
} from '@mdi/js'

import AppFooter from '@/ui/components/AppFooter.vue'
import ResultsToolbar from '@/ui/components/ResultsToolbar.vue'

const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)
const { mdAndUp } = useDisplay()
const drawerOpen = ref(false)

const navigation = [
  { title: 'Dashboard', icon: mdiViewDashboard, to: { name: 'dashboard' } },
  { title: 'Eingaben', icon: mdiTune, to: { name: 'inputs' } },
  { title: 'Monte Carlo', icon: mdiChartBellCurve, to: { name: 'monte-carlo' } },
  { title: 'Heatmap', icon: mdiGrid, to: { name: 'heatmap' } },
  { title: 'Szenarien', icon: mdiFolderMultipleOutline, to: { name: 'scenarios' } },
  { title: 'Annahmen', icon: mdiBookOpenVariant, to: { name: 'assumptions' } },
]

function toggleTheme(): void {
  theme.change(isDark.value ? 'light' : 'dark')
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <template v-if="!mdAndUp" #prepend>
        <v-app-bar-nav-icon aria-label="Navigation öffnen" @click="drawerOpen = !drawerOpen" />
      </template>
      <v-app-bar-title>Ruhestandsplaner</v-app-bar-title>
      <template #append>
        <v-btn
          :icon="isDark ? mdiWeatherSunny : mdiWeatherNight"
          :aria-label="isDark ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'"
          @click="toggleTheme"
        />
      </template>
    </v-app-bar>

    <v-navigation-drawer
      :model-value="mdAndUp || drawerOpen"
      :permanent="mdAndUp"
      :temporary="!mdAndUp"
      width="220"
      @update:model-value="drawerOpen = $event"
    >
      <v-list nav density="comfortable" aria-label="Ansichten">
        <v-list-item
          v-for="item in navigation"
          :key="item.title"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          color="primary"
          @click="drawerOpen = false"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <ResultsToolbar />
      <router-view />
    </v-main>

    <AppFooter />
  </v-app>
</template>
