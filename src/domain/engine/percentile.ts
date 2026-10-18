/**
 * Perzentil einer aufsteigend sortierten Stichprobe mit linearer Interpolation zwischen den
 * Ordnungsstatistiken (Hyndman/Fan Typ 7). `p` in [0, 1].
 */
export function percentileOfSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  const h = (n - 1) * p
  const lo = Math.floor(h)
  const hi = Math.min(lo + 1, n - 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}
