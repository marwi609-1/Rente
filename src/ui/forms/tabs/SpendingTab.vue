<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import type { WithdrawalRule } from '@/domain/model/types'
import { defaultWithdrawalRule } from '@/domain/model/variants'
import { usePlanStore } from '@/stores/plan'
import { withdrawalRuleLabels } from '@/ui/labels'
import ListRows from '../ListRows.vue'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import TextField from '../TextField.vue'

const { plan } = storeToRefs(usePlanStore())
const spending = computed(() => plan.value.spending)

const ruleType = computed({
  get: () => spending.value.rule.type,
  set: (type: WithdrawalRule['type']) => (spending.value.rule = defaultWithdrawalRule(type)),
})

const ruleItems = (Object.keys(withdrawalRuleLabels) as WithdrawalRule['type'][]).map((value) => ({
  title: withdrawalRuleLabels[value],
  value,
}))

const belowMinimum = computed(
  () =>
    spending.value.rule.type === 'fixed-real' &&
    spending.value.netConsumption < spending.value.minimumAcceptableConsumption,
)

const ruleExplanation = computed(() =>
  spending.value.rule.type === 'fixed-real'
    ? 'Der gesamte Netto-Konsum ist real fest; das Depot deckt die Lücke zur Netto-Rente.'
    : 'Die Regel bestimmt den depotfinanzierten Netto-Konsum; der Gesamtkonsum ist dieser Betrag plus die Netto-Rente. Flexible Regeln erhöhen die Erfolgsquote auf Kosten schwankender Konsumhöhe – Erfolgskriterium bleibt der Mindestkonsum.',
)
</script>

