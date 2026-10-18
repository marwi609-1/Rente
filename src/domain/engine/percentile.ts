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

/** Bereiche bis zu dieser Größe werden durch Einfügen sortiert. */
const SMALL_RANGE = 16

function insertionSort(a: Float64Array, lo: number, hi: number): void {
  for (let i = lo + 1; i <= hi; i++) {
    const value = a[i]
    let j = i - 1
    while (j >= lo && a[j] > value) {
      a[j + 1] = a[j]
      j--
    }
    a[j + 1] = value
  }
}

function medianOfThree(x: number, y: number, z: number): number {
  return Math.max(Math.min(x, y), Math.min(Math.max(x, y), z))
}

/**
 * Ordnet `a[lo…hi]` so um, dass a[r] für jeden Rang r aus `ranks[from…to)` (aufsteigend) die r-te
 * Ordnungsstatistik ist: Quickselect für mehrere Ränge mit Hoare-Partition um den Median aus drei.
 * Verfolgt wird nur der Teil, der noch gesuchte Ränge enthält.
 */
function selectRanks(
  a: Float64Array,
  ranks: readonly number[],
  lo: number,
  hi: number,
  from: number,
  to: number,
): void {
  while (from < to && hi - lo >= SMALL_RANGE) {
    const pivot = medianOfThree(a[lo], a[(lo + hi) >>> 1], a[hi])
    let i = lo - 1
    let j = hi + 1
    for (;;) {
      do i++
      while (a[i] < pivot)
      do j--
      while (a[j] > pivot)
      if (i >= j) break
      const swap = a[i]
      a[i] = a[j]
      a[j] = swap
    }
    // a[lo…j] ≤ pivot ≤ a[j+1…hi]; die Seite mit weniger Rängen rekursiv, die andere in der Schleife
    let split = from
    while (split < to && ranks[split] <= j) split++
    if (split - from < to - split) {
      selectRanks(a, ranks, lo, j, from, split)
      lo = j + 1
      from = split
    } else {
      selectRanks(a, ranks, j + 1, hi, split, to)
      hi = j
      to = split
    }
  }
  if (from < to) insertionSort(a, lo, hi)
}

/**
 * Perzentile (Typ 7, wie {@link percentileOfSorted}) einer Stichprobe ohne NaN, ohne sie ganz zu
 * sortieren; die Reihenfolge von `values` ändert sich dabei. Gesucht werden nur die beiden
 * Ordnungsstatistiken je Perzentil, das spart bei 10.000 Werten rund zwei Drittel der Sortierzeit.
 */
export function percentilesOf(values: Float64Array, ps: readonly number[]): number[] {
  const n = values.length
  if (n === 0) return ps.map(() => NaN)
  const positions = ps.map((p) => {
    const h = (n - 1) * p
    const lo = Math.floor(h)
    return { h, lo, hi: Math.min(lo + 1, n - 1) }
  })
  const ranks = [...new Set(positions.flatMap((q) => [q.lo, q.hi]))].sort((x, y) => x - y)
  selectRanks(values, ranks, 0, n - 1, 0, ranks.length)
  return positions.map(({ h, lo, hi }) => values[lo] + (h - lo) * (values[hi] - values[lo]))
}
