import type { ReturnPath } from '../market/types'
import { netOfCost } from '../market/returns'
import type { AssetVector, RetirementPlan } from '../model/types'
import { allocationPolicy } from '../strategy/allocation'
import { ASSET_CLASSES, invest, sell, sharesOf, totalOf } from '../strategy/flows'
import { rebalanceIfOutsideBand } from '../strategy/rebalance'
import { oneOffsAt, profileFactor } from '../withdrawal/profile'
import { withdrawalPolicy } from '../withdrawal/rules'
import { phaseForAge, simulationYears } from './timeline'
import type { YearResult } from './types'

/** Fehlbeträge unter einem Cent gelten als Rundungsrauschen. */
const SHORTFALL_TOLERANCE = 0.01

/** Simuliert einen Pfad zu gegebenen Jahresrenditen und meldet jedes Jahr an `onYear`. */
export type PathSimulator = (returns: ReturnPath, onYear: (row: YearResult) => void) => void

/**
 * Bereitet die Simulation eines Plans in Jahresschritten vor (Spezifikation Abschnitt 7).
 * Abgebildet sind Zielallokation, Sparrate, Konsum laut Entnahmeregel mit Ausgabenprofil,
 * Einmalausgaben, Renditen nach TER, Rebalancing und die Erfolgsprüfung. Steuern, gesetzliche
 * Rente sowie Kranken- und Pflegeversicherung sind nicht Teil dieses Schritts.
 */
export function createPathSimulator(plan: RetirementPlan): PathSimulator {
  const { household, savings, spending, market, rebalancing } = plan
  const years = simulationYears(household)
  const targetFor = allocationPolicy(plan.strategy)
  const consumptionFor = withdrawalPolicy(spending, household)
  const ter: AssetVector = { equity: market.equity.ter, bonds: market.bonds.ter, cash: 0 }

  const start = targetFor(household.currentAge)
  const phases = Array.from({ length: years }, (_, t) =>
    phaseForAge(household, plan.statePension, household.currentAge + t),
  )

  return (returns, onYear) => {
    for (const series of [returns.equity, returns.bonds, returns.cash, returns.inflation]) {
      if (series.length < years) {
        throw new RangeError(`Der Renditepfad deckt nur ${series.length} von ${years} Jahren ab.`)
      }
    }
    let holdings: AssetVector = {
      equity: start.equity * plan.portfolio.totalValue,
      bonds: start.bonds * plan.portfolio.totalValue,
      cash: start.cash * plan.portfolio.totalValue,
    }
    let index = 1

    for (let t = 0; t < years; t++) {
      const age = household.currentAge + t
      const target = targetFor(age)
      const retired = age >= household.retirementAge

      // 1.–2. Phase und Bedarf zu Jahresbeginn, nominal
      const consumption = retired
        ? consumptionFor({ age, portfolioValue: totalOf(holdings), inflationIndex: index }) *
          profileFactor(spending.ageProfile, age)
        : 0
      const oneOff = oneOffsAt(spending.oneOffs, age) * index
      const saving = retired ? 0 : savings.yearlyNet * Math.pow(1 + savings.realGrowth, t) * index

      // 4.–5. Bedarf zuerst aus der Sparrate, Überschuss investieren, Lücke durch Verkäufe decken
      const need = consumption + oneOff
      let contributions = 0
      let grossSales = 0
      let available: number
      if (saving >= need) {
        contributions = saving - need
        holdings = invest(holdings, target, contributions, rebalancing.taxAware).holdings
        available = need
      } else {
        const sale = sell(holdings, target, need - saving, rebalancing.taxAware)
        holdings = sale.holdings
        grossSales = sale.total
        available = saving + grossSales
      }
      // Laufender Konsum hat Vorrang vor Einmalausgaben.
      const netConsumption = Math.min(consumption, available)
      const oneOffSpending = Math.max(0, Math.min(oneOff, available - netConsumption))

      // 6. Renditen nach TER
      const invested = totalOf(holdings)
      const grown: AssetVector = { ...holdings }
      for (const k of ASSET_CLASSES) grown[k] *= 1 + netOfCost(returns[k][t], ter[k])
      const portfolioReturn = invested > 0 ? totalOf(grown) / invested - 1 : null

      // 8. Rebalancing bei Erreichen des Bands
      const rebalanced = rebalanceIfOutsideBand(grown, target, rebalancing.band)
      holdings = rebalanced.holdings

      // 9. Fortschreibung des Preisindex
      const indexEnd = index * (1 + returns.inflation[t])

      // 10. Erfolgsprüfung gegen den inflationierten Mindestkonsum
      const rawShortfall = retired
        ? spending.minimumAcceptableConsumption * index - netConsumption
        : 0
      const shortfall = rawShortfall > SHORTFALL_TOLERANCE ? rawShortfall : 0

      const shares = sharesOf(holdings)
      onYear({
        year: household.startYear + t,
        age,
        phase: phases[t],
        equity: holdings.equity,
        bonds: holdings.bonds,
        cash: holdings.cash,
        total: totalOf(holdings),
        contributions,
        grossSales,
        rebalanceSales: rebalanced.sales,
        netConsumption,
        oneOffSpending,
        shortfall,
        portfolioReturn,
        inflationIndex: index,
        inflationIndexEnd: indexEnd,
        equityShare: shares.equity,
        bondShare: shares.bonds,
        cashShare: shares.cash,
      })
      index = indexEnd
    }
  }
}

/** Simuliert einen Pfad und liefert alle Jahreszeilen. */
export function simulatePath(plan: RetirementPlan, returns: ReturnPath): YearResult[] {
  const rows: YearResult[] = []
  createPathSimulator(plan)(returns, (row) => rows.push(row))
  return rows
}
