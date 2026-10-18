import type { Household, StatePension } from '../model/types'
import type { Phase } from './types'

/** Anzahl simulierter Jahre: vom aktuellen Alter bis einschließlich des Horizontalters. */
export function simulationYears(household: Household): number {
  return household.planningHorizonAge - household.currentAge + 1
}

/** Erwerb vor `retirementAge`, Überbrückung bis zum Rentenbeginn, danach Rente. */
export function phaseForAge(household: Household, pension: StatePension, age: number): Phase {
  if (age < household.retirementAge) return 'work'
  if (age < pension.startAge) return 'bridge'
  return 'pension'
}
