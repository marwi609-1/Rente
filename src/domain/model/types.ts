/**
 * Datenmodell des Ruhestandsplaners (Spezifikation Abschnitt 6).
 *
 * Konventionen (Abschnitt 5):
 * - Raten als Dezimalzahl (0.02 = 2 %), Beträge in Euro.
 * - Alle Eingabebeträge gelten in heutiger Kaufkraft (Startjahr), intern wird nominal gerechnet.
 * - Renditen: arithmetisches Mittel der einfachen Jahresrendite, nominal, vor Kosten.
 */

/** Dezimalrate, z. B. 0.02 = 2 %. */
export type Rate = number
/** Betrag in Euro. */
export type EUR = number

export type AssetClass = 'equity' | 'bonds' | 'cash'

/** Wert je Anlageklasse (Euro oder Anteil, je nach Kontext). */
export type AssetVector = Record<AssetClass, number>

/** Zielallokation; die drei Anteile liegen in [0, 1] und summieren sich zu 1. */
export interface Allocation {
  equity: Rate
  bonds: Rate
  cash: Rate
}

export interface RetirementPlan {
  schemaVersion: 2
  name: string
  household: Household
  portfolio: PortfolioStart
  savings: Savings
  spending: Spending
  statePension: StatePension
  health: HealthInsurance
  tax: TaxConfig
  market: MarketModel
  strategy: StrategyConfig
  rebalancing: Rebalancing
  simulation: SimulationSettings
}

export type Longevity =
  { type: 'fixed' } | { type: 'gompertz'; modalAge: number; dispersion: number } | { type: 'table' }

export interface Household {
  startYear: number
  currentAge: number
  /** nur für Sterblichkeit */
  sex: 'm' | 'w'
  /** erstes Lebensjahr ohne Erwerbseinkommen */
  retirementAge: number
  /** fester Horizont; das Jahr, in dem dieses Alter erreicht wird, wird noch simuliert */
  planningHorizonAge: number
  longevity: Longevity
  /** PV-Zuschlag */
  childless: boolean
  churchTaxRate: 0 | 0.08 | 0.09
}

export interface PortfolioStart {
  /** wird nach Zielallokation im Startjahr aufgeteilt */
  totalValue: EUR
  /** Einstand / Kurswert für Aktien- und Anleihe-ETFs */
  costBasisShare: Rate
  lossCarryForward: EUR
}

export interface Savings {
  /** bis retirementAge, in heutiger Kaufkraft */
  yearlyNet: EUR
  realGrowth: Rate
}

export interface AgeFactor {
  age: number
  factor: number
}

export interface OneOff {
  age: number
  amount: EUR
  label: string
}

export interface Spending {
  /** Netto-Konsum p. a. ab Ruhestand, heutige Kaufkraft */
  netConsumption: EUR
  /** Erfolgskriterium, heutige Kaufkraft */
  minimumAcceptableConsumption: EUR
  rule: WithdrawalRule
  /** lineare Interpolation, leer = Faktor 1 */
  ageProfile: AgeFactor[]
  /** heutige Kaufkraft */
  oneOffs: OneOff[]
}

export type WithdrawalRule =
  | { type: 'fixed-real' }
  | { type: 'percent-of-portfolio'; rate: Rate }
  | { type: 'guyton-klinger'; initialRate: Rate; guardBand: Rate; adjustment: Rate }
  | { type: 'vpw'; expectedRealReturn: Rate }
  | { type: 'floor-ceiling'; rate: Rate; floorFactor: Rate; ceilingFactor: Rate }

export interface StatePension {
  /** Regelaltersgrenze */
  regularAge: number
  /** gewünschter Rentenbeginn */
  startAge: number
  /** bisher erworbener Anspruch laut Renteninformation */
  monthlyGrossCurrent: EUR
  /** Hochrechnung bei Weiterbeitrag bis Regelalter */
  monthlyGrossProjected: EUR
  /** 35 Jahre Wartezeit erfüllt */
  earlyStartAllowed: boolean
  /** nominale Rentenanpassung p. a. ab heute */
  adjustmentRate: Rate
}

export type BridgeHealthInsurance =
  { type: 'gkv-voluntary' } | { type: 'pkv'; monthlyPremium: EUR; premiumGrowth: Rate }

export interface HealthInsurance {
  /** zwischen retirementAge und Rentenbeginn */
  bridgePhase: BridgeHealthInsurance
  /** Vorversicherungszeit für die KVdR erfüllt */
  kvdrEligible: boolean
  /** Fortschreibung Mindestbemessung/BBG p. a. */
  paramsGrowth: Rate
}

export type Basiszins = { type: 'fixed'; rate: Rate } | { type: 'bond-mean' }

export interface TaxConfig {
  enabled: boolean
  saverAllowance: EUR
  partialExemption: { equity: Rate; bonds: Rate }
  basiszins: Basiszins
  /** FIFO ist ein Nicht-Ziel in v1 */
  costBasisMethod: 'average'
  guenstigerpruefung: boolean
  indexBracketsWithInflation: boolean
}

export type MarketModelType =
  'deterministic' | 'lognormal' | 'student-t' | 'historical-sequence' | 'block-bootstrap'

export interface AssetReturnParams {
  mean: Rate
  vol: Rate
  ter: Rate
}

export interface SeriesParams {
  mean: Rate
  vol: Rate
}

export interface MarketModel {
  type: MarketModelType
  equity: AssetReturnParams
  bonds: AssetReturnParams
  cash: SeriesParams
  inflation: SeriesParams
  /** Reihenfolge: equity, bonds, cash, inflation */
  correlation: number[][]
  studentDf?: number
  bootstrap?: { meanBlockLength: number; fromYear?: number; toYear?: number }
}

export type FixedStrategy = { type: 'fixed'; equity: Rate; cash: Rate }

export type GlidepathStrategy = {
  type: 'glidepath'
  points: { age: number; equity: Rate }[]
  cash: Rate
}

export type BondTentStrategy = {
  type: 'bond-tent'
  startAge: number
  startEquity: Rate
  peakAge: number
  peakEquity: Rate
  endAge: number
  endEquity: Rate
  cash: Rate
}

export type BucketStrategy = {
  type: 'bucket'
  cashYears: number
  bondYears: number
  refillRule: 'annual' | 'equity-up-only'
  equityUpThreshold: Rate
}

export type StrategyConfig = FixedStrategy | GlidepathStrategy | BondTentStrategy | BucketStrategy

export interface Rebalancing {
  /** absolute Abweichung, ab der rebalanciert wird */
  band: Rate
  /** bevorzugt über Zu- und Abflüsse statt über Verkäufe */
  taxAware: boolean
}

export interface SimulationSettings {
  /** Default 10.000, erlaubt 1.000–100.000 */
  paths: number
  seed: number
  outputReal: boolean
  /** für die Suche der sicheren Entnahme */
  successTargetRate: Rate
}
