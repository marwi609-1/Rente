/** Dauerhaft sichtbarer Hinweis (Spezifikation Abschnitt 1). */
export const DISCLAIMER = 'Rechenwerkzeug – keine Anlage-, Steuer- oder Rentenberatung.'

export const LEGAL_STATUS = 'Rechtsstand Deutschland 2026'

/** Hinweis bei historischen Marktmodellen (Spezifikation Abschnitt 8). */
export function historicalDataNotice(firstYear: number, lastYear: number): string {
  return (
    `Historische US-Daten ${firstYear}–${lastYear} (Robert Shiller): Der US-Aktienmarkt war ` +
    'im Rückblick einer der erfolgreichsten der Welt (Survivorship-Bias). Wechselkurseffekte für ' +
    'Anleger in Euro sind nicht enthalten.'
  )
}
