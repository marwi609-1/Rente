/** Einheiten der Eingabefelder: Anzeige-Suffix, Skalierung gegenüber dem Modell und Beschreibung. */
export type FieldUnit =
  | 'eur'
  | 'eur-year'
  | 'eur-month'
  | 'percent'
  | 'percent-year'
  | 'age'
  | 'years'
  | 'factor'
  | 'correlation'
  | 'count'
  | 'integer'
  | 'number'
  | 'calendar-year'

export interface UnitSpec {
  suffix: string
  /** Anzeigewert = Modellwert × scale */
  scale: number
  /** höchstens so viele Nachkommastellen in der Anzeige */
  decimals: number
  grouping: boolean
  /** Einheit im Tooltip */
  description: string
}

export const UNITS: Record<FieldUnit, UnitSpec> = {
  eur: { suffix: '€', scale: 1, decimals: 2, grouping: true, description: 'Euro' },
  'eur-year': {
    suffix: '€ p. a.',
    scale: 1,
    decimals: 2,
    grouping: true,
    description: 'Euro pro Jahr',
  },
  'eur-month': {
    suffix: '€/Monat',
    scale: 1,
    decimals: 2,
    grouping: true,
    description: 'Euro pro Monat',
  },
  percent: { suffix: '%', scale: 100, decimals: 4, grouping: false, description: 'Prozent' },
  'percent-year': {
    suffix: '% p. a.',
    scale: 100,
    decimals: 4,
    grouping: false,
    description: 'Prozent pro Jahr',
  },
  age: {
    suffix: 'Jahre',
    scale: 1,
    decimals: 0,
    grouping: false,
    description: 'Lebensalter in Jahren',
  },
  years: { suffix: 'Jahre', scale: 1, decimals: 2, grouping: false, description: 'Jahre' },
  factor: {
    suffix: '×',
    scale: 1,
    decimals: 4,
    grouping: false,
    description: 'Faktor (1 = 100 %)',
  },
  correlation: {
    suffix: '',
    scale: 1,
    decimals: 4,
    grouping: false,
    description: 'Korrelationskoeffizient zwischen −1 und 1',
  },
  count: { suffix: '', scale: 1, decimals: 0, grouping: true, description: 'Anzahl' },
  integer: { suffix: '', scale: 1, decimals: 0, grouping: false, description: 'ganze Zahl' },
  number: { suffix: '', scale: 1, decimals: 4, grouping: false, description: 'Zahl' },
  'calendar-year': {
    suffix: '',
    scale: 1,
    decimals: 0,
    grouping: false,
    description: 'Kalenderjahr',
  },
}

/** Modellwert → Anzeigewert ohne Rundungsartefakte der Skalierung (0,07 · 100 = 7,000000000000001). */
export function toDisplay(value: number, unit: UnitSpec): number {
  if (unit.scale === 1) return value
  return Number((value * unit.scale).toPrecision(12))
}

export function fromDisplay(value: number, unit: UnitSpec): number {
  if (unit.scale === 1) return value
  return Number((value / unit.scale).toPrecision(12))
}
