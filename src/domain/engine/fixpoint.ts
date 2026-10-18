/** Abbruchgenauigkeit der Iteration. */
const FINE_TOLERANCE = 0.01
/** Mindestgenauigkeit laut Spezifikation (Abschnitt 7, Schritt 4). */
const REQUIRED_TOLERANCE = 1
const MAX_ITERATIONS = 30

export class ConvergenceError extends Error {
  constructor(what: string, residual: number) {
    super(
      `${what} konvergiert nicht (Restabweichung ${residual.toFixed(2)} € nach ${MAX_ITERATIONS} Iterationen).`,
    )
    this.name = 'ConvergenceError'
  }
}

/**
 * Löst x = clamp(required(x), lower, upper) per Fixpunktiteration ab `start`. `evaluate` liefert zu
 * einem Kandidaten x den dafür benötigten Betrag und einen Zustand, der zum zurückgegebenen x gehört.
 * Konvergenz bei |Δx| < 1 Cent; nach 30 Iterationen wird eine Restabweichung bis 1 € akzeptiert,
 * sonst wird ein {@link ConvergenceError} geworfen.
 */
export function solveFixpoint<T>(
  what: string,
  evaluate: (x: number) => { required: number; state: T },
  bounds: { lower: number; upper: number; start: number },
): { value: number; state: T } {
  const clamp = (v: number) => Math.min(bounds.upper, Math.max(bounds.lower, v))
  let x = clamp(bounds.start)
  let result = evaluate(x)
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = clamp(result.required)
    if (Math.abs(next - x) < FINE_TOLERANCE) return { value: x, state: result.state }
    x = next
    result = evaluate(x)
  }
  const residual = Math.abs(clamp(result.required) - x)
  if (residual <= REQUIRED_TOLERANCE) return { value: x, state: result.state }
  throw new ConvergenceError(what, residual)
}
