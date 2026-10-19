import raw from '@/data/historical-us.json'
import { historicalDataSchema, type HistoricalData } from '@/domain/market/historical'

/**
 * Historische US-Jahresrenditen (Shiller, ergänzt um FRED TB6MS ab 2012). Die App rechnet mit den
 * EUR-Daten; die US-Reihe dient nur noch dem Plausibilitätsanker der Spezifikation (A26).
 */
export const historicalUs: HistoricalData = historicalDataSchema.parse(raw)

export const historicalUsMeta = raw.meta
