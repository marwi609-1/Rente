<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { mdiWeatherNight, mdiWeatherSunny } from '@mdi/js'

import AppFooter from '@/ui/components/AppFooter.vue'

const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

function toggleTheme(): void {
  theme.change(isDark.value ? 'light' : 'dark')
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-title>Ruhestandsplaner</v-app-bar-title>
      <template #append>
        <v-btn
          :icon="isDark ? mdiWeatherSunny : mdiWeatherNight"
          :aria-label="isDark ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'"
          @click="toggleTheme"
        />
      </template>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>

    <AppFooter />
  </v-app>
</template>
