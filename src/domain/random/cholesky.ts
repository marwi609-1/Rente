/** Kleinster zulässiger Pivot; darunter gilt die Matrix als nicht (strikt) positiv definit. */
const MIN_PIVOT = 1e-12

export class CholeskyError extends Error {
  readonly row: number

  constructor(row: number) {
    super(
      `Cholesky-Zerlegung fehlgeschlagen: Die Matrix ist in Zeile ${row + 1} nicht positiv definit.`,
    )
    this.name = 'CholeskyError'
    this.row = row
  }
}

/**
 * Cholesky-Zerlegung A = L·Lᵀ einer symmetrischen, positiv definiten Matrix.
 * Liefert die untere Dreiecksmatrix L. Wirft {@link CholeskyError}, wenn A nicht positiv definit ist.
 * Symmetrie wird vorausgesetzt (gelesen wird nur das untere Dreieck).
 */
export function cholesky(a: readonly (readonly number[])[]): number[][] {
  const n = a.length
  if (a.some((row) => row.length !== n)) {
    throw new RangeError('Cholesky-Zerlegung erwartet eine quadratische Matrix.')
  }
  const lower: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j]
      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k]
      if (i === j) {
        if (!(sum > MIN_PIVOT)) throw new CholeskyError(i)
        lower[i][j] = Math.sqrt(sum)
      } else {
        lower[i][j] = sum / lower[j][j]
      }
    }
  }
  return lower
}
