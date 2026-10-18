<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { mdiDelete, mdiPlus } from '@mdi/js'

import { paramsDe2026 } from '@/data/params-de-2026'
import type { AdditionalIncome, IncomeProduct } from '@/domain/model/types'
import { usePlanStore } from '@/stores/plan'
import {
  INCOME_PAYOUT_ITEMS,
  INCOME_PRODUCT_ITEMS,
  incomeTreatment,
  needsContractData,
} from '../incomeTexts'
import NumberField from '../NumberField.vue'
import SelectField from '../SelectField.vue'
import SwitchField from '../SwitchField.vue'
import TextField from '../TextField.vue'

/** Höchstzahl laut Schema */
const MAX_INCOMES = 30

const { plan } = storeToRefs(usePlanStore())
const incomes = computed(() => plan.value.additionalIncome)

function create(): AdditionalIncome {
  const { household, statePension } = plan.value
  return {
    label: '',
    product: 'bav-insurance',
    payout: 'lifelong',
    startAge: Math.min(
      household.planningHorizonAge,
      Math.max(household.currentAge, statePension.startAge),
    ),
    years: 10,
    amount: 300,
    growth: 0,
    basis: 'nominal',
    contributions: 0,
    contractYear: household.startYear,
    fundLinked: false,
  }
}

function add(): void {
  plan.value.additionalIncome = [...incomes.value, create()]
}

function remove(index: number): void {
  plan.value.additionalIncome = incomes.value.filter((_, i) => i !== index)
}

/** Die Basisrente kennt nur die lebenslange Rente. */
function setProduct(income: AdditionalIncome, product: IncomeProduct): void {
  income.product = product
  if (product === 'basis') income.payout = 'lifelong'
}

const payoutItems = (income: AdditionalIncome) =>
  income.product === 'basis'
    ? INCOME_PAYOUT_ITEMS.filter((i) => i.value === 'lifelong')
    : INCOME_PAYOUT_ITEMS

const title = (income: AdditionalIncome, index: number) =>
  income.label.trim() || `Einkunft ${index + 1}`
</script>

