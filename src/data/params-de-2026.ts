import type { LegalParams } from '@/domain/model/legalParams'

/**
 * Gesetzliche Rechengrößen Deutschland 2026. Jeder Wert ist gegen die angegebene Primärquelle
 * geprüft (Abruf 18.10.2026); Details in docs/DATA_SOURCES.md.
 */
export const paramsDe2026: LegalParams = {
  year: 2026,

  // § 32a Abs. 1 EStG in der ab VZ 2026 geltenden Fassung (gesetze-im-internet.de/estg/__32a.html)
  incomeTax: {
    basicAllowance: 12_348,
    zone2End: 17_799,
    zone3End: 69_878,
    zone4End: 277_825,
    zone2: { a: 914.51, b: 1_400 },
    zone3: { a: 173.1, b: 2_397, c: 1_034.87 },
    zone4: { rate: 0.42, deduction: 11_135.63 },
    zone5: { rate: 0.45, deduction: 19_470.38 },
  },

  solidaritySurcharge: {
    // § 4 Satz 1 SolZG 1995
    rate: 0.055,
    // § 3 Abs. 3 Satz 1 Nr. 2 SolZG 1995 (Einzelveranlagung)
    exemptionLimit: 20_350,
    // § 4 Satz 2 SolZG 1995
    phaseInRate: 0.119,
  },

  capitalIncome: {
    // § 32d Abs. 1 Satz 1 EStG
    rate: 0.25,
    // § 18 Abs. 1 Satz 2 InvStG: 70 Prozent des Basiszinses
    vorabpauschaleFactor: 0.7,
  },

  pensionTax: {
    // § 9a Satz 1 Nr. 3 EStG: Pauschbetrag für Einnahmen nach § 22 Nr. 1
    lumpSumExpenses: 102,
    // § 10c Satz 1 EStG
    specialExpensesLumpSum: 36,
    // § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG, Tabelle: 2005 50 %, bis 2020 +2 Punkte,
    // 2021 81 %, 2022 82 %, ab 2023 +0,5 Punkte bis 100 % im Jahr 2058
    taxableShare: {
      firstYear: 2005,
      shares: [
        0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8,
        0.81, 0.82, 0.825, 0.83, 0.835, 0.84, 0.845, 0.85, 0.855, 0.86, 0.865, 0.87, 0.875, 0.88,
        0.885, 0.89, 0.895, 0.9, 0.905, 0.91, 0.915, 0.92, 0.925, 0.93, 0.935, 0.94, 0.945, 0.95,
        0.955, 0.96, 0.965, 0.97, 0.975, 0.98, 0.985, 0.99, 0.995, 1,
      ],
    },
  },

  statutoryPension: {
    // § 77 Abs. 2 Satz 1 Nr. 2 Buchst. a SGB VI
    earlyReductionPerMonth: 0.003,
    // § 77 Abs. 2 Satz 1 Nr. 2 Buchst. b SGB VI
    lateIncreasePerMonth: 0.005,
  },

  health: {
    // § 241 SGB V
    generalRate: 0.146,
    // § 243 Satz 3 SGB V (ohne Krankengeldanspruch)
    reducedRate: 0.14,
    // Bekanntmachung des BMG vom 7.11.2025, BAnz AT 10.11.2025 B7 (§ 242a Abs. 2 SGB V)
    averageAdditionalRate: 0.029,
    // § 1 Abs. 1 PBAV 2025 (Beitragssatz nach § 55 Abs. 1 SGB XI ab 1.1.2025), 2026 unverändert
    careRate: 0.036,
    // § 55 Abs. 3 Satz 1 SGB XI
    childlessSurcharge: 0.006,
    // § 240 Abs. 4 Satz 1 SGB V: 1/90 der monatlichen Bezugsgröße je Kalendertag; Bezugsgröße 2026
    // 3.955 €/Monat (§ 1 SVBezGrV 2026) → 30/90 · 3.955 € = 1.318,33 €
    minimumBaseMonthly: 1_318.33,
    // § 6 Abs. 7 SGB V i. V. m. § 2 Abs. 2 SVBezGrV 2026: 69.750 €/Jahr
    contributionCeilingMonthly: 5_812.5,
    // Modellannahme laut Spezifikation Abschnitt 10.4 (Default: ja), siehe docs/ASSUMPTIONS.md
    capitalBaseAfterSaverAllowance: true,
  },
}
