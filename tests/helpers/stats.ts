export function mean(values: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  return sum / values.length
}

/** Zentrales Moment der Ordnung k. */
export function centralMoment(values: ArrayLike<number>, k: number): number {
  const m = mean(values)
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += (values[i] - m) ** k
  return sum / values.length
}

export function variance(values: ArrayLike<number>): number {
  return centralMoment(values, 2)
}

/** Kurtosis (nicht Exzess): 3 bei Normalverteilung. */
export function kurtosis(values: ArrayLike<number>): number {
  return centralMoment(values, 4) / variance(values) ** 2
}

export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const ma = mean(a)
  const mb = mean(b)
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    sab += da * db
    saa += da * da
    sbb += db * db
  }
  return sab / Math.sqrt(saa * sbb)
}