<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="spending.netConsumption"
        label="Netto-Konsum"
        unit="eur-year"
        path="spending.netConsumption"
        help="Gewünschter Konsum nach Steuern und Krankenversicherung ab dem Ruhestand, in heutiger Kaufkraft. Bei „Fester realer Konsum“ ist er die Zielgröße, bei Floor & Ceiling die Bezugsgröße der Grenzen."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="spending.minimumAcceptableConsumption"
        label="Mindestkonsum"
        unit="eur-year"
        path="spending.minimumAcceptableConsumption"
        help="Erfolgskriterium für alle Regeln: Liegt der finanzierte Gesamt-Netto-Konsum eines Jahres darunter, ist es ein Fehljahr. Heutige Kaufkraft, ohne Ausgabenprofil."
      />
    </v-col>
  </v-row>

  <v-alert
    v-if="belowMinimum"
    type="warning"
    variant="tonal"
    density="compact"
    class="mb-4"
    data-testid="below-minimum"
  >
    Der Netto-Konsum liegt unter dem Mindestkonsum: Bei festem realem Konsum ist damit jedes
    Ruhestandsjahr ein Fehljahr.
  </v-alert>

  <h3 class="text-subtitle-1 mb-2">Entnahmeregel</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <SelectField
        v-model="ruleType"
        label="Regel"
        path="spending.rule.type"
        :items="ruleItems"
        help="Wie der jährliche Konsum im Ruhestand bestimmt wird."
      />
    </v-col>
    <template v-if="spending.rule.type === 'percent-of-portfolio'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.rate"
          label="Entnahmerate"
          unit="percent-year"
          path="spending.rule.rate"
          help="Anteil des Depotwerts zu Jahresbeginn, der jedes Jahr entnommen wird."
        />
      </v-col>
    </template>
    <template v-else-if="spending.rule.type === 'guyton-klinger'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.initialRate"
          label="Anfangsrate"
          unit="percent"
          path="spending.rule.initialRate"
          help="Entnahme im ersten Ruhestandsjahr als Anteil des Depotwerts; danach wird der Betrag mit der Inflation fortgeschrieben."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.guardBand"
          label="Leitplanken-Band"
          unit="percent"
          path="spending.rule.guardBand"
          help="Relative Abweichung der aktuellen Rate von der Anfangsrate, ab der gekürzt (oberhalb) bzw. erhöht (unterhalb) wird. 20 % bei 5 % Anfangsrate: Schwellen 6 % und 4 %."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.adjustment"
          label="Anpassung"
          unit="percent"
          path="spending.rule.adjustment"
          help="Kürzung bzw. Erhöhung der Entnahme beim Überschreiten einer Leitplanke. In den letzten 15 Jahren vor dem Horizont wird nicht gekürzt."
        />
      </v-col>
    </template>
    <template v-else-if="spending.rule.type === 'vpw'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.expectedRealReturn"
          label="Erwartete reale Rendite"
          unit="percent-year"
          path="spending.rule.expectedRealReturn"
          help="Rechenzins der vorschüssigen Annuität über die Restjahre bis zum Horizont. Entspricht er der tatsächlichen realen Rendite, bleibt die reale Entnahme konstant."
        />
      </v-col>
    </template>
    <template v-else-if="spending.rule.type === 'floor-ceiling'">
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.rate"
          label="Entnahmerate"
          unit="percent-year"
          path="spending.rule.rate"
          help="Anteil des Depotwerts zu Jahresbeginn, begrenzt durch Floor und Ceiling."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.floorFactor"
          label="Floor"
          unit="factor"
          path="spending.rule.floorFactor"
          help="Untergrenze der Entnahme als Vielfaches des Netto-Konsums (real fest)."
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <NumberField
          v-model="spending.rule.ceilingFactor"
          label="Ceiling"
          unit="factor"
          path="spending.rule.ceilingFactor"
          help="Obergrenze der Entnahme als Vielfaches des Netto-Konsums (real fest)."
        />
      </v-col>
    </template>
  </v-row>
  <p class="text-body-2 text-medium-emphasis mb-4">{{ ruleExplanation }}</p>

  <ListRows
    v-model="spending.ageProfile"
    title="Ausgabenprofil"
    add-label="Stützstelle hinzufügen"
    empty-text="Kein Profil: Der Regelbetrag gilt unverändert in allen Jahren (Faktor 1)."
    :create="() => ({ age: plan.household.retirementAge, factor: 1 })"
    :row-label="(i) => `Stützstelle ${i + 1} des Ausgabenprofils`"
  >
    <template #default="{ item, index }">
      <v-col cols="12" sm="6">
        <NumberField
          v-model="item.age"
          label="Alter"
          unit="age"
          :path="`spending.ageProfile.${index}.age`"
          help="Alter der Stützstelle; dazwischen wird linear interpoliert, davor und danach gilt der Randwert. Die Stützstellen müssen aufsteigend sortiert sein."
        />
      </v-col>
      <v-col cols="12" sm="6">
        <NumberField
          v-model="item.factor"
          label="Faktor"
          unit="factor"
          :path="`spending.ageProfile.${index}.factor`"
          help="Multiplikator auf den Betrag der Entnahmeregel, z. B. 0,8 für 20 % weniger Konsum im hohen Alter."
        />
      </v-col>
    </template>
  </ListRows>

  <ListRows
    v-model="spending.oneOffs"
    title="Einmalausgaben"
    add-label="Einmalausgabe hinzufügen"
    empty-text="Keine Einmalausgaben geplant."
    :create="() => ({ age: plan.household.retirementAge, amount: 10_000, label: '' })"
    :row-label="(i) => `Einmalausgabe ${i + 1}`"
  >
    <template #default="{ item, index }">
      <v-col cols="12" sm="4">
        <NumberField
          v-model="item.age"
          label="Alter"
          unit="age"
          :path="`spending.oneOffs.${index}.age`"
          help="Lebensjahr der Ausgabe; muss zwischen aktuellem Alter und Planungshorizont liegen."
        />
      </v-col>
      <v-col cols="12" sm="4">
        <NumberField
          v-model="item.amount"
          label="Betrag"
          unit="eur"
          :path="`spending.oneOffs.${index}.amount`"
          help="Betrag in heutiger Kaufkraft. In der Erwerbsphase wird er zuerst aus der Sparrate gedeckt; im Ruhestand hat der laufende Konsum Vorrang."
        />
      </v-col>
      <v-col cols="12" sm="4">
        <TextField
          v-model="item.label"
          label="Bezeichnung"
          :path="`spending.oneOffs.${index}.label`"
          help="Freier Text, z. B. „Auto“ oder „Umbau“."
        />
      </v-col>
    </template>
  </ListRows>
</template>
