import type { ReturnPath } from '../market/types'
import { netOfCost } from '../market/returns'
import type { AssetVector, RetirementPlan } from '../model/types'
import { pensionSchedule } from '../social/pension'
import { allocationPolicy } from '../strategy/allocation'
import { ASSET_CLASSES, invest, sell, sharesOf, totalOf } from '../strategy/flows'
import { maxDeviation } from '../strategy/rebalance'
import { annualCharges, type ChargeSettings, type Charges } from '../tax/annualCharges'
import { vorabpauschale } from '../tax/capitalIncome'
import { oneOffsAt, profileFactor } from '../withdrawal/profile'
import { ruleSetsTotalConsumption, withdrawalPolicy } from '../withdrawal/rules'
import type { EngineContext } from './context'
import { solveFixpoint } from './fixpoint'
import { phaseForAge, simulationYears } from './timeline'
import type { YearResult } from './types'

/** Fehlbeträge unter einem Cent gelten als Rundungsrauschen. */
const SHORTFALL_TOLERANCE = 0.01

/** Einstandswerte der Fondsanteile (Durchschnittsmethode); Cash hat keinen Kursgewinn. */
interface CostBasis {
  equity: number
  bonds: number
}

const FUNDS = ['equity', 'bonds'] as const

interface SaleOutcome {
  holdings: AssetVector
  basis: CostBasis
  proceeds: number
  /** realisierter Gewinn nach Teilfreistellung (Verlust negativ) */
  taxableGain: number
}

/** Verkauf zu den Beträgen `amounts`: Gewinnanteil = 1 − Einstand/Kurswert je Fonds. */
function applySale(
  holdings: AssetVector,
  basis: CostBasis,
  amounts: AssetVector,
  exemption: CostBasis,
): SaleOutcome {
  const next: AssetVector = {
    equity: holdings.equity - amounts.equity,
    bonds: holdings.bonds - amounts.bonds,
    cash: holdings.cash - amounts.cash,
  }
  const nextBasis = { ...basis }
  let taxableGain = 0
  for (const k of FUNDS) {
    if (amounts[k] <= 0 || holdings[k] <= 0) continue
    const basisShare = basis[k] / holdings[k]
    taxableGain += amounts[k] * (1 - basisShare) * (1 - exemption[k])
    nextBasis[k] = next[k] > 0 ? basis[k] - amounts[k] * basisShare : 0
  }
  return { holdings: next, basis: nextBasis, proceeds: totalOf(amounts), taxableGain }
}

function addToBasis(basis: CostBasis, purchases: AssetVector): CostBasis {
  return { equity: basis.equity + purchases.equity, bonds: basis.bonds + purchases.bonds }
}

/** Simuliert einen Pfad zu gegebenen Jahresrenditen und meldet jedes Jahr an `onYear`. */
export type PathSimulator = (returns: ReturnPath, onYear: (row: YearResult) => void) => void

/**
 * Bereitet die Simulation eines Plans in Jahresschritten vor (Spezifikation Abschnitt 7):
 * Bedarf laut Entnahmeregel, gesetzliche Rente, Brutto-Hochrechnung der Verkäufe über Steuern und
 * KV, Sparrate, Renditen nach TER, Vorabpauschale und Zinsen zum Jahresende, Rebalancing mit
 * Steuern, Fortschreibung von Einstand und Verlustvortrag, Erfolgsprüfung.
 */
