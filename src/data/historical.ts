import { historicalDataSchema, type HistoricalData } from '@/domain/market/historical'

import raw from './historical-us.json'

/**
 * Historische US-Jahresrenditen (Shiller, ergänzt um FRED TB6MS ab 2012), beim Laden validiert.
 * Quelle, Stand und Aufbereitung: docs/DATA_SOURCES.md.
 */
export const historicalUs: HistoricalData = historicalDataSchema.parse(raw)

export const historicalUsMeta = raw.meta
