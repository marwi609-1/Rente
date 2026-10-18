const LOCALE = 'de-DE'

/** Tausendertrennung mit Punkten ohne Dezimalkomma, z. B. „1.300.000“. */
const GROUPED_INTEGER = /^[+-]?\d{1,3}(\.\d{3})+$/

/**
 * Liest eine Zahl in deutscher oder technischer Schreibweise: „1.300.000“, „2,5“, „1.234,56“,
 * „0.05“. Leerzeichen (auch geschützte) werden ignoriert. Liefert `null`, wenn der Text keine
 * vollständige endliche Zahl ist.
 */
export function parseNumberInput(text: string): number | null {
  let s = text.replace(/[\s  ]/g, '')
  if (s === '') return null
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (GROUPED_INTEGER.test(s)) {
    s = s.replace(/\./g, '')
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const value = Number(s)
  return Number.isFinite(value) ? value : null
}

/** Zahl für ein Eingabefeld, z. B. 1300000 → „1.300.000“, 2.5 → „2,5“. */
export function formatNumberInput(
  value: number,
  maxFractionDigits: number,
  grouping = true,
): string {
  if (!Number.isFinite(value)) return ''
  return value.toLocaleString(LOCALE, {
    maximumFractionDigits: maxFractionDigits,
    useGrouping: grouping,
  })
}