export function createPathSimulator(plan: RetirementPlan, ctx: EngineContext): PathSimulator {
  const { household, savings, spending, market, rebalancing, tax } = plan
  const { params } = ctx
  const years = simulationYears(household)
  const targetFor = allocationPolicy(plan.strategy)
  const consumptionFor = withdrawalPolicy(spending, household)
  const totalConsumptionRule = ruleSetsTotalConsumption(spending.rule)
  const ter: AssetVector = { equity: market.equity.ter, bonds: market.bonds.ter, cash: 0 }
  const exemption: CostBasis = tax.partialExemption
  const basiszins = tax.basiszins.type === 'fixed' ? tax.basiszins.rate : market.bonds.mean
  const pension = pensionSchedule(household, plan.statePension, years, params)
  const settings: ChargeSettings = {
    params,
    tax,
    health: plan.health,
    childless: household.childless,
    churchTaxRate: household.churchTaxRate,
  }
  const startAllocation = targetFor(household.currentAge)
  const phases = Array.from({ length: years }, (_, t) =>
    phaseForAge(household, plan.statePension, household.currentAge + t),
  )

  return (returns, onYear) => {
    for (const series of [returns.equity, returns.bonds, returns.cash, returns.inflation]) {
      if (series.length < years) {
        throw new RangeError(`Der Renditepfad deckt nur ${series.length} von ${years} Jahren ab.`)
      }
    }
    const initial = plan.portfolio.totalValue
    let holdings: AssetVector = {
      equity: startAllocation.equity * initial,
      bonds: startAllocation.bonds * initial,
      cash: startAllocation.cash * initial,
    }
    let basis: CostBasis = {
      equity: holdings.equity * plan.portfolio.costBasisShare,
      bonds: holdings.bonds * plan.portfolio.costBasisShare,
    }
    let lossCarryForward = plan.portfolio.lossCarryForward
    let index = 1

    for (let t = 0; t < years; t++) {
      const age = household.currentAge + t
      const target = targetFor(age)
      const phase = phases[t]
      const retired = age >= household.retirementAge
      const pensionGross = pension.gross[t]
      const year = {
        phase,
        yearIndex: t,
        pensionGross,
        pensionAllowance: pension.allowance,
        lossCarryForward,
        indexFactor: tax.indexBracketsWithInflation ? index : 1,
      }
      const chargesFor = (capitalNet: number) => annualCharges(settings, year, capitalNet)
      const pensionNetOf = (c: Charges) =>
        Math.max(0, pensionGross - c.incomeTax - c.healthOnPension)

      // 1.–2. Bedarf zu Jahresbeginn, nominal
      const ruleAmount = retired
        ? consumptionFor({ age, portfolioValue: totalOf(holdings), inflationIndex: index }) *
          profileFactor(spending.ageProfile, age)
        : 0
      const consumptionTarget = (c: Charges) =>
        totalConsumptionRule || !retired ? ruleAmount : ruleAmount + pensionNetOf(c)
      const oneOff = oneOffsAt(spending.oneOffs, age) * index
      const saving = retired ? 0 : savings.yearlyNet * Math.pow(1 + savings.realGrowth, t) * index
      const inflows = saving + pensionGross

      // 3.–4. Verkauf so hochrechnen, dass nach Steuern und KV der Netto-Bedarf gedeckt ist
      const opening = solveFixpoint(
        'Die Brutto-Hochrechnung der Entnahme',
        (amount) => {
          const planned = sell(holdings, target, amount, rebalancing.taxAware)
          const sale = applySale(holdings, basis, planned.amounts, exemption)
          const charges = chargesFor(sale.taxableGain)
          const required = consumptionTarget(charges) + oneOff + charges.total - inflows
          return { required, state: { sale, charges } }
        },
        { lower: 0, upper: totalOf(holdings), start: 0 },
      )
      const { sale: openingSale } = opening.state
      let charges = opening.state.charges
      holdings = openingSale.holdings
      basis = openingSale.basis
      let capitalNet = openingSale.taxableGain
      let paid = charges.total
      const grossSales = openingSale.proceeds

      // Konsum vor Einmalausgaben; ein Überschuss (Sparrate, Rente) wird investiert (Schritt 5)
      const available = inflows + grossSales - charges.total
      const netConsumption = Math.max(0, Math.min(consumptionTarget(charges), available))
      const oneOffSpending = Math.max(0, Math.min(oneOff, available - netConsumption))
      const contributions = Math.max(0, available - netConsumption - oneOffSpending)
      if (contributions > 0) {
        const purchase = invest(holdings, target, contributions, rebalancing.taxAware)
        holdings = purchase.holdings
        basis = addToBasis(basis, purchase.amounts)
      }

      // 6. Renditen nach TER
      const invested = totalOf(holdings)
      const grown: AssetVector = { ...holdings }
      for (const k of ASSET_CLASSES) grown[k] *= 1 + netOfCost(returns[k][t], ter[k])
      const portfolioReturn = invested > 0 ? totalOf(grown) / invested - 1 : null

      // 7. Vorabpauschale und Zinsen; Nachzahlung aus Cash, sonst durch Verkauf
      const vpEquity = vorabpauschale(
        holdings.equity,
        grown.equity - holdings.equity,
        basiszins,
        params,
      )
      const vpBonds = vorabpauschale(
        holdings.bonds,
        grown.bonds - holdings.bonds,
        basiszins,
        params,
      )
      const interest = holdings.cash * returns.cash[t]
      basis = { equity: basis.equity + vpEquity, bonds: basis.bonds + vpBonds }
      capitalNet += vpEquity * (1 - exemption.equity) + vpBonds * (1 - exemption.bonds) + interest
      holdings = grown

      let taxSales = 0
      charges = chargesFor(capitalNet)
      const due = charges.total - paid
      if (due <= holdings.cash) {
        holdings = { ...holdings, cash: holdings.cash - due }
      } else {
        const cash = holdings.cash
        const funds: AssetVector = { ...holdings, cash: 0 }
        const settled = solveFixpoint(
          'Die Zahlung der Steuern zum Jahresende',
          (amount) => {
            const planned = sell(funds, target, amount, rebalancing.taxAware)
            const sale = applySale(funds, basis, planned.amounts, exemption)
            const c = chargesFor(capitalNet + sale.taxableGain)
            return { required: c.total - paid - cash, state: { sale, charges: c } }
          },
          { lower: 0, upper: totalOf(funds), start: due - cash },
        )
        const { sale } = settled.state
        charges = settled.state.charges
        taxSales = sale.proceeds
        basis = sale.basis
        capitalNet += sale.taxableGain
        const remaining = cash + sale.proceeds - (charges.total - paid)
        holdings = { ...sale.holdings, cash: Math.max(0, remaining) }
      }
      paid = charges.total

      // 8. Rebalancing bei Erreichen des Bands; Steuern auf Verkäufe mindern das Zielvolumen
      let rebalanceSales = 0
      const total = totalOf(holdings)
      if (total > 0 && maxDeviation(holdings, target) >= rebalancing.band) {
        const current = holdings
        const rebalanced = solveFixpoint(
          'Die Steuer auf das Rebalancing',
          (extraCharges) => {
            const volume = total - extraCharges
            const desired: AssetVector = {
              equity: target.equity * volume,
              bonds: target.bonds * volume,
              cash: target.cash * volume,
            }
            const sells: AssetVector = {
              equity: Math.max(0, current.equity - desired.equity),
              bonds: Math.max(0, current.bonds - desired.bonds),
              cash: Math.max(0, current.cash - desired.cash),
            }
            const sale = applySale(current, basis, sells, exemption)
            const c = chargesFor(capitalNet + sale.taxableGain)
            return { required: c.total - paid, state: { desired, sells, sale, charges: c } }
          },
          { lower: -total, upper: total, start: 0 },
        )
        const { desired, sells, sale } = rebalanced.state
        charges = rebalanced.state.charges
        rebalanceSales = totalOf(sells)
        capitalNet += sale.taxableGain
        basis = addToBasis(sale.basis, {
          equity: Math.max(0, desired.equity - current.equity),
          bonds: Math.max(0, desired.bonds - current.bonds),
          cash: 0,
        })
        holdings = desired
        paid = charges.total
      }

      // 9. Fortschreibung von Verlustvortrag und Preisindex
      lossCarryForward = charges.lossCarryForward
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
        phase,
        equity: holdings.equity,
        bonds: holdings.bonds,
        cash: holdings.cash,
        total: totalOf(holdings),
        contributions,
        grossSales,
        taxSales,
        rebalanceSales,
        netConsumption,
        oneOffSpending,
        shortfall,
        pensionGross,
        pensionNet: retired ? pensionNetOf(charges) : 0,
        capitalTax: charges.capitalTax,
        incomeTax: charges.incomeTax,
        healthInsurance: charges.health,
        lossCarryForward,
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
export function simulatePath(
  plan: RetirementPlan,
  returns: ReturnPath,
  ctx: EngineContext,
): YearResult[] {
  const rows: YearResult[] = []
  createPathSimulator(plan, ctx)(returns, (row) => rows.push(row))
  return rows
}
