import type { EUR, Rate } from '../model/types'

export type Phase = 'work' | 'bridge' | 'pension'

/**
 * Ergebnis eines Simulationsjahres, nominal. Bestandsgrößen gelten zum Jahresende,
 * Stromgrößen zu ihrem Zahlungszeitpunkt (Konsum, Verkäufe, Sparrate zu Jahresbeginn;
 * Rebalancing zum Jahresende).
 */
export interface YearResult {
  year: number
  age: number
  phase: Phase
  /** Bestände zum Jahresende nach Renditen und Rebalancing */
  equity: EUR
  bonds: EUR
  cash: EUR
  total: EUR
  /** zu Jahresbeginn investierte Sparrate (nach Verrechnung mit Einmalausgaben) */
  contributions: EUR
  /** Verkäufe zu Jahresbeginn zur Finanzierung von Konsum, Einmalausgaben, Steuern und KV */
  grossSales: EUR
  /** Verkäufe zum Jahresende zur Zahlung von Steuern auf Vorabpauschale und Zinsen */
  taxSales: EUR
  /** Verkaufsvolumen beim Rebalancing zum Jahresende */
  rebalanceSales: EUR
  /**
   * tatsächlich finanzierter laufender Netto-Konsum ohne Einmalausgaben, einschließlich des aus der
   * Netto-Rente bestrittenen Teils; in der Erwerbsphase 0
   */
  netConsumption: EUR
  /** tatsächlich finanzierte Einmalausgaben */
  oneOffSpending: EUR
  /** Fehlbetrag gegenüber dem Mindestkonsum; > 0 kennzeichnet ein Fehljahr */
  shortfall: EUR
  /** gesetzliche Rente brutto */
  pensionGross: EUR
  /** Rente nach Einkommensteuer und KV/PV-Anteil */
  pensionNet: EUR
  /** Steuer auf Kapitalerträge des Jahres (Abgeltungsteuer bzw. Mehrsteuer bei Günstigerprüfung) */
  capitalTax: EUR
  /** Einkommensteuer mit Soli und Kirchensteuer auf die Rente */
  incomeTax: EUR
  /** Beiträge zu KV/PV bzw. PKV nach Zuschuss der Rentenversicherung */
  healthInsurance: EUR
  /** Verlustvortrag zum Jahresende */
  lossCarryForward: EUR
  /**
   * Nominale Rendite des nach den Zahlungen zu Jahresbeginn investierten Kapitals (nach TER);
   * `null`, wenn kein Kapital investiert war
   */
  portfolioReturn: Rate | null
  /** Preisindex zu Jahresbeginn (Startjahr = 1); Bezugsgröße der Zahlungen zu Jahresbeginn */
  inflationIndex: number
  /** Preisindex zum Jahresende; Bezugsgröße der Bestände und des Rebalancings */
  inflationIndexEnd: number
  /** Anteile zum Jahresende; bei leerem Depot 0 */
  equityShare: Rate
  bondShare: Rate
  cashShare: Rate
}
