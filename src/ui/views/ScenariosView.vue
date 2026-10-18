<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  mdiContentCopy,
  mdiContentSave,
  mdiDelete,
  mdiDownload,
  mdiFolderOpen,
  mdiUpload,
} from '@mdi/js'

import { usePlanStore } from '@/stores/plan'
import { useResultsStore } from '@/stores/results'
import { CURRENT_PLAN_ID, MAX_COMPARED, useScenariosStore } from '@/stores/scenarios'
import ChartCard from '@/ui/charts/ChartCard.vue'
import { overlayData } from '@/ui/charts/data'
import { overlayLineOption } from '@/ui/charts/options'
import { overlayTable } from '@/ui/charts/tables'
import { comparisonRows } from '@/ui/scenarios/comparison'
import { downloadText } from '@/utils/download'

const planStore = usePlanStore()
const scenarios = useScenariosStore()
const {
  saved,
  presets,
  activeId,
  selected,
  comparison,
  comparisonStatus,
  comparisonError,
  comparisonProgress,
  error,
} = storeToRefs(scenarios)
const { outputReal } = storeToRefs(useResultsStore())

const message = ref<{ type: 'success' | 'error'; text: string; details?: string[] } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingDelete = ref<{ id: string; name: string } | null>(null)

onMounted(() => void scenarios.refresh())

const activeName = computed(() => saved.value.find((s) => s.id === activeId.value)?.name ?? null)
const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

function report(result: string | null, success: string): void {
  message.value =
    result === null ? { type: 'success', text: success } : { type: 'error', text: result }
}

async function save(asNew: boolean): Promise<void> {
  report(await scenarios.saveCurrent(asNew), `„${planStore.plan.name}“ gespeichert.`)
}

async function load(id: string, name: string): Promise<void> {
  report(await scenarios.load(id), `„${name}“ geladen; die Berechnung startet automatisch.`)
}

async function duplicate(id: string, name: string): Promise<void> {
  await scenarios.duplicate(id)
  report(error.value, `Kopie von „${name}“ angelegt.`)
}

async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return
  const { id, name } = pendingDelete.value
  pendingDelete.value = null
  await scenarios.remove(id)
  report(error.value, `„${name}“ gelöscht.`)
}

function exportScenario(id: string): void {
  const file = scenarios.exportScenario(id)
  if (!file) {
    message.value = { type: 'error', text: 'Ungültige Pläne können nicht exportiert werden.' }
    return
  }
  downloadText(file.fileName, file.content)
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const result = await scenarios.importScenario(await file.text())
  message.value = result.ok
    ? { type: 'success', text: `„${result.name}“ importiert.` }
    : {
        type: 'error',
        text: result.message,
        details: result.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
      }
}

const rows = computed(() => comparisonRows(comparison.value, outputReal.value))
const overlay = computed(() =>
  comparison.value.length > 0 ? overlayData(comparison.value, outputReal.value) : null,
)
const canCompare = computed(
  () => selected.value.length >= 2 && comparisonStatus.value !== 'running',
)
</script>

