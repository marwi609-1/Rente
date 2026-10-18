import { mortalityTableSchema, type MortalityTable } from '@/domain/longevity/mortalityTable'

import raw from './mortality-de.json'

/**
 * Kohortensterbetafeln des Statistischen Bundesamts (Variante 3, hohe Lebenserwartung), beim Laden
 * validiert. Quelle und Aufbereitung: docs/DATA_SOURCES.md.
 */
export const mortalityDe: MortalityTable = mortalityTableSchema.parse(raw)

export const mortalityDeMeta = raw.meta
