import type { RetirementPlan } from './types'

/** Default-Szenario „Basis“ (Spezifikation Abschnitt 13) für ein gegebenes Startjahr. */
export function createDefaultPlan(startYear: number): RetirementPlan {
  return {
    schemaVersion: 2,
    name: 'Basis',
    household: {
      startYear,
      currentAge: 52,
      sex: 'm',
      retirementAge: 57,
      planningHorizonAge: 95,
      // Näherung für einen Mann des Jahrgangs 1974, Abgleich mit Destatis in docs/ASSUMPTIONS.md
      longevity: { type: 'gompertz', modalAge: 88, dispersion: 10 },
      childless: false,
      churchTaxRate: 0,
    },
    portfolio: { totalValue: 1_300_000, costBasisShare: 0.7, lossCarryForward: 0 },
    savings: { yearlyNet: 30_000, realGrowth: 0 },
    spending: {
      // Ursprung: yearlyWithdrawal 100.000, hier als Netto-Konsum gelesen
      netConsumption: 100_000,
      minimumAcceptableConsumption: 70_000,
      rule: { type: 'fixed-real' },
      ageProfile: [],
      oneOffs: [],
    },
    statePension: {
      regularAge: 67,
      startAge: 67,
      // Beispielwert – aus eigener Renteninformation ersetzen
      monthlyGrossCurrent: 1_600,
      // entspricht 24.000 € p. a. aus der Ursprungsversion
      monthlyGrossProjected: 2_000,
      earlyStartAllowed: true,
      adjustmentRate: 0.025,
    },
    additionalIncome: [],
    health: {
      bridgePhase: { type: 'gkv-voluntary' },
      pensionPhase: { type: 'gkv' },
      kvdrEligible: true,
      paramsGrowth: 0.025,
    },
    tax: {
      enabled: true,
      saverAllowance: 1_000,
      partialExemption: { equity: 0.3, bonds: 0 },
      // Basiszins 2026: 3,20 % laut BMF-Schreiben vom 13.01.2026 (IV C 1 - S 1980/00230/012/001)
      basiszins: { type: 'fixed', rate: 0.032 },
      costBasisMethod: 'average',
      guenstigerpruefung: true,
      indexBracketsWithInflation: true,
    },
    market: {
      type: 'lognormal',
      equity: { mean: 0.08, vol: 0.15, ter: 0.002 },
      bonds: { mean: 0.03, vol: 0.05, ter: 0.0015 },
      cash: { mean: 0.02, vol: 0.01 },
      inflation: { mean: 0.02, vol: 0.015 },
      correlation: [
        [1.0, 0.1, 0.0, -0.1],
        [0.1, 1.0, 0.3, -0.2],
        [0.0, 0.3, 1.0, 0.5],
        [-0.1, -0.2, 0.5, 1.0],
      ],
      studentDf: 5,
      bootstrap: { meanBlockLength: 5 },
    },
    strategy: {
      type: 'glidepath',
      points: [
        { age: 57, equity: 0.55 },
        { age: 62, equity: 0.6 },
        { age: 67, equity: 0.65 },
        { age: 72, equity: 0.7 },
      ],
      cash: 0.05,
    },
    rebalancing: { band: 0.05, taxAware: true },
    simulation: { paths: 10_000, seed: 42, outputReal: true, successTargetRate: 0.9 },
  }
}

export const defaultPlan: RetirementPlan = createDefaultPlan(new Date().getFullYear())