<template>
  <v-container class="py-4">
    <h1 class="text-h5">Szenarien</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Gespeichert wird lokal im Browser (IndexedDB). Szenarien lassen sich als JSON exportieren und
      wieder importieren.
    </p>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        v-if="activeId"
        color="primary"
        variant="flat"
        :prepend-icon="mdiContentSave"
        data-testid="save-active"
        @click="save(false)"
      >
        Änderungen speichern
      </v-btn>
      <v-btn
        :color="activeId ? undefined : 'primary'"
        :variant="activeId ? 'tonal' : 'flat'"
        :prepend-icon="mdiContentSave"
        data-testid="save-new"
        @click="save(true)"
      >
        Als neues Szenario speichern
      </v-btn>
      <v-btn variant="tonal" :prepend-icon="mdiUpload" @click="fileInput?.click()">
        Importieren
      </v-btn>
      <v-btn variant="tonal" :prepend-icon="mdiDownload" @click="exportScenario(CURRENT_PLAN_ID)">
        Aktuellen Plan exportieren
      </v-btn>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="d-none"
        aria-label="Szenario-Datei importieren"
        data-testid="import-input"
        @change="importFile"
      />
    </div>
    <p v-if="activeName" class="text-body-2 mb-4">
      In Bearbeitung: „{{ activeName }}“ (aktueller Plan „{{ planStore.plan.name }}“)
    </p>

    <v-alert
      v-if="message"
      :type="message.type"
      variant="tonal"
      density="compact"
      closable
      class="mb-4"
      data-testid="scenario-message"
      @click:close="message = null"
    >
      {{ message.text }}
      <ul v-if="message.details?.length" class="ps-4 mt-1">
        <li v-for="detail in message.details" :key="detail">{{ detail }}</li>
      </ul>
    </v-alert>

    <v-row>
      <v-col cols="12" md="6">
        <h2 class="text-subtitle-1 mb-2">Vorlagen</h2>
        <v-card
          v-for="preset in presets"
          :key="preset.id"
          variant="outlined"
          class="mb-2"
          :data-testid="`scenario-${preset.id}`"
        >
          <v-card-text class="d-flex flex-wrap align-center ga-2">
            <div class="scenario-name">
              <div class="text-body-1">{{ preset.plan.name }}</div>
              <div class="text-caption text-medium-emphasis">{{ preset.description }}</div>
            </div>
            <div class="d-flex align-center">
              <v-checkbox-btn
                :model-value="selected.includes(preset.id)"
                :disabled="!selected.includes(preset.id) && selected.length >= MAX_COMPARED"
                :aria-label="`${preset.plan.name} vergleichen`"
                @update:model-value="scenarios.toggleSelected(preset.id)"
              />
              <v-btn
                :icon="mdiFolderOpen"
                variant="text"
                size="small"
                :aria-label="`${preset.plan.name} laden`"
                @click="load(preset.id, preset.plan.name)"
              />
              <v-btn
                :icon="mdiContentCopy"
                variant="text"
                size="small"
                :aria-label="`${preset.plan.name} duplizieren`"
                @click="duplicate(preset.id, preset.plan.name)"
              />
              <v-btn
                :icon="mdiDownload"
                variant="text"
                size="small"
                :aria-label="`${preset.plan.name} exportieren`"
                @click="exportScenario(preset.id)"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <h2 class="text-subtitle-1 mb-2">Eigene Szenarien</h2>
        <p v-if="saved.length === 0" class="text-body-2 text-medium-emphasis">
          Noch keine Szenarien gespeichert.
        </p>
        <v-card
          v-for="scenario in saved"
          :key="scenario.id"
          variant="outlined"
          class="mb-2"
          :data-testid="`scenario-${scenario.id}`"
        >
          <v-card-text class="d-flex flex-wrap align-center ga-2">
            <div class="scenario-name">
              <div class="text-body-1">
                {{ scenario.name }}
                <v-chip v-if="scenario.id === activeId" size="x-small" color="primary" class="ms-1">
                  in Bearbeitung
                </v-chip>
              </div>
              <div class="text-caption text-medium-emphasis">
                geändert {{ dateFormat.format(scenario.updatedAt) }}
              </div>
            </div>
            <div class="d-flex align-center">
              <v-checkbox-btn
                :model-value="selected.includes(scenario.id)"
                :disabled="!selected.includes(scenario.id) && selected.length >= MAX_COMPARED"
                :aria-label="`${scenario.name} vergleichen`"
                @update:model-value="scenarios.toggleSelected(scenario.id)"
              />
              <v-btn
                :icon="mdiFolderOpen"
                variant="text"
                size="small"
                :aria-label="`${scenario.name} laden`"
                @click="load(scenario.id, scenario.name)"
              />
              <v-btn
                :icon="mdiContentCopy"
                variant="text"
                size="small"
                :aria-label="`${scenario.name} duplizieren`"
                @click="duplicate(scenario.id, scenario.name)"
              />
              <v-btn
                :icon="mdiDownload"
                variant="text"
                size="small"
                :aria-label="`${scenario.name} exportieren`"
                @click="exportScenario(scenario.id)"
              />
              <v-btn
                :icon="mdiDelete"
                variant="text"
                size="small"
                :aria-label="`${scenario.name} löschen`"
                @click="pendingDelete = { id: scenario.id, name: scenario.name }"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <h2 class="text-subtitle-1 mt-4 mb-2">Vergleich</h2>
    <p class="text-body-2 text-medium-emphasis mb-2">
      Zwei oder drei Szenarien auswählen (Häkchen). Alle werden mit dem Seed des ersten gerechnet,
      damit Unterschiede nicht vom Zufall der Pfade abhängen.
    </p>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-checkbox
        :model-value="selected.includes(CURRENT_PLAN_ID)"
        :disabled="!selected.includes(CURRENT_PLAN_ID) && selected.length >= MAX_COMPARED"
        label="Aktuellen Plan einbeziehen"
        density="compact"
        hide-details
        @update:model-value="scenarios.toggleSelected(CURRENT_PLAN_ID)"
      />
      <v-btn
        color="primary"
        variant="flat"
        :disabled="!canCompare"
        data-testid="compare-run"
        @click="scenarios.compare()"
      >
        Vergleichen ({{ selected.length }}/{{ MAX_COMPARED }})
      </v-btn>
      <v-btn
        v-if="comparisonStatus === 'running'"
        variant="tonal"
        @click="scenarios.cancelComparison()"
      >
        Abbrechen
      </v-btn>
      <span v-if="comparisonStatus === 'running'" class="text-body-2" role="status">
        {{ comparisonProgress.done }} von {{ comparisonProgress.total }} Szenarien gerechnet
      </span>
    </div>
    <v-alert
      v-if="comparisonStatus === 'error'"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      {{ comparisonError }}
    </v-alert>

    <template v-if="comparison.length > 0">
      <v-card variant="outlined" class="mb-4">
        <v-table density="compact" data-testid="comparison-table">
          <thead>
            <tr>
              <th scope="col">Größe</th>
              <th v-for="item in comparison" :key="item.id" scope="col">{{ item.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label">
              <th scope="row" class="font-weight-regular">{{ row.label }}</th>
              <td v-for="(value, k) in row.values" :key="k" class="value-cell">{{ value }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
      <ChartCard
        v-if="overlay"
        title="Median-Pfade im Vergleich"
        :subtitle="`Median des Depotwerts je Alter, ${outputReal ? 'Euro von heute' : 'nominal'}`"
        :option="(theme, layout) => overlayLineOption(overlay!, theme, layout)"
        :table="() => overlayTable(overlay!)"
        test-id="chart-overlay"
      />
    </template>

    <v-dialog
      :model-value="pendingDelete !== null"
      max-width="420"
      @update:model-value="pendingDelete = null"
    >
      <v-card v-if="pendingDelete">
        <v-card-title class="text-subtitle-1">Szenario löschen?</v-card-title>
        <v-card-text
          >„{{ pendingDelete.name }}“ wird endgültig aus dem Browser entfernt.</v-card-text
        >
        <v-card-actions>
          <v-spacer />
          <v-btn @click="pendingDelete = null">Abbrechen</v-btn>
          <v-btn color="error" data-testid="confirm-delete" @click="confirmDelete">Löschen</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.scenario-name {
  flex: 1 1 160px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.value-cell {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
