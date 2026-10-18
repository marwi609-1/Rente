import type { HistoricalData } from '../market/historical'
import type { MortalityTable } from '../longevity/mortalityTable'
import type { LegalParams } from '../model/legalParams'

/** Daten, die die Engine neben dem Plan benötigt. */
export interface EngineContext {
  /** gesetzliche Rechengrößen */
  params: LegalParams
  /** nur für die historischen Marktmodelle */
  historical?: HistoricalData
  /** nur für die Langlebigkeit nach Sterbetafel */
  mortality?: MortalityTable
}
