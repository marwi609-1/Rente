<script setup lang="ts">
import { mdiAlertOutline, mdiCheckCircleOutline } from '@mdi/js'

import HelpTooltip from '@/ui/forms/HelpTooltip.vue'
import type { KpiCardModel } from './kpis'

defineProps<{ kpi: KpiCardModel }>()
</script>

<template>
  <v-card variant="outlined" class="h-100" :data-testid="`kpi-${kpi.id}`">
    <v-card-item class="pb-0">
      <div class="d-flex align-center ga-1">
        <h2 class="text-subtitle-2 text-medium-emphasis">{{ kpi.title }}</h2>
        <HelpTooltip :label="kpi.title" :text="kpi.help" />
      </div>
    </v-card-item>
    <v-card-text>
      <div class="kpi-value text-h5 font-weight-medium" data-testid="kpi-value">
        <v-progress-circular
          v-if="kpi.pending"
          indeterminate
          size="18"
          width="2"
          color="primary"
          class="me-2"
        />
        {{ kpi.value }}
      </div>
      <div class="text-caption text-medium-emphasis mb-2" data-testid="kpi-caption">
        {{ kpi.caption }}
      </div>
      <v-chip
        v-if="kpi.status"
        :color="kpi.status.tone === 'success' ? 'success' : 'warning'"
        :prepend-icon="kpi.status.tone === 'success' ? mdiCheckCircleOutline : mdiAlertOutline"
        size="small"
        variant="tonal"
        class="mb-2"
        data-testid="kpi-status"
      >
        {{ kpi.status.text }}
      </v-chip>
      <dl v-if="kpi.details.length > 0" class="kpi-details text-body-2">
        <template v-for="detail in kpi.details" :key="detail.label">
          <dt class="text-medium-emphasis">{{ detail.label }}</dt>
          <dd>{{ detail.value }}</dd>
        </template>
      </dl>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.kpi-value {
  overflow-wrap: anywhere;
}

.kpi-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  margin: 0;
}

.kpi-details dd {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
</style>
