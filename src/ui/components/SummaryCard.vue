<script setup lang="ts">
interface SummaryItem {
  label: string
  value: string
}

defineProps<{
  title: string
  icon: string
  items: SummaryItem[]
}>()
</script>

<template>
  <v-card variant="outlined" class="h-100">
    <v-card-item>
      <template #prepend>
        <v-icon :icon="icon" color="primary" />
      </template>
      <v-card-title class="text-subtitle-1">{{ title }}</v-card-title>
    </v-card-item>
    <v-card-text class="pt-0">
      <dl class="summary-list">
        <template v-for="item in items" :key="item.label">
          <dt class="text-medium-emphasis">{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </template>
      </dl>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.summary-list {
  display: grid;
  /* Bezeichnungen brechen nicht im Wort um; Werte nehmen den Rest und dürfen umbrechen. */
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}

.summary-list dd {
  margin: 0;
  text-align: end;
  overflow-wrap: break-word;
  font-variant-numeric: tabular-nums;
}
</style>
