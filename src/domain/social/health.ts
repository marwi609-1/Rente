import type { Phase } from '../engine/types'
import type { LegalParams } from '../model/legalParams'
import type { HealthInsurance } from '../model/types'

export interface HealthChargeInput {
  phase: Phase
  health: HealthInsurance
  childless: boolean
  /** Jahresbrutto der gesetzlichen Rente */
  pensionGross: number
  /** beitragspflichtige Kapitalerträge des Jahres (steuerliche Abgrenzung) */
  capitalBase: number
  /** Jahre seit dem Startjahr, für die Fortschreibung von Rechengrößen und PKV-Beitrag */
  yearIndex: number
  params: LegalParams
  /** beitragspflichtige Versorgungsbezüge (Betriebsrenten, verteilte Kapitalleistungen) */
  occupational?: number
  /** davon laufende Betriebsrenten */
  occupationalRecurring?: number
  /** weitere Einnahmen, die nur bei freiwillig Versicherten zählen (private Renten u. a.) */
  voluntaryIncome?: number
  /** davon laufende Zahlungen */
  voluntaryRecurring?: number
}

export interface HealthCharge {
  /** vom Haushalt zu tragender Jahresbeitrag KV/PV bzw. PKV, nach Zuschuss der Rentenversicherung */
  total: number
  /** davon auf die Rente entfallend */
  onPension: number
  /** davon auf laufende weitere Einkünfte entfallend (anteilig) */
  onIncome: number
  /** als Basis-Vorsorgeaufwendungen abziehbar */
  deductible: number
}

const NONE: HealthCharge = { total: 0, onPension: 0, onIncome: 0, deductible: 0 }

/** Anteil `part / whole`, 0 bei leerem Ganzen. */
function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/**
 * Jahresbeitrag zur Kranken- und Pflegeversicherung (Spezifikation 10.4).
 * - Erwerbsphase: nicht modelliert.
 * - Überbrückung, GKV freiwillig: Beitragsgrundlage Kapitalerträge, mindestens die
 *   Mindestbemessungsgrundlage, höchstens die BBG; ermäßigter Satz + Zusatzbeitrag + PV.
 * - Überbrückung, PKV: fester Monatsbeitrag mit jährlicher Steigerung.
 * - Rente mit KVdR: halber allgemeiner Satz und halber Zusatzbeitrag auf die Rente, PV voll.
 * - Rente ohne KVdR: freiwillig mit Rente und Kapitalerträgen (Reihenfolge nach § 238a SGB V: Rente
 *   zuerst bis zur BBG). Auf die Rente gilt der allgemeine Satz (§ 240 Abs. 2 Satz 5 i. V. m. § 247
 *   Satz 1 SGB V), auf übrige Einnahmen der ermäßigte; abzüglich RV-Zuschuss (§ 106 Abs. 2 SGB VI).
 * - Versorgungsbezüge (Betriebsrenten): allgemeiner Beitragssatz und voller Zusatzbeitrag (§ 248
 *   SGB V), PV voll; in der KVdR beitragsfrei bis zur Freigrenze von 1/20 der Bezugsgröße, darüber
 *   mindert der gleich hohe Freibetrag nur die KV-Grundlage (§ 226 Abs. 2 SGB V, § 57 Abs. 1 SGB XI).
 *   Bei freiwillig Versicherten nach der Rente und vor den übrigen Einnahmen, ohne Freibetrag.
 * - Weitere Einnahmen (private Renten, Riester, Versicherungsleistungen) zählen nur bei freiwillig
 *   Versicherten, mit dem ermäßigten Satz.
 */
export function healthCharge(input: HealthChargeInput): HealthCharge {
  const { phase, health, params, yearIndex } = input
  if (phase === 'work') return NONE
  const h = params.health
  const growth = Math.pow(1 + health.paramsGrowth, yearIndex)
  const minimum = h.minimumBaseMonthly * 12 * growth
  const ceiling = h.contributionCeilingMonthly * 12 * growth
  const careRate = h.careRate + (input.childless ? h.childlessSurcharge : 0)
  const voluntaryRate = h.reducedRate + h.averageAdditionalRate + careRate
  // Rentneranteil bzw. RV-Zuschuss: halber allgemeiner Satz plus halber Zusatzbeitrag
  const halfHealthRate = (h.generalRate + h.averageAdditionalRate) / 2

  const fullRate = h.generalRate + h.averageAdditionalRate
  const occupationalTotal = input.occupational ?? 0
  const occupationalRecurring = ratio(input.occupationalRecurring ?? 0, occupationalTotal)
  const voluntaryIncome = input.voluntaryIncome ?? 0
  const otherIncome = input.capitalBase + voluntaryIncome
  const otherRecurring = ratio(input.voluntaryRecurring ?? 0, otherIncome)

  if (phase === 'bridge') {
    if (health.bridgePhase.type === 'pkv') {
      const premium =
        health.bridgePhase.monthlyPremium *
        12 *
        Math.pow(1 + health.bridgePhase.premiumGrowth, yearIndex)
      // Basisanteil des PKV-Beitrags unbekannt: konservativ nicht abziehbar
      return { total: premium, onPension: 0, onIncome: 0, deductible: 0 }
    }
    const occupational = Math.min(occupationalTotal, ceiling)
    const base = Math.max(minimum, occupational + Math.min(otherIncome, ceiling - occupational))
    const onOccupational = occupational * (fullRate + careRate)
    const onOther = (base - occupational) * voluntaryRate
    const total = onOccupational + onOther
    const onIncome = onOccupational * occupationalRecurring + onOther * otherRecurring
    return { total, onPension: 0, onIncome, deductible: total }
  }

  const pension = Math.min(input.pensionGross, ceiling)
  if (health.kvdrEligible) {
    const onPension = pension * (halfHealthRate + careRate)
    let onOccupational = 0
    const free = h.occupationalAllowanceMonthly * 12 * growth
    if (occupationalTotal > free) {
      const room = Math.max(0, ceiling - pension)
      onOccupational =
        Math.min(occupationalTotal - free, room) * fullRate +
        Math.min(occupationalTotal, room) * careRate
    }
    const total = onPension + onOccupational
    const onIncome = onOccupational * occupationalRecurring
    return { total, onPension, onIncome, deductible: total }
  }
  const occupational = Math.min(occupationalTotal, ceiling - pension)
  const other = Math.min(otherIncome, ceiling - pension - occupational)
  const topUp = Math.max(0, minimum - pension - occupational - other)
  const pensionShare = pension * fullRate
  const occupationalShare = occupational * (fullRate + careRate)
  const otherShare = (other + topUp) * (h.reducedRate + h.averageAdditionalRate)
  const care = (pension + other + topUp) * careRate
  // Zuschuss: halber allgemeiner Satz plus halber Zusatzbeitrag auf die Rente
  const subsidy = pension * halfHealthRate
  const total = pensionShare + occupationalShare + otherShare + care - subsidy
  const onPension = pension * (halfHealthRate + careRate)
  const onIncome =
    occupationalShare * occupationalRecurring +
    other * (h.reducedRate + h.averageAdditionalRate + careRate) * otherRecurring
  return { total, onPension, onIncome, deductible: total }
}
