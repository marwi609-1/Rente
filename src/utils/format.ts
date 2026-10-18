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
