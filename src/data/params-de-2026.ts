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
    // § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb Satz 4 EStG, Tabelle „bei Beginn der Rente
    // vollendetes Lebensjahr“
    yieldShare: [
      [0, 0.59],
      [2, 0.58],
      [4, 0.57],
      [6, 0.56],
      [9, 0.55],
      [11, 0.54],
      [13, 0.53],
      [15, 0.52],
      [17, 0.51],
      [19, 0.5],
      [21, 0.49],
      [23, 0.48],
      [25, 0.47],
      [27, 0.46],
      [28, 0.45],
      [30, 0.44],
      [32, 0.43],
      [33, 0.42],
      [35, 0.41],
      [36, 0.4],
      [38, 0.39],
      [39, 0.38],
      [41, 0.37],
      [42, 0.36],
      [43, 0.35],
      [45, 0.34],
      [46, 0.33],
      [48, 0.32],
      [49, 0.31],
      [50, 0.3],
      [51, 0.29],
      [53, 0.28],
      [54, 0.27],
      [55, 0.26],
      [57, 0.25],
      [58, 0.24],
      [59, 0.23],
      [60, 0.22],
      [62, 0.21],
      [63, 0.2],
      [64, 0.19],
      [65, 0.18],
      [67, 0.17],
      [68, 0.16],
      [69, 0.15],
      [71, 0.14],
      [72, 0.13],
      [74, 0.12],
      [75, 0.11],
      [76, 0.1],
      [78, 0.09],
      [80, 0.08],
      [81, 0.07],
      [83, 0.06],
      [85, 0.05],
      [88, 0.04],
      [92, 0.03],
      [94, 0.02],
      [97, 0.01],
    ].map(([fromAge, share]) => ({ fromAge, share })),
  },

  occupationalPension: {
    // § 19 Abs. 2 Satz 3 EStG, Tabelle in der Fassung des Wachstumschancengesetzes: Jahr des
    // Versorgungsbeginns „bis 2005“, dann jährlich bis 2058 (0 %)
    allowance: {
      firstYear: 2005,
      rows: [
        [40, 3_000, 900],
        [38.4, 2_880, 864],
        [36.8, 2_760, 828],
        [35.2, 2_640, 792],
        [33.6, 2_520, 756],
        [32, 2_400, 720],
        [30.4, 2_280, 684],
        [28.8, 2_160, 648],
        [27.2, 2_040, 612],
        [25.6, 1_920, 576],
        [24, 1_800, 540],
        [22.4, 1_680, 504],
        [20.8, 1_560, 468],
        [19.2, 1_440, 432],
        [17.6, 1_320, 396],
        [16, 1_200, 360],
        [15.2, 1_140, 342],
        [14.4, 1_080, 324],
        [14, 1_050, 315],
        [13.6, 1_020, 306],
        [13.2, 990, 297],
        [12.8, 960, 288],
        [12.4, 930, 279],
        [12, 900, 270],
        [11.6, 870, 261],
        [11.2, 840, 252],
        [10.8, 810, 243],
        [10.4, 780, 234],
        [10, 750, 225],
        [9.6, 720, 216],
        [9.2, 690, 207],
        [8.8, 660, 198],
        [8.4, 630, 189],
        [8, 600, 180],
        [7.6, 570, 171],
        [7.2, 540, 162],
        [6.8, 510, 153],
        [6.4, 480, 144],
        [6, 450, 135],
        [5.6, 420, 126],
        [5.2, 390, 117],
        [4.8, 360, 108],
        [4.4, 330, 99],
        [4, 300, 90],
        [3.6, 270, 81],
        [3.2, 240, 72],
        [2.8, 210, 63],
        [2.4, 180, 54],
        [2, 150, 45],
        [1.6, 120, 36],
        [1.2, 90, 27],
        [0.8, 60, 18],
        [0.4, 30, 9],
        [0, 0, 0],
      ].map(([percent, cap, surcharge]) => ({ share: percent / 100, cap, surcharge })),
    },
    // § 19 Abs. 2 Satz 2 Nr. 2 EStG
    minimumAge: 63,
    // § 9a Satz 1 Nr. 1 Buchst. b EStG
    lumpSumExpenses: 102,
    // § 9a Satz 1 Nr. 1 Buchst. a EStG
    employeeLumpSum: 1_230,
  },

  lifeInsurance: {
    // § 52 Abs. 28 Satz 5 EStG: Verträge vor 2005 nach § 20 Abs. 1 Nr. 6 a. F.
    taxableFromContractYear: 2005,
    // § 20 Abs. 1 Nr. 6 Satz 2 EStG
    halfIncomeAge: 60,
    // § 52 Abs. 28 Satz 7 EStG: Vertragsabschlüsse nach dem 31.12.2011
    halfIncomeAgeLater: 62,
    laterAgeFromContractYear: 2012,
    // § 20 Abs. 1 Nr. 6 Satz 2 EStG
    minimumTermYears: 12,
    // § 20 Abs. 1 Nr. 6 Satz 9 EStG
    fundExemption: 0.15,
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
    // § 226 Abs. 2 SGB V: 1/20 der monatlichen Bezugsgröße 3.955 € (§ 1 SVBezGrV 2026)
    occupationalAllowanceMonthly: 197.75,
    // § 229 Abs. 1 Satz 3 SGB V: 1/120 der Kapitalleistung je Monat für höchstens 120 Monate
    lumpSumSpreadYears: 10,
  },
}
