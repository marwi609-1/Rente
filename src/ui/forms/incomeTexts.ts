import type { LegalParams } from '@/domain/model/legalParams'
import type { AdditionalIncome, Household, IncomePayout, IncomeProduct } from '@/domain/model/types'
import { taxableShare, yieldShare } from '@/domain/tax/pensionTax'
import { formatNumber, formatPercent } from '@/utils/format'

export const INCOME_PRODUCT_ITEMS: { title: string; value: IncomeProduct }[] = [
  {
    title: 'Betriebsrente: Direktversicherung, Pensionskasse, Pensionsfonds',
    value: 'bav-insurance',
  },
  { title: 'Betriebsrente: Direktzusage, Unterstützungskasse', value: 'bav-direct' },
  { title: 'Riester-Rente', value: 'riester' },
  { title: 'Altersvorsorgedepot', value: 'avd' },
  { title: 'Basisrente (Rürup)', value: 'basis' },
  { title: 'Private Rentenversicherung', value: 'private-annuity' },
  { title: 'Kapitallebensversicherung', value: 'life-insurance' },
  { title: 'Sonstige Einnahme, steuerpflichtig', value: 'other-taxable' },
  { title: 'Sonstige Einnahme, steuerfrei', value: 'other-tax-free' },
]

export const INCOME_PAYOUT_ITEMS: { title: string; value: IncomePayout }[] = [
  { title: 'Lebenslange Rente', value: 'lifelong' },
  { title: 'Befristete Auszahlung', value: 'fixed-term' },
  { title: 'Einmalzahlung', value: 'lump-sum' },
]

/** Private Versicherungen, bei denen Beiträge und Vertragsjahr die Steuer bestimmen. */
export function needsContractData(income: AdditionalIncome): boolean {
  return (
    (income.product === 'private-annuity' || income.product === 'life-insurance') &&
    income.payout !== 'lifelong'
  )
}

/** Steuerliche Behandlung einer Einkunftsquelle in einem Satz. */
function taxText(income: AdditionalIncome, household: Household, params: LegalParams): string {
  const lump = income.payout === 'lump-sum'
  const startYear = household.startYear + income.startAge - household.currentAge
  switch (income.product) {
    case 'bav-insurance':
      return `Voll steuerpflichtig mit dem persönlichen Steuersatz (§ 22 Nr. 5 EStG)${lump ? ', ohne Fünftelregelung' : ''}.`
    case 'bav-direct':
      return `Versorgungsbezug (§ 19 EStG): ab ${params.occupationalPension.minimumAge} mit Versorgungsfreibetrag und Zuschlag nach dem Jahr des Versorgungsbeginns, vorher Arbeitslohn${lump ? '; Kapitalabfindung ermäßigt nach der Fünftelregelung (§ 34 EStG)' : ''}.`
    case 'riester':
      return 'Voll steuerpflichtig (§ 22 Nr. 5 EStG). Zu Beginn sind höchstens 30 % des Kapitals als Einmalzahlung möglich.'
    case 'avd':
      return 'Voll steuerpflichtig (§ 22 Nr. 5 EStG). Altersvorsorgedepot: Produkte ab 2027, Auszahlplan mindestens bis 85, zu Beginn bis zu 30 % als Einmalzahlung.'
    case 'basis':
      return `Besteuerungsanteil ${formatPercent(taxableShare(startYear, params), 1)} bei Beginn ${startYear} wie die gesetzliche Rente; der steuerfreie Teil bleibt nominal fest.`
    case 'private-annuity':
    case 'life-insurance': {
      if (income.payout === 'lifelong') {
        return `Ertragsanteil ${formatPercent(yieldShare(income.startAge, params), 0)} bei Beginn mit ${income.startAge} (§ 22 Nr. 1 EStG).`
      }
      const li = params.lifeInsurance
      if (income.contractYear < li.taxableFromContractYear) {
        return `Altvertrag vor ${li.taxableFromContractYear}: steuerfrei, sofern die damaligen Voraussetzungen (u. a. 12 Jahre Laufzeit) erfüllt sind.`
      }
      return `Ertrag = Auszahlung − anteilige Beiträge${income.fundLinked ? ', davon 15 % steuerfrei' : ''}: zur Hälfte mit dem persönlichen Steuersatz, wenn ab ${li.halfIncomeAgeLater} (Verträge bis ${li.laterAgeFromContractYear - 1}: ab ${li.halfIncomeAge}) und mindestens ${li.minimumTermYears} Jahre nach Vertragsabschluss ausgezahlt; sonst Abgeltungsteuer (§ 20 Abs. 1 Nr. 6 EStG).`
    }
    case 'other-taxable':
      return 'Voll steuerpflichtig mit dem persönlichen Steuersatz.'
    case 'other-tax-free':
      return 'Steuerfrei, z. B. Erbschaft oder Schenkung (Erbschaftsteuer nicht modelliert).'
  }
}

/** Beitragspflicht zur KV/PV einer Einkunftsquelle in einem Satz. */
function healthText(income: AdditionalIncome, params: LegalParams): string {
  switch (income.product) {
    case 'bav-insurance':
    case 'bav-direct':
      return `Versorgungsbezug: voller KV-Beitragssatz und PV; in der KVdR beitragsfrei bis ${formatNumber(params.health.occupationalAllowanceMonthly, 2)} € im Monat (2026), darüber mindert dieser Betrag nur die KV-Grundlage${income.payout === 'lump-sum' ? '; die Kapitalleistung zählt zehn Jahre lang mit 1/120 je Monat' : ''}.`
    case 'other-tax-free':
      return 'Beitragsfrei.'
    default:
      return 'In der KVdR beitragsfrei, bei freiwilliger Versicherung mit dem Zahlbetrag beitragspflichtig.'
  }
}

export function incomeTreatment(
  income: AdditionalIncome,
  household: Household,
  params: LegalParams,
): { tax: string; health: string } {
  return { tax: taxText(income, household, params), health: healthText(income, params) }
}
