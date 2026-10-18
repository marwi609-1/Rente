<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import {
  mdiAccount,
  mdiBank,
  mdiCart,
  mdiChartBellCurve,
  mdiChartDonut,
  mdiPiggyBank,
} from '@mdi/js'

import { geometricMean } from '@/domain/market/returns'
import type { RetirementPlan, StrategyConfig } from '@/domain/model/types'
import { usePlanStore } from '@/stores/plan'
import SummaryCard from '@/ui/components/SummaryCard.vue'
import {
  longevityLabels,
  marketModelLabels,
  strategyLabels,
  withdrawalRuleLabels,
} from '@/ui/labels'
import { formatEuro, formatNumber, formatPercent } from '@/utils/format'

const { plan, validation } = storeToRefs(usePlanStore())

function strategyItems(strategy: StrategyConfig) {
  const items = [{ label: 'Typ', value: strategyLabels[strategy.type] }]
  switch (strategy.type) {
    case 'fixed':
      items.push(
        { label: 'Aktien', value: formatPercent(strategy.equity, 0) },
        { label: 'Anleihen', value: formatPercent(1 - strategy.equity - strategy.cash, 0) },
        { label: 'Cash', value: formatPercent(strategy.cash, 0) },
      )
      break
    case 'glidepath':
      items.push(
        ...strategy.points.map((p) => ({
          label: `Aktien mit ${p.age}`,
          value: formatPercent(p.equity, 0),
        })),
        { label: 'Cash', value: formatPercent(strategy.cash, 0) },
      )
      break
    case 'bond-tent':
      items.push(
        { label: `Aktien mit ${strategy.startAge}`, value: formatPercent(strategy.startEquity, 0) },
        { label: `Aktien mit ${strategy.peakAge}`, value: formatPercent(strategy.peakEquity, 0) },
        { label: `Aktien mit ${strategy.endAge}`, value: formatPercent(strategy.endEquity, 0) },
        { label: 'Cash', value: formatPercent(strategy.cash, 0) },
      )
      break
    case 'bucket':
      items.push(
        { label: 'Cash-Puffer', value: `${formatNumber(strategy.cashYears, 1)} Jahre` },
        { label: 'Anleihen-Puffer', value: `${formatNumber(strategy.bondYears, 1)} Jahre` },
      )
      break
  }
  return items
}

function cards(p: RetirementPlan) {
  const { household: h, market: m } = p
  const longevity =
    h.longevity.type === 'gompertz'
      ? `Gompertz (m\u00a0=\u00a0${h.longevity.modalAge}, b\u00a0=\u00a0${h.longevity.dispersion})`
      : longevityLabels[h.longevity.type]
  return [
    {
      title: 'Haushalt',
      icon: mdiAccount,
      items: [
        { label: 'Aktuelles Alter', value: `${h.currentAge}` },
        { label: 'Ruhestand ab', value: `${h.retirementAge}` },
        { label: 'Planungshorizont', value: `${h.planningHorizonAge}` },
        { label: 'Langlebigkeit', value: longevity },
      ],
    },
    {
      title: 'Vermögen & Sparen',
      icon: mdiPiggyBank,
      items: [
        { label: 'Depotwert', value: formatEuro(p.portfolio.totalValue) },
        { label: 'Einstand / Kurswert', value: formatPercent(p.portfolio.costBasisShare, 0) },
        { label: 'Sparrate p. a.', value: formatEuro(p.savings.yearlyNet) },
        { label: 'Reales Wachstum', value: formatPercent(p.savings.realGrowth) },
      ],
    },
    {
      title: 'Konsum & Entnahme',
      icon: mdiCart,
      items: [
        { label: 'Netto-Konsum p. a.', value: formatEuro(p.spending.netConsumption) },
        {
          label: 'Mindestkonsum p. a.',
          value: formatEuro(p.spending.minimumAcceptableConsumption),
        },
        { label: 'Entnahmeregel', value: withdrawalRuleLabels[p.spending.rule.type] },
        { label: 'Einmalausgaben', value: `${p.spending.oneOffs.length}` },
      ],
    },
    {
      title: 'Gesetzliche Rente',
      icon: mdiBank,
      items: [
        {
          label: 'Anspruch bisher',
          value: `${formatEuro(p.statePension.monthlyGrossCurrent)}/Monat`,
        },
        {
          label: 'Hochrechnung',
          value: `${formatEuro(p.statePension.monthlyGrossProjected)}/Monat`,
        },
        { label: 'Rentenbeginn', value: `${p.statePension.startAge}` },
        { label: 'Regelaltersgrenze', value: `${p.statePension.regularAge}` },
      ],
    },
    { title: 'Strategie', icon: mdiChartDonut, items: strategyItems(p.strategy) },
    {
      title: 'Marktmodell',
      icon: mdiChartBellCurve,
      items: [
        { label: 'Modell', value: marketModelLabels[m.type] },
        {
          label: 'Aktien μ ± σ',
          value: `${formatPercent(m.equity.mean)} ± ${formatPercent(m.equity.vol)}`,
        },
        {
          label: 'Aktien geometrisch',
          value: formatPercent(geometricMean(m.equity.mean, m.equity.vol), 2),
        },
        {
          label: 'Anleihen μ ± σ',
          value: `${formatPercent(m.bonds.mean)} ± ${formatPercent(m.bonds.vol)}`,
        },
        {
          label: 'Anleihen geometrisch',
          value: formatPercent(geometricMean(m.bonds.mean, m.bonds.vol), 2),
        },
        {
          label: 'Inflation μ ± σ',
          value: `${formatPercent(m.inflation.mean)} ± ${formatPercent(m.inflation.vol)}`,
        },
      ],
    },
  ]
}

const summary = computed(() => cards(plan.value))
</script>

<template>
  <v-container class="py-6">
    <div class="mb-4">
      <h1 class="text-h5">Plan „{{ plan.name }}“</h1>
      <p class="text-body-2 text-medium-emphasis">
        Startjahr {{ plan.household.startYear }} · Beträge in heutiger Kaufkraft
      </p>
    </div>

    <v-alert
      v-if="validation.ok"
      type="success"
      variant="tonal"
      density="compact"
      class="mb-4"
      data-testid="validation-ok"
    >
      Alle Eingaben sind gültig.
    </v-alert>
    <v-alert v-else type="error" variant="tonal" class="mb-4" data-testid="validation-issues">
      <div class="font-weight-medium mb-1">Der Plan enthält ungültige Eingaben:</div>
      <ul class="ps-4">
        <li v-for="issue in validation.issues" :key="issue.path + issue.message">
          <code v-if="issue.path">{{ issue.path }}</code> {{ issue.message }}
        </li>
      </ul>
    </v-alert>

    <v-row>
      <v-col v-for="card in summary" :key="card.title" cols="12" sm="6" lg="4">
        <SummaryCard :title="card.title" :icon="card.icon" :items="card.items" />
      </v-col>
    </v-row>
  </v-container>
</template>
