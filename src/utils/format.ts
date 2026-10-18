const LOCALE = 'de-DE'

const euroFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const percentFormats = new Map<number, Intl.NumberFormat>()

/** Betrag in Euro ohne Nachkommastellen, z. B. „1.300.000 €“. */
export function formatEuro(value: number): string {
  return euroFormat.format(value)
}

/** Dezimalrate als Prozent, z. B. 0.0697 → „6,97 %“. */
export function formatPercent(rate: number, fractionDigits = 1): string {
  let format = percentFormats.get(fractionDigits)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      style: 'percent',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    percentFormats.set(fractionDigits, format)
  }
  return format.format(rate)
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** Kurzform für Achsen, z. B. 1.250.000 → „1,3 Mio.“, 800.000 → „800 Tsd.“. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${formatNumber(value / 1e6, abs >= 1e7 ? 0 : 1)} Mio.`
  if (abs >= 1e3) return `${formatNumber(value / 1e3)} Tsd.`
  return formatNumber(value)
}
