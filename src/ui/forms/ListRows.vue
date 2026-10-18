<script setup lang="ts" generic="T">
import { mdiDelete, mdiPlus } from '@mdi/js'

const props = defineProps<{
  title: string
  addLabel: string
  emptyText: string
  /** neues Element für „Hinzufügen“ */
  create: () => T
  /** Bezeichnung einer Zeile für Screenreader, z. B. „Stützstelle 2“ */
  rowLabel: (index: number) => string
  minItems?: number
}>()

const items = defineModel<T[]>({ required: true })

function add(): void {
  items.value = [...items.value, props.create()]
}

function remove(index: number): void {
  items.value = items.value.filter((_, i) => i !== index)
}
</script>

<template>
  <section class="mb-4">
    <h3 class="text-subtitle-1 mb-2">{{ title }}</h3>
    <p v-if="items.length === 0" class="text-body-2 text-medium-emphasis mb-2">{{ emptyText }}</p>
    <div
      v-for="(item, index) in items"
      :key="index"
      class="d-flex align-start ga-2"
      role="group"
      :aria-label="rowLabel(index)"
    >
      <v-row dense class="flex-grow-1">
        <slot :item="item" :index="index" />
      </v-row>
      <v-btn
        :icon="mdiDelete"
        variant="text"
        size="small"
        class="mt-2"
        :disabled="items.length <= (minItems ?? 0)"
        :aria-label="`${rowLabel(index)} entfernen`"
        @click="remove(index)"
      />
    </div>
    <v-btn :prepend-icon="mdiPlus" variant="tonal" size="small" color="primary" @click="add">
      {{ addLabel }}
    </v-btn>
  </section>
</template>
