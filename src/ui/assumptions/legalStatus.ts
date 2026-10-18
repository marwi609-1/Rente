import type { LegalParams } from '@/domain/model/legalParams'
import { taxableShare } from '@/domain/tax/pensionTax'
import { formatEuro, formatNumber, formatPercent } from '@/utils/format'

export interface LegalStatusGroup {
  title: string
  rows: { label: string; value: string; source: string }[]
}

const euro2 = (v: number) =>
  v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** Die wichtigsten gesetzlichen Rechengrößen des Rechtsstands mit Fundstelle. */
export function legalStatus(params: LegalParams): LegalStatusGroup[] {
  const t = params.incomeTax
  const h = params.health
  return [
    {
      title: 'Einkommensteuer',
      rows: [
        {
          label: 'Grundfreibetrag',
          value: formatEuro(t.basicAllowance),
          source: '§ 32a Abs. 1 EStG',
        },
        {
          label: 'Spitzensteuersatz 42 %',
          value: `ab ${formatEuro(t.zone3End + 1)}`,
          source: '§ 32a Abs. 1 EStG',
        },
        {
          label: 'Reichensteuersatz 45 %',
          value: `ab ${formatEuro(t.zone4End + 1)}`,
          source: '§ 32a Abs. 1 EStG',
        },
        {
          label: 'Solidaritätszuschlag',
          value: `${formatPercent(params.solidaritySurcharge.rate, 1)}, Freigrenze ${formatEuro(params.solidaritySurcharge.exemptionLimit)}`,
          source: '§§ 3, 4 SolZG 1995',
        },
        {
          label: 'Besteuerungsanteil bei Rentenbeginn ' + params.year,
          value: formatPercent(taxableShare(params.year, params), 1),
          source: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG',
        },
        {
          label: 'Werbungskosten-Pauschbetrag Rente',
          value: formatEuro(params.pensionTax.lumpSumExpenses),
          source: '§ 9a Satz 1 Nr. 3 EStG',
        },
        {
          label: 'Sonderausgaben-Pauschbetrag',
          value: formatEuro(params.pensionTax.specialExpensesLumpSum),
          source: '§ 10c Satz 1 EStG',
        },
      ],
    },
    {
      title: 'Kapitalerträge',
      rows: [
        {
          label: 'Abgeltungsteuer',
          value: formatPercent(params.capitalIncome.rate, 0),
          source: '§ 32d Abs. 1 EStG',
        },
        {
          label: 'Basisertrag der Vorabpauschale',
          value: `${formatPercent(params.capitalIncome.vorabpauschaleFactor, 0)} des Basiszinses`,
          source: '§ 18 Abs. 1 InvStG',
        },
      ],
    },
    {
      title: 'Gesetzliche Rente',
      rows: [
        {
          label: 'Abschlag je Monat vor der Regelaltersgrenze',
          value: formatPercent(params.statutoryPension.earlyReductionPerMonth, 1),
          source: '§ 77 Abs. 2 SGB VI',
        },
        {
          label: 'Zuschlag je Monat nach der Regelaltersgrenze',
          value: formatPercent(params.statutoryPension.lateIncreasePerMonth, 1),
          source: '§ 77 Abs. 2 SGB VI',
        },
      ],
    },
    {
      title: 'Kranken- und Pflegeversicherung',
      rows: [
        {
          label: 'Allgemeiner Beitragssatz',
          value: formatPercent(h.generalRate, 1),
          source: '§ 241 SGB V',
        },
        {
          label: 'Ermäßigter Beitragssatz',
          value: formatPercent(h.reducedRate, 1),
          source: '§ 243 SGB V',
        },
        {
          label: 'Durchschnittlicher Zusatzbeitrag',
          value: formatPercent(h.averageAdditionalRate, 1),
          source: '§ 242a SGB V, BAnz AT 10.11.2025 B7',
        },
        {
          label: 'Pflegeversicherung',
          value: formatPercent(h.careRate, 1),
          source: '§ 55 Abs. 1 SGB XI',
        },
        {
          label: 'Zuschlag für Kinderlose',
          value: `${formatNumber(h.childlessSurcharge * 100, 1)} Prozentpunkte`,
          source: '§ 55 Abs. 3 SGB XI',
        },
        {
          label: 'Mindestbemessungsgrundlage',
          value: `${euro2(h.minimumBaseMonthly)}/Monat`,
          source: '§ 240 Abs. 4 SGB V',
        },
        {
          label: 'Beitragsbemessungsgrenze',
          value: `${euro2(h.contributionCeilingMonthly)}/Monat`,
          source: '§ 6 Abs. 7 SGB V, SVBezGrV 2026',
        },
      ],
    },
  ]
}
