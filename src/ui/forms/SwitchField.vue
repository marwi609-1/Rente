<script setup lang="ts">
import HelpTooltip from './HelpTooltip.vue'
import { useFieldRegistration, usePlanIssues } from './issues'

const props = defineProps<{
  label: string
  help: string
  path: string
}>()

const model = defineModel<boolean>({ required: true })
const { messagesFor } = usePlanIssues()
useFieldRegistration(() => props.path)
</script>

<template>
  <v-switch
    v-model="model"
    color="primary"
    density="comfortable"
    inset
    :error-messages="messagesFor(path)"
    :hide-details="messagesFor(path).length === 0"
    :data-path="path"
  >
    <template #label>
      <span class="me-1">{{ label }}</span>
      <HelpTooltip :label="label" :text="help" unit="ja/nein" />
    </template>
  </v-switch>
</template>
