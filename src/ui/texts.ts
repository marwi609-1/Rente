/** Dauerhaft sichtbarer Hinweis (Spezifikation Abschnitt 1). */
export const DISCLAIMER = 'Rechenwerkzeug – keine Anlage-, Steuer- oder Rentenberatung.'

export const LEGAL_STATUS = 'Rechtsstand Deutschland 2026'

/** Hinweis bei historischen Marktmodellen (Spezifikation Abschnitt 8). */
export function historicalDataNotice(firstYear: number, lastYear: number): string {
  return (
    `Historische Daten ${firstYear}–${lastYear} aus Sicht eines Anlegers in DM bzw. Euro: Aktien ` +
    'bis 2000 DWS Akkumula (Anteilwert, Fondskosten bereits abgezogen), ab 2001 MSCI World Net ' +
    'Return in Euro; Anleihen als rechnerische 10-jährige Bundesanleihe. Der Zeitraum ist kurz, ' +
    'enthält nur wenige unabhängige 30-Jahres-Abschnitte und zeigt im Rückblick erfolgreiche ' +
    'Märkte (Survivorship-Bias).'
  )
}
