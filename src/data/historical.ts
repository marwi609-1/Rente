import { historicalDataSchema, type HistoricalData } from '@/domain/market/historical'

import raw from './historical-eur.json'

/**
 * Historische Jahresrenditen aus Sicht eines Anlegers in DM bzw. Euro (Aktien: DWS Akkumula bis
 * 2000, MSCI World Net EUR ab 2001; Bundesbank-Umlaufsrenditen, Geldmarkt, VPI), beim Laden
 * validiert. Quelle, Stand und Aufbereitung: docs/DATA_SOURCES.md.
 */
export const historicalEur: HistoricalData = historicalDataSchema.parse(raw)

export const historicalEurMeta = raw.meta
