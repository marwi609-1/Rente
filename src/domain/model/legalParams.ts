import type { Rate } from './types'

/** Einkommensteuertarif nach § 32a Abs. 1 EStG (Grundtarif) für ein Veranlagungsjahr. */
export interface IncomeTaxTariff {
  /** Grundfreibetrag, Ende von Zone 1 */
  basicAllowance: number
  /** Ende von Zone 2 */
  zone2End: number
  /** Ende von Zone 3 */
  zone3End: number
  /** Ende von Zone 4 */
  zone4End: number
  /** Zone 2: (a · y + b) · y, y = (zvE − Grundfreibetrag) / 10.000 */
  zone2: { a: number; b: number }
  /** Zone 3: (a · z + b) · z + c, z = (zvE − Ende Zone 2) / 10.000 */
  zone3: { a: number; b: number; c: number }
  /** Zone 4: rate · zvE − deduction */
  zone4: { rate: Rate; deduction: number }
  /** Zone 5: rate · zvE − deduction */
  zone5: { rate: Rate; deduction: number }
}

/** Zeile der Tabelle zum Versorgungsfreibetrag (§ 19 Abs. 2 Satz 3 EStG). */
export interface PensionAllowanceRow {
  /** Prozentsatz der Versorgungsbezüge */
  share: Rate
  /** Höchstbetrag des Versorgungsfreibetrags */
  cap: number
  /** Zuschlag zum Versorgungsfreibetrag */
  surcharge: number
}

/** Gesetzliche Rechengrößen eines Jahres (Steuer und Sozialversicherung). */
export interface LegalParams {
  year: number
  incomeTax: IncomeTaxTariff
  solidaritySurcharge: {
    rate: Rate
    /** Freigrenze für die tarifliche Einkommensteuer (Einzelveranlagung) */
    exemptionLimit: number
    /** Höchstsatz in der Milderungszone, bezogen auf den Betrag über der Freigrenze */
    phaseInRate: Rate
  }
  capitalIncome: {
    /** Abgeltungsteuersatz */
    rate: Rate
    /** Anteil des Basiszinses für den Basisertrag der Vorabpauschale */
    vorabpauschaleFactor: Rate
  }
  pensionTax: {
    /** Werbungskosten-Pauschbetrag für Renten */
    lumpSumExpenses: number
    /** Sonderausgaben-Pauschbetrag */
    specialExpensesLumpSum: number
    /** Besteuerungsanteil nach Jahr des Rentenbeginns, ab `firstYear` jährlich */
    taxableShare: { firstYear: number; shares: Rate[] }
    /**
     * Ertragsanteil privater Leibrenten nach dem bei Beginn vollendeten Lebensjahr; Stufen
     * „ab Alter“, aufsteigend
     */
    yieldShare: { fromAge: number; share: Rate }[]
  }
  /** Versorgungsbezüge (Betriebsrente aus Direktzusage oder Unterstützungskasse) */
  occupationalPension: {
    /** Versorgungsfreibetrag und Zuschlag nach Jahr des Versorgungsbeginns, ab `firstYear` jährlich */
    allowance: { firstYear: number; rows: PensionAllowanceRow[] }
    /** Bezüge wegen Alters gelten erst ab diesem vollendeten Lebensjahr als Versorgungsbezüge */
    minimumAge: number
    /** Werbungskosten-Pauschbetrag für Versorgungsbezüge */
    lumpSumExpenses: number
    /** Arbeitnehmer-Pauschbetrag für übrigen Arbeitslohn */
    employeeLumpSum: number
  }
  /** Erträge aus Lebens- und Rentenversicherungen bei Kapital- oder Ratenauszahlung */
  lifeInsurance: {
    /** Vertragsabschluss ab diesem Jahr: der Unterschiedsbetrag ist steuerpflichtig */
    taxableFromContractYear: number
    /** hälftiger Ansatz nach Vollendung dieses Lebensjahres … */
    halfIncomeAge: number
    /** … bzw. dieses Lebensjahres bei Vertragsabschluss ab `laterAgeFromContractYear` */
    halfIncomeAgeLater: number
    laterAgeFromContractYear: number
    /** Mindestdauer seit Vertragsabschluss für den hälftigen Ansatz, in Jahren */
    minimumTermYears: number
    /** steuerfreier Anteil des Unterschiedsbetrags bei fondsgebundenen Versicherungen */
    fundExemption: Rate
  }
  statutoryPension: {
    /** Minderung des Zugangsfaktors je Monat vorzeitiger Inanspruchnahme */
    earlyReductionPerMonth: Rate
    /** Erhöhung des Zugangsfaktors je Monat späterer Inanspruchnahme */
    lateIncreasePerMonth: Rate
  }
  health: {
    generalRate: Rate
    reducedRate: Rate
    averageAdditionalRate: Rate
    careRate: Rate
    childlessSurcharge: Rate
    /** Mindestbemessungsgrundlage freiwillig Versicherter je Monat */
    minimumBaseMonthly: number
    /** Beitragsbemessungsgrenze KV/PV je Monat */
    contributionCeilingMonthly: number
    /** mindert der Sparer-Pauschbetrag die Beitragsgrundlage aus Kapitalerträgen? */
    capitalBaseAfterSaverAllowance: boolean
    /** Freigrenze bzw. Freibetrag für Betriebsrenten je Monat */
    occupationalAllowanceMonthly: number
    /** Kapitalleistungen aus Versorgungsbezügen verteilen sich auf so viele Jahre */
    lumpSumSpreadYears: number
  }
}
