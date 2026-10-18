/**
 * Stückweise lineare Interpolation über nach `x` aufsteigend sortierte Stützstellen; vor der ersten
 * und nach der letzten Stützstelle konstant. Bei gleichen `x` gilt der Wert der späteren Stützstelle.
 */
export function interpolateLinear<T>(
  points: readonly T[],
  x: number,
  getX: (point: T) => number,
  getY: (point: T) => number,
): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (x < getX(first)) return getY(first)
  if (x >= getX(last)) return getY(last)
  // erste Stützstelle rechts von x; davor liegt die letzte mit getX ≤ x, also x_lo ≤ x < x_hi
  let i = 1
  while (getX(points[i]) <= x) i++
  const lo = points[i - 1]
  const hi = points[i]
  return getY(lo) + ((getY(hi) - getY(lo)) * (x - getX(lo))) / (getX(hi) - getX(lo))
}