<template>
  <p class="text-body-2 text-medium-emphasis mb-4">
    Betriebsrenten, Riester, Altersvorsorgedepot, Versicherungen und sonstige Einnahmen. Steuer und
    KV/PV richten sich nach dem Produkt. Laufende Zahlungen decken den Konsum, Einmalzahlungen
    fließen nach Abzug von Steuern ins Depot.
  </p>

  <p v-if="incomes.length === 0" class="text-body-2 text-medium-emphasis mb-2">
    Keine weiteren Einkünfte erfasst.
  </p>

  <v-card
    v-for="(income, index) in incomes"
    :key="index"
    variant="outlined"
    class="mb-4"
    role="group"
    :aria-label="`Einkunft ${index + 1}`"
    data-testid="income-entry"
  >
    <div class="d-flex align-center pa-3 pb-0">
      <h3 class="text-subtitle-1 flex-grow-1">{{ title(income, index) }}</h3>
      <v-btn
        :icon="mdiDelete"
        variant="text"
        size="small"
        :aria-label="`Einkunft ${index + 1} entfernen`"
        @click="remove(index)"
      />
    </div>
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="6">
          <SelectField
            :model-value="income.product"
            label="Produkt"
            :path="`additionalIncome.${index}.product`"
            :items="INCOME_PRODUCT_ITEMS"
            help="Bestimmt Besteuerung und Beitragspflicht zur KV/PV. Privat fortgeführte Teile einer Direktversicherung (eigene Beiträge nach dem Ende des Arbeitsverhältnisses) als private Rentenversicherung erfassen."
            @update:model-value="(p) => setProduct(income, p)"
          />
        </v-col>
        <v-col cols="12" md="6">
          <TextField
            v-model="income.label"
            label="Bezeichnung"
            :path="`additionalIncome.${index}.label`"
            help="Freier Text, z. B. Name des Arbeitgebers oder Versicherers."
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <SelectField
            v-model="income.payout"
            label="Auszahlung"
            :path="`additionalIncome.${index}.payout`"
            :items="payoutItems(income)"
            help="Lebenslange Rente: bis zum Planungshorizont. Befristet: feste Zahl von Jahren (z. B. Auszahlplan). Einmalzahlung: Kapitalauszahlung in einem Jahr."
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <NumberField
            v-model="income.startAge"
            :label="income.payout === 'lump-sum' ? 'Alter bei Auszahlung' : 'Beginn mit'"
            unit="age"
            :path="`additionalIncome.${index}.startAge`"
            help="Lebensjahr der ersten Zahlung bzw. der Einmalzahlung; gezahlt wird ab Jahresbeginn. Laufende Renten erfassen Sie mit dem aktuellen Alter als Beginn."
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <NumberField
            v-model="income.amount"
            :label="income.payout === 'lump-sum' ? 'Betrag brutto' : 'Monatsbetrag brutto'"
            :unit="income.payout === 'lump-sum' ? 'eur' : 'eur-month'"
            :path="`additionalIncome.${index}.amount`"
            help="Betrag vor Steuern und KV/PV im ersten Zahlungsjahr, etwa laut Standmitteilung oder Leistungsübersicht."
          />
        </v-col>
        <v-col v-if="income.payout === 'fixed-term'" cols="12" sm="6" md="3">
          <NumberField
            v-model="income.years"
            label="Laufzeit"
            unit="years"
            :path="`additionalIncome.${index}.years`"
            help="Zahl der Zahlungsjahre, ganze Jahre; gezahlt wird höchstens bis zum Planungshorizont."
          />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <SelectField
            v-model="income.basis"
            label="Betrag bezieht sich auf"
            :path="`additionalIncome.${index}.basis`"
            :items="[
              { title: 'Nominal laut Vertrag', value: 'nominal' },
              { title: 'Heutige Kaufkraft', value: 'today' },
            ]"
            help="Nominal: Betrag, wie er im ersten Zahlungsjahr ausgezahlt wird (Verträge nennen nominale Beträge). Heutige Kaufkraft: eigene Schätzung in Euro von heute; sie wird mit der erwarteten Inflation in einen festen nominalen Betrag umgerechnet."
          />
        </v-col>
        <v-col v-if="income.payout !== 'lump-sum'" cols="12" sm="6" md="3">
          <NumberField
            v-model="income.growth"
            label="Steigerung"
            unit="percent-year"
            :path="`additionalIncome.${index}.growth`"
            help="Jährliche Erhöhung ab dem zweiten Zahlungsjahr, z. B. 1 % Anpassung einer Betriebsrente. Bei „heutige Kaufkraft“ zusätzlich zur erwarteten Inflation."
          />
        </v-col>
        <template v-if="needsContractData(income)">
          <v-col cols="12" sm="6" md="3">
            <NumberField
              v-model="income.contributions"
              label="Summe der Beiträge"
              unit="eur"
              :path="`additionalIncome.${index}.contributions`"
              help="Bis zur Auszahlung eingezahlte Beiträge. Steuerpflichtig ist der Unterschied zwischen Auszahlung und Beiträgen."
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <NumberField
              v-model="income.contractYear"
              label="Vertragsabschluss"
              unit="calendar-year"
              :path="`additionalIncome.${index}.contractYear`"
              help="Jahr des Vertragsabschlusses: vor 2005 steuerfrei (Altvertrag), bis 2011 halber Ertrag ab 60, ab 2012 ab 62, jeweils nach mindestens 12 Jahren Laufzeit."
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <SwitchField
              v-model="income.fundLinked"
              label="Fondsgebunden"
              :path="`additionalIncome.${index}.fundLinked`"
              help="Fondsgebundene Versicherung: 15 % des Ertrags sind steuerfrei (§ 20 Abs. 1 Nr. 6 Satz 9 EStG)."
            />
          </v-col>
        </template>
      </v-row>
      <p class="text-body-2 mt-2" data-testid="income-treatment">
        <strong>Steuer:</strong>
        {{ incomeTreatment(income, plan.household, paramsDe2026).tax }}
        <br />
        <strong>KV/PV:</strong>
        {{ incomeTreatment(income, plan.household, paramsDe2026).health }}
        <template v-if="income.startAge < plan.household.retirementAge">
          <br />
          Vor dem Ruhestand werden steuerpflichtige Teile mit 42 % angesetzt, weil das
          Erwerbseinkommen nicht modelliert ist.
        </template>
      </p>
    </v-card-text>
  </v-card>

  <v-btn
    :prepend-icon="mdiPlus"
    variant="tonal"
    size="small"
    color="primary"
    :disabled="incomes.length >= MAX_INCOMES"
    data-testid="income-add"
    @click="add"
  >
    Einkunft hinzufügen
  </v-btn>
</template>
