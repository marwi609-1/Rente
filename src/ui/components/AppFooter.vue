<script setup lang="ts">
import { DISCLAIMER, LEGAL_STATUS } from '@/ui/texts'
</script>

<template>
  <v-footer app border class="text-caption text-medium-emphasis justify-center text-center py-1">
    <p>
      <span data-testid="disclaimer">{{ DISCLAIMER }}</span> {{ LEGAL_STATUS }}
    </p>
  </v-footer>
</template>
