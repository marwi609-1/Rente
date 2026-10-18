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
}

export interface HealthCharge {
  /** vom Haushalt zu tragender Jahresbeitrag KV/PV bzw. PKV, nach Zuschuss der Rentenversicherung */
  total: number
  /** davon auf die Rente entfallend */
  onPension: number
  /** als Basis-Vorsorgeaufwendungen abziehbar */
  deductible: number
}

const NONE: HealthCharge = { total: 0, onPension: 0, deductible: 0 }

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

  if (phase === 'bridge') {
    if (health.bridgePhase.type === 'pkv') {
      const premium =
        health.bridgePhase.monthlyPremium *
        12 *
        Math.pow(1 + health.bridgePhase.premiumGrowth, yearIndex)
      // Basisanteil des PKV-Beitrags unbekannt: konservativ nicht abziehbar
      return { total: premium, onPension: 0, deductible: 0 }
    }
    const base = Math.min(ceiling, Math.max(minimum, input.capitalBase))
    const total = base * voluntaryRate
    return { total, onPension: 0, deductible: total }
  }

  const pension = Math.min(input.pensionGross, ceiling)
  if (health.kvdrEligible) {
    const total = pension * (halfHealthRate + careRate)
    return { total, onPension: total, deductible: total }
  }
  const other = Math.min(input.capitalBase, ceiling - pension)
  const topUp = Math.max(0, minimum - pension - other)
  const pensionShare = pension * (h.generalRate + h.averageAdditionalRate)
  const otherShare = (other + topUp) * (h.reducedRate + h.averageAdditionalRate)
  const care = (pension + other + topUp) * careRate
  // Zuschuss: halber allgemeiner Satz plus halber Zusatzbeitrag auf die Rente
  const subsidy = pension * halfHealthRate
  const total = pensionShare + otherShare + care - subsidy
  const onPension = pension * (halfHealthRate + careRate)
  return { total, onPension, deductible: total }
}
