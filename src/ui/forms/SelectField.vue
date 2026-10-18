<script setup lang="ts" generic="T extends string | number">
import HelpTooltip from './HelpTooltip.vue'
import { useFieldRegistration, usePlanIssues } from './issues'

const props = defineProps<{
  label: string
  help: string
  path: string
  items: { title: string; value: T }[]
  unit?: string
}>()

const model = defineModel<T>({ required: true })
const { messagesFor } = usePlanIssues()
useFieldRegistration(() => props.path)
</script>

<template>
  <v-select
    v-model="model"
    :label="label"
    :items="items"
    item-title="title"
    item-value="value"
    density="comfortable"
    variant="outlined"
    :error-messages="messagesFor(path)"
    :data-path="path"
  >
    <template #append-inner>
      <HelpTooltip :label="label" :text="help" :unit="unit ?? 'Auswahl'" />
    </template>
  </v-select>
</template>
