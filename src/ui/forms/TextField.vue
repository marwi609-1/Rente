<script setup lang="ts">
import HelpTooltip from './HelpTooltip.vue'
import { useFieldRegistration, usePlanIssues } from './issues'

const props = defineProps<{
  label: string
  help: string
  path: string
}>()

const model = defineModel<string>({ required: true })
const { messagesFor } = usePlanIssues()
useFieldRegistration(() => props.path)
</script>

<template>
  <v-text-field
    v-model="model"
    :label="label"
    density="comfortable"
    variant="outlined"
    autocomplete="off"
    :error-messages="messagesFor(path)"
    :data-path="path"
  >
    <template #append-inner>
      <HelpTooltip :label="label" :text="help" unit="Text" />
    </template>
  </v-text-field>
</template>
