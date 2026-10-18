<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { usePlanStore } from '@/stores/plan'
import NumberField from '../NumberField.vue'

const { plan } = storeToRefs(usePlanStore())
</script>

<template>
  <h3 class="text-subtitle-1 mb-2">Depot heute</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.portfolio.totalValue"
        label="Depotwert"
        unit="eur"
        path="portfolio.totalValue"
        help="Aktueller Wert von ETF-Depot und Tagesgeld zusammen. Er wird nach der Zielallokation im Startjahr auf Aktien-ETF, Anleihe-ETF und Cash aufgeteilt."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.portfolio.costBasisShare"
        label="Einstand / Kurswert"
        unit="percent"
        path="portfolio.costBasisShare"
        help="Anteil der Anschaffungskosten am heutigen Kurswert der ETFs. 70 % heißt: 30 % des Werts sind nicht realisierte Gewinne, die beim Verkauf versteuert werden. Über 100 % bedeutet einen Buchverlust."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.portfolio.lossCarryForward"
        label="Verlustvortrag"
        unit="eur"
        path="portfolio.lossCarryForward"
        help="Bestehender Verlustvortrag aus Kapitalerträgen (Verlustverrechnungstopf). Er wird mit späteren Gewinnen vor dem Sparer-Pauschbetrag verrechnet."
      />
    </v-col>
  </v-row>

  <h3 class="text-subtitle-1 mb-2">Sparen bis zum Ruhestand</h3>
  <v-row dense>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.savings.yearlyNet"
        label="Sparrate"
        unit="eur-year"
        path="savings.yearlyNet"
        help="Jährlich zusätzlich angelegter Netto-Betrag in heutiger Kaufkraft, bis zum Ruhestand. Er wird zu Jahresbeginn investiert und mit der Inflation fortgeschrieben."
      />
    </v-col>
    <v-col cols="12" sm="6" md="4">
      <NumberField
        v-model="plan.savings.realGrowth"
        label="Reales Wachstum der Sparrate"
        unit="percent-year"
        path="savings.realGrowth"
        help="Steigerung der Sparrate über die Inflation hinaus, z. B. durch Gehaltserhöhungen. 0 % hält die Kaufkraft der Sparrate konstant."
      />
    </v-col>
  </v-row>
</template>
