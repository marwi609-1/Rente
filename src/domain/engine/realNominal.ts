import type { YearResult } from './types'

export function toReal(nominal: number, inflationIndex: number): number {
  return nominal / inflationIndex
}

export function toNominal(real: number, inflationIndex: number): number {
  return real * inflationIndex
}

/**
 * Beträge, die zu Jahresbeginn anfallen bzw. dem ganzen Jahr zugeordnet sind (Rente, Steuern, KV)
 * und mit `inflationIndex` umgerechnet werden.
 */
const START_OF_YEAR_FIELDS = [
  'contributions',
  'grossSales',
  'netConsumption',
  'oneOffSpending',
  'shortfall',
  'pensionGross',
  'pensionNet',
  'otherIncomeGross',
  'otherIncomeNet',
  'capitalTax',
  'incomeTax',
  'healthInsurance',
] as const satisfies readonly (keyof YearResult)[]

/** Beträge zum Jahresende, die mit `inflationIndexEnd` umgerechnet werden. */
const END_OF_YEAR_FIELDS = [
  'equity',
  'bonds',
  'cash',
  'total',
  'taxSales',
  'rebalanceSales',
  'lossCarryForward',
] as const satisfies readonly (keyof YearResult)[]

function convert(row: YearResult, f: (value: number, index: number) => number): YearResult {
  const out = { ...row }
  for (const key of START_OF_YEAR_FIELDS) out[key] = f(row[key], row.inflationIndex)
  for (const key of END_OF_YEAR_FIELDS) out[key] = f(row[key], row.inflationIndexEnd)
  return out
}

/** Nominale Jahreszeile in Euro von heute (Kaufkraft zu Beginn des Startjahres). */
export function yearResultToReal(row: YearResult): YearResult {
  return convert(row, toReal)
}

/** Reale Jahreszeile zurück in nominale Euro. */
export function yearResultToNominal(row: YearResult): YearResult {
  return convert(row, toNominal)
}

/** Nominale Ergebnisse in der gewünschten Ausgabeeinheit. */
export function inOutputUnit(rows: readonly YearResult[], real: boolean): YearResult[] {
  return real ? rows.map(yearResultToReal) : rows.slice()
}
