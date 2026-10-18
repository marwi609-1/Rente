import type { ReturnPath } from '../market/types'
import { geometricMean, netOfCost } from '../market/returns'
import type { Allocation, AssetVector, RetirementPlan } from '../model/types'
import { pensionSchedule } from '../social/pension'
import { allocationPolicy } from '../strategy/allocation'
import { bucketAllocation, bucketTargets, refillPlan, sequentialSale } from '../strategy/bucket'
import { ASSET_CLASSES, invest, sell, sharesOf, totalOf, zeroVector } from '../strategy/flows'
import { maxDeviation } from '../strategy/rebalance'
import { annualCharges, type ChargeSettings, type Charges } from '../tax/annualCharges'
import { vorabpauschale } from '../tax/capitalIncome'
import { oneOffsAt, profileFactor } from '../withdrawal/profile'
import {
  remainingYears,
  ruleSetsTotalConsumption,
  vpwFactor,
  withdrawalPolicy,
} from '../withdrawal/rules'
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
  const bucket = plan.strategy.type === 'bucket' ? plan.strategy : null
  const allocationFor = plan.strategy.type === 'bucket' ? null : allocationPolicy(plan.strategy)
  const newWithdrawalPolicy = withdrawalPolicy(spending, household)
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
  const phases = Array.from({ length: years }, (_, t) =>
    phaseForAge(household, plan.statePension, household.currentAge + t),
  )

  /** Netto-Rente im Jahr t bei Preisindex `indexAt`, nur mit Steuer und KV auf die Rente. */
  const expectedPensionNet = (t: number, indexAt: number): number => {
    if (t >= years || pension.gross[t] <= 0) return 0
    const c = annualCharges(
      settings,
      {
        phase: phases[t],
        yearIndex: t,
        pensionGross: pension.gross[t],
        pensionAllowance: pension.allowance,
        lossCarryForward: 0,
        indexFactor: tax.indexBracketsWithInflation ? indexAt : 1,
      },
      0,
    )
    return Math.max(0, pension.gross[t] - c.incomeTax - c.healthOnPension)
  }

  /**
   * Erwartete Netto-Lücke (Konsum − Netto-Rente) des Jahres t bei Preisindex `indexAt` für den
   * Bucket. Bei Regeln, die den depotfinanzierten Konsum bestimmen, ist sie dieser Betrag
   * (`depotAmount`); bei `fixed-real` der Netto-Konsum abzüglich der erwarteten Netto-Rente.
   */
  const expectedGap = (t: number, indexAt: number, depotAmount: number): number => {
    if (!totalConsumptionRule) return depotAmount
    const consumption =
      spending.netConsumption *
      profileFactor(spending.ageProfile, household.currentAge + t) *
      indexAt
    return Math.max(0, consumption - expectedPensionNet(t, indexAt))
  }

  // Bucket vor dem Ruhestand: Allokation, die sich zu Ruhestandsbeginn ergäbe, mit dem aktuellen
  // Depotwert und der erwarteten Inflation bis dahin.
  const retirementOffset = household.retirementAge - household.currentAge
  const expectedInflation = geometricMean(market.inflation.mean, market.inflation.vol)
  const depotAmountAtRetirement = (total: number): number => {
    const rule = spending.rule
    const profile = profileFactor(spending.ageProfile, household.retirementAge)
    switch (rule.type) {
      case 'fixed-real':
        return 0
      case 'percent-of-portfolio':
        return rule.rate * total * profile
      case 'guyton-klinger':
        return rule.initialRate * total * profile
      case 'vpw':
        return (
          total *
          vpwFactor(rule.expectedRealReturn, remainingYears(household, household.retirementAge)) *
          profile
        )
      case 'floor-ceiling':
        return rule.rate * total * profile
    }
  }
  const preRetirementGap = (t: number, indexAt: number, total: number): number => {
    const indexAtRetirement = indexAt * Math.pow(1 + expectedInflation, retirementOffset - t)
    const gapThen = expectedGap(retirementOffset, indexAtRetirement, 0)
    // in Kaufkraft des laufenden Jahres zurückrechnen
    return totalConsumptionRule
      ? (gapThen * indexAt) / indexAtRetirement
      : depotAmountAtRetirement(total)
  }

  const targetAt = (t: number, indexAt: number, total: number, depotAmount: number): Allocation => {
    if (!bucket)
      return (allocationFor as NonNullable<typeof allocationFor>)(household.currentAge + t)
    const gap =
      t < retirementOffset
        ? preRetirementGap(t, indexAt, total)
        : expectedGap(t, indexAt, depotAmount)
    return bucketAllocation(bucketTargets(bucket, gap), total)
  }

  const startAllocation = targetAt(
    0,
    1,
    plan.portfolio.totalValue,
    retirementOffset <= 0 ? depotAmountAtRetirement(plan.portfolio.totalValue) : 0,
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
    let previousReturn: number | null = null
    const consumptionFor = newWithdrawalPolicy()

    for (let t = 0; t < years; t++) {
      const age = household.currentAge + t
      const phase = phases[t]
      const retired = age >= household.retirementAge
      const bucketRetired = bucket !== null && retired
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
        ? consumptionFor({
            age,
            portfolioValue: totalOf(holdings),
            inflationIndex: index,
            previousReturn,
          }) * profileFactor(spending.ageProfile, age)
        : 0
      const target = targetAt(t, index, totalOf(holdings), ruleAmount)
      // Bucket im Ruhestand: Entnahmen der Reihe nach aus Cash, Anleihen, Aktien
      const planSale = (from: AssetVector, amount: number): AssetVector =>
        bucketRetired
          ? sequentialSale(from, amount)
          : sell(from, target, amount, rebalancing.taxAware).amounts
      const consumptionTarget = (c: Charges) =>
        totalConsumptionRule || !retired ? ruleAmount : ruleAmount + pensionNetOf(c)
      const oneOff = oneOffsAt(spending.oneOffs, age) * index
      const saving = retired ? 0 : savings.yearlyNet * Math.pow(1 + savings.realGrowth, t) * index
      const inflows = saving + pensionGross

      // 3.–4. Verkauf so hochrechnen, dass nach Steuern und KV der Netto-Bedarf gedeckt ist
      const opening = solveFixpoint(
        'Die Brutto-Hochrechnung der Entnahme',
        (amount) => {
          const sale = applySale(holdings, basis, planSale(holdings, amount), exemption)
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
        // Bucket im Ruhestand: Überschüsse füllen zuerst die Töpfe unter ihrem Ziel
        const purchase = invest(
          holdings,
          target,
          contributions,
          bucketRetired || rebalancing.taxAware,
        )
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
            const sale = applySale(funds, basis, planSale(funds, amount), exemption)
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

      const indexEnd = index * (1 + returns.inflation[t])

      // 8. Bucket im Ruhestand: Auffüllen für das Folgejahr; Steuern zahlt Cash, sonst der Zielkauf
      let rebalanceSales = 0
      const total = totalOf(holdings)
      if (bucket && bucketRetired) {
        if (t + 1 < years) {
          const targets = bucketTargets(
            bucket,
            expectedGap(t + 1, indexEnd, (ruleAmount * indexEnd) / index),
          )
          const equityReturn = netOfCost(returns.equity[t], ter.equity)
          const refill = refillPlan(bucket, holdings, targets, equityReturn)
          const sells: AssetVector = {
            equity: refill.equityToBonds,
            bonds: refill.bondsToCash,
            cash: 0,
          }
          const sale = applySale(holdings, basis, sells, exemption)
          charges = chargesFor(capitalNet + sale.taxableGain)
          const refillDue = charges.total - paid
          const cashAfter = holdings.cash + refill.bondsToCash - refillDue
          const bondPurchase = Math.max(0, refill.equityToBonds + Math.min(0, cashAfter))
          capitalNet += sale.taxableGain
          basis = addToBasis(sale.basis, { equity: 0, bonds: bondPurchase, cash: 0 })
          holdings = {
            equity: sale.holdings.equity,
            bonds: sale.holdings.bonds + bondPurchase,
            cash: Math.max(0, cashAfter),
          }
          rebalanceSales = refill.bondsToCash + refill.equityToBonds
          paid = charges.total
        }
      } else if (total > 0 && maxDeviation(holdings, target) >= rebalancing.band) {
        // 8. Rebalancing bei Erreichen des Bands. Mit taxAware zählt die bekannte Sparrate des
        // Folgejahres zum Zielvolumen: verkauft wird nur, was dieser Zufluss nicht ausgleicht.
        // Steuern auf die Verkäufe mindern das Zielvolumen.
        const inflow =
          rebalancing.taxAware && age + 1 < household.retirementAge
            ? Math.max(
                0,
                (savings.yearlyNet * Math.pow(1 + savings.realGrowth, t + 1) -
                  oneOffsAt(spending.oneOffs, age + 1)) *
                  indexEnd,
              )
            : 0
        const current = holdings
        const rebalanced = solveFixpoint(
          'Die Steuer auf das Rebalancing',
          (extraCharges) => {
            const volume = total + inflow - extraCharges
            const sells = zeroVector()
            const deficits = zeroVector()
            for (const k of ASSET_CLASSES) {
              sells[k] = Math.max(0, current[k] - target[k] * volume)
              deficits[k] = Math.max(0, target[k] * volume - current[k])
            }
            const sale = applySale(current, basis, sells, exemption)
            const c = chargesFor(capitalNet + sale.taxableGain)
            return { required: c.total - paid, state: { sells, deficits, sale, charges: c } }
          },
          { lower: -total, upper: total, start: 0 },
        )
        const { sells, deficits, sale } = rebalanced.state
        charges = rebalanced.state.charges
        // Der Erlös nach Steuern füllt die Lücken anteilig; Σ Lücken = Σ Verkäufe + Zufluss − Steuer,
        // ohne Zufluss gehen sie also genau auf.
        const proceeds = Math.max(0, sale.proceeds - (charges.total - paid))
        const deficitSum = totalOf(deficits)
        const buys = zeroVector()
        if (deficitSum > 0) {
          for (const k of ASSET_CLASSES) buys[k] = (proceeds * deficits[k]) / deficitSum
        }
        rebalanceSales = totalOf(sells)
        capitalNet += sale.taxableGain
        basis = addToBasis(sale.basis, buys)
        holdings = {
          equity: sale.holdings.equity + buys.equity,
          bonds: sale.holdings.bonds + buys.bonds,
          cash: sale.holdings.cash + buys.cash,
        }
        paid = charges.total
      }

      // 9. Fortschreibung des Verlustvortrags
      lossCarryForward = charges.lossCarryForward

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
      previousReturn = portfolioReturn
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
