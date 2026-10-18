/** Abbruchgenauigkeit der Iteration. */
const FINE_TOLERANCE = 0.01
/** Mindestgenauigkeit laut Spezifikation (Abschnitt 7, Schritt 4). */
const REQUIRED_TOLERANCE = 1
const MAX_ITERATIONS = 30
/**
 * Größte zulässige Überdeckung an einer Sprungstelle. Sprünge entstehen durch die Rundung von zvE
 * und Steuer auf volle Euro (§ 32a Abs. 1 EStG) und durch die vom Betrag abhängige Aufteilung der
 * Verkäufe auf die Anlageklassen; sie liegen bei wenigen Euro.
 */
const JUMP_TOLERANCE = 10
const MAX_BISECTIONS = 60

export class ConvergenceError extends Error {
  constructor(what: string, residual: number) {
    super(
      `${what} konvergiert nicht (Restabweichung ${residual.toFixed(2)} € nach ${MAX_ITERATIONS} Iterationen).`,
    )
    this.name = 'ConvergenceError'
  }
}

interface Evaluated<T> {
  x: number
  required: number
  state: T
}

/**
 * Löst x = clamp(required(x), lower, upper) per Fixpunktiteration ab `start`. `evaluate` liefert zu
 * einem Kandidaten x den dafür benötigten Betrag und einen Zustand, der zum zurückgegebenen x gehört.
 * Konvergenz bei |Δx| < 1 Cent.
 *
 * Ohne Konvergenz nach 30 Iterationen: Liegen Kandidaten mit nicht gedecktem (required > x) und
 * gedecktem Bedarf (required ≤ x) vor, pendelt die Iteration um eine Sprungstelle von `required`.
 * Dann wird die Stelle per Bisektion auf 1 Cent eingegrenzt und der kleinste deckende Kandidat
 * gewählt, sofern er höchstens 10 € über dem Bedarf liegt. Sonst wird eine Restabweichung bis 1 €
 * akzeptiert, darüber ein {@link ConvergenceError} geworfen.
 */
export function solveFixpoint<T>(
  what: string,
  evaluate: (x: number) => { required: number; state: T },
  bounds: { lower: number; upper: number; start: number },
): { value: number; state: T } {
  const clamp = (v: number) => Math.min(bounds.upper, Math.max(bounds.lower, v))
  const at = (x: number): Evaluated<T> => ({ x, ...evaluate(x) })
  /** größter Kandidat mit ungedecktem Bedarf */
  let short: Evaluated<T> | null = null
  /** kleinster Kandidat mit gedecktem Bedarf */
  let covered: Evaluated<T> | null = null
  const record = (e: Evaluated<T>) => {
    if (clamp(e.required) > e.x) {
      if (short === null || e.x > short.x) short = e
    } else if (covered === null || e.x < covered.x) {
      covered = e
    }
  }

  let current = at(clamp(bounds.start))
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = clamp(current.required)
    if (Math.abs(next - current.x) < FINE_TOLERANCE) {
      return { value: current.x, state: current.state }
    }
    record(current)
    current = at(next)
  }
  record(current)

  const lo = short as Evaluated<T> | null
  let hi = covered as Evaluated<T> | null
  if (lo !== null && hi !== null && lo.x < hi.x) {
    let low = lo
    for (let i = 0; i < MAX_BISECTIONS && hi.x - low.x >= FINE_TOLERANCE; i++) {
      const mid = at((low.x + hi.x) / 2)
      if (clamp(mid.required) > mid.x) low = mid
      else hi = mid
    }
    if (hi.x - clamp(hi.required) <= JUMP_TOLERANCE) return { value: hi.x, state: hi.state }
  }

  const residual = Math.abs(clamp(current.required) - current.x)
  if (residual <= REQUIRED_TOLERANCE) return { value: current.x, state: current.state }
  throw new ConvergenceError(what, residual)
}
