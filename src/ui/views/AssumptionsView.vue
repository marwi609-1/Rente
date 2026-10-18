<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import assumptionsMd from '../../../docs/ASSUMPTIONS.md?raw'
import dataSourcesMd from '../../../docs/DATA_SOURCES.md?raw'
import modelMd from '../../../docs/MODEL.md?raw'
import { paramsDe2026 } from '@/data/params-de-2026'
import { ASSUMPTION_DOCS, type AssumptionDoc } from '@/router'
import { legalStatus } from '@/ui/assumptions/legalStatus'
import { renderDoc } from '@/ui/assumptions/markdown'
import { DISCLAIMER, LEGAL_STATUS } from '@/ui/texts'

const docs: Record<AssumptionDoc, { title: string; html: string }> = {
  annahmen: { title: 'Annahmen', html: renderDoc(assumptionsMd) },
  modell: { title: 'Modell und Formeln', html: renderDoc(modelMd) },
  datenquellen: { title: 'Datenquellen', html: renderDoc(dataSourcesMd) },
}

const route = useRoute()
const router = useRouter()

const active = computed<AssumptionDoc>({
  get: () => {
    const doc = route.params.doc
    return typeof doc === 'string' && (ASSUMPTION_DOCS as readonly string[]).includes(doc)
      ? (doc as AssumptionDoc)
      : 'annahmen'
  },
  set: (doc) => void router.replace({ name: 'assumptions', params: { doc } }),
})

const groups = legalStatus(paramsDe2026)
</script>

<template>
  <v-container class="py-4">
    <h1 class="text-h5 mb-4">Annahmen</h1>

    <v-alert type="warning" variant="tonal" class="mb-4" data-testid="assumptions-disclaimer">
      <strong>{{ DISCLAIMER }}</strong>
      Die Ergebnisse beruhen auf Modellannahmen und Zufallspfaden; sie ersetzen keine individuelle
      Beratung. {{ LEGAL_STATUS }}.
    </v-alert>

    <v-card variant="outlined" class="mb-4">
      <v-card-item>
        <v-card-title class="text-subtitle-1">Rechtsstand {{ paramsDe2026.year }}</v-card-title>
        <v-card-subtitle class="text-wrap">
          Gesetzliche Rechengrößen des Modells, geprüft gegen die Primärquellen
        </v-card-subtitle>
      </v-card-item>
      <v-card-text>
        <v-row>
          <v-col v-for="group in groups" :key="group.title" cols="12" md="6">
            <h2 class="text-subtitle-2 mb-1">{{ group.title }}</h2>
            <dl class="legal-list text-body-2">
              <template v-for="row in group.rows" :key="row.label">
                <dt>
                  {{ row.label }}
                  <span class="d-block text-caption text-medium-emphasis">{{ row.source }}</span>
                </dt>
                <dd>{{ row.value }}</dd>
              </template>
            </dl>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card variant="outlined" class="mb-4">
      <v-card-item>
        <v-card-title class="text-subtitle-1">Fachlicher Hintergrund</v-card-title>
      </v-card-item>
      <v-card-text>
        <ul class="ps-4 text-body-2">
          <li class="mb-1">
            Die 4-%-Regel (Bengen 1994, Trinity-Studie 1998) beruht auf US-Daten und 30-jährigen
            Horizonten. Für längere Horizonte und Märkte außerhalb der USA lagen sichere Raten
            historisch niedriger.
          </li>
          <li class="mb-1">
            Steigende Aktienquoten im Ruhestand und Bond Tents (Pfau/Kitces 2014) zeigen moderate
            Vorteile vor allem in Pfaden mit schlechten frühen Renditen. Vergleiche sie mit
            Block-Bootstrap oder historischen Sequenzen, nicht nur mit normalverteilten Renditen.
          </li>
          <li>
            Flexible Entnahmeregeln (Guyton-Klinger, VPW) erhöhen die Erfolgsquote auf Kosten
            schwankender Konsumhöhe. Deshalb ist der Mindestkonsum für alle Regeln das gemeinsame
            Erfolgskriterium.
          </li>
        </ul>
      </v-card-text>
    </v-card>

    <v-tabs v-model="active" show-arrows color="primary" class="mb-2" aria-label="Dokumentation">
      <v-tab v-for="doc in ASSUMPTION_DOCS" :key="doc" :value="doc">{{ docs[doc].title }}</v-tab>
    </v-tabs>
    <!-- Inhalt stammt aus docs/ im Repository und wird beim Build eingebunden, nicht aus Eingaben. -->
    <!-- eslint-disable vue/no-v-html -->
    <article
      class="markdown text-body-2"
      data-testid="assumptions-doc"
      v-html="docs[active].html"
    />
    <!-- eslint-enable vue/no-v-html -->
  </v-container>
</template>

<style scoped>
.legal-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 16px;
  margin: 0;
}

.legal-list dd {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.markdown {
  overflow-wrap: anywhere;
}

.markdown :deep(h1) {
  font-size: 1.25rem;
  font-weight: 500;
  margin: 1rem 0 0.5rem;
}

.markdown :deep(h2) {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 1.25rem 0 0.5rem;
}

.markdown :deep(h3) {
  font-size: 1rem;
  font-weight: 500;
  margin: 1rem 0 0.5rem;
}

.markdown :deep(p),
.markdown :deep(ul),
.markdown :deep(ol) {
  margin-bottom: 0.75rem;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  padding-inline-start: 1.25rem;
}

/* breite Tabellen und Formeln scrollen in sich, nicht die Seite */
.markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
}

.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
  text-align: start;
  vertical-align: top;
}

.markdown :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
  padding: 8px 12px;
  margin-bottom: 0.75rem;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.markdown :deep(code) {
  font-size: 0.85em;
  overflow-wrap: anywhere;
}

.markdown :deep(pre code) {
  overflow-wrap: normal;
}

.markdown :deep(a) {
  color: rgb(var(--v-theme-primary));
}
</style>
