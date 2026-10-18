import { percentileOfSorted } from './percentile'

/** Gleich breite Klassen ab `start`; Werte ab `start + counts.length · step` zählen zu `overflow`. */
export interface Histogram {
  start: number
  step: number
  counts: number[]
  /** Anzahl der Werte oberhalb der letzten Klasse (Ausreißer jenseits des Kappungsquantils) */
  overflow: number
}

/** Rundet eine Klassenbreite auf 1, 2, 2,5 oder 5 × 10^k auf. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (raw <= factor * magnitude * (1 + 1e-12)) return factor * magnitude
  }
  return 10 * magnitude
}

/**
 * Histogramm einer aufsteigend sortierten Stichprobe mit höchstens `maxBins` Klassen „runder“
 * Breite. Die Klassen reichen vom Minimum bis zum Quantil `upperQuantile`; größere Werte werden
 * als Überlauf gezählt, damit wenige sehr große Werte die Darstellung nicht stauchen.
 */
export function histogramOfSorted(
  sorted: ArrayLike<number>,
  maxBins = 30,
  upperQuantile = 0.99,
): Histogram {
  const n = sorted.length
  if (n === 0) return { start: 0, step: 1, counts: [], overflow: 0 }
  const min = sorted[0]
  const cap = percentileOfSorted(sorted, upperQuantile)
  let step = niceStep((cap - min) / maxBins)
  let start = Math.floor(min / step) * step
  // Rundung des Starts nach unten kann eine Klasse mehr erfordern; dann die nächste Breite wählen.
  while (Math.floor((cap - start) / step) + 1 > maxBins) {
    step = niceStep(step * 1.0001)
    start = Math.floor(min / step) * step
  }
  const bins = Math.max(1, Math.floor((cap - start) / step) + 1)
  const counts = new Array<number>(bins).fill(0)
  let overflow = 0
  for (let i = 0; i < n; i++) {
    const k = Math.floor((sorted[i] - start) / step)
    if (k >= bins) overflow++
    else counts[Math.max(0, k)]++
  }
  return { start, step, counts, overflow }
}
