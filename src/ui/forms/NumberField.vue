<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { formatNumberInput, parseNumberInput } from '@/utils/numberInput'
import HelpTooltip from './HelpTooltip.vue'
import { useFieldRegistration, usePlanIssues } from './issues'
import { UNITS, fromDisplay, toDisplay, type FieldUnit } from './units'

const props = defineProps<{
  label: string
  unit: FieldUnit
  /** Bedeutung des Feldes für den Tooltip */
  help: string
  /** Pfad im Plan für die Meldungen der Validierung, z. B. `household.currentAge` */
  path: string
  /** dauerhafter Hinweis unter dem Feld */
  hint?: string
  /** leeres Feld bedeutet „nicht gesetzt“ */
  optional?: boolean
  /** zusätzliche Meldungen außerhalb des Plans, z. B. für Analyse-Einstellungen */
  messages?: string[]
}>()

const model = defineModel<number | undefined>({ required: true })

const spec = computed(() => UNITS[props.unit])
const { messagesFor } = usePlanIssues()
useFieldRegistration(() => props.path)

const format = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? ''
    : formatNumberInput(toDisplay(value, spec.value), spec.value.decimals, spec.value.grouping)

const text = ref(format(model.value))
const focused = ref(false)
const parseError = ref<string | null>(null)

// Externe Änderungen übernehmen, solange nicht getippt wird
watch(model, (value) => {
  if (!focused.value) text.value = format(value)
})

function onInput(value: string): void {
  text.value = value
  if (props.optional && value.trim() === '') {
    parseError.value = null
    model.value = undefined
    return
  }
  const parsed = parseNumberInput(value)
  parseError.value = parsed === null ? 'Bitte eine Zahl eingeben.' : null
  // Unlesbare Eingaben machen den Plan ungültig, statt mit dem alten Wert weiterzurechnen.
  model.value = parsed === null ? Number.NaN : fromDisplay(parsed, spec.value)
}

function onBlur(): void {
  focused.value = false
  if (parseError.value === null) text.value = format(model.value)
}

const errors = computed(() =>
  parseError.value !== null
    ? [parseError.value]
    : [...messagesFor(props.path), ...(props.messages ?? [])],
)
</script>

<template>
  <v-text-field
    :model-value="text"
    :label="label"
    :suffix="spec.suffix || undefined"
    :hint="hint"
    :persistent-hint="hint !== undefined"
    :error-messages="errors"
    inputmode="decimal"
    autocomplete="off"
    density="comfortable"
    variant="outlined"
    :data-path="path"
    @update:model-value="onInput"
    @focus="focused = true"
    @blur="onBlur"
  >
    <template #append-inner>
      <HelpTooltip :label="label" :text="help" :unit="spec.description" />
    </template>
  </v-text-field>
</template>
