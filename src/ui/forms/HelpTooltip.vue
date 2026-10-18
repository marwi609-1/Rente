<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'

// Geräte ohne Hover (Touch) öffnen den Hinweis per Tippen, alle übrigen per Hover und Tastaturfokus.
const canHover = globalThis.matchMedia?.('(hover: hover)').matches ?? true

defineProps<{
  /** Feldbezeichnung für Screenreader */
  label: string
  /** Bedeutung des Feldes */
  text: string
  /** Einheit in Worten */
  unit?: string
}>()
</script>

<template>
  <v-tooltip
    location="top"
    max-width="320"
    :open-on-hover="canHover"
    :open-on-click="!canHover"
    open-on-focus
  >
    <template #activator="{ props: activator }">
      <v-icon
        v-bind="activator"
        :icon="mdiInformationOutline"
        size="small"
        role="button"
        tabindex="0"
        :aria-label="`Hilfe: ${label}`"
        class="help-icon"
        @mousedown.stop
      />
    </template>
    <div>{{ text }}</div>
    <div v-if="unit" class="mt-1 font-weight-medium">Einheit: {{ unit }}</div>
  </v-tooltip>
</template>

<style scoped>
.help-icon {
  cursor: help;
  opacity: 0.7;
}
</style>
