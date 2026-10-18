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
const MAX_BRACKET_STEPS = 60

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
  /** g(x) = clamp(required(x)) − x: > 0 Bedarf ungedeckt, ≤ 0 gedeckt */
  gap: number
  state: T
}

/**
 * Löst x = clamp(required(x), lower, upper) ab `start`. `evaluate` liefert zu einem Kandidaten x den
 * dafür benötigten Betrag und einen Zustand, der zum zurückgegebenen x gehört. Gelöst ist x, wenn
 * |g(x)| < 1 Cent mit g(x) = clamp(required(x)) − x.
 *
 * 1. Iteration x ← clamp(required(x)), beschleunigt durch einen Sekantenschritt auf g, solange sich
 *    die Kandidaten der Lösung von derselben Seite nähern und g fällt. Bei stückweise linearem
 *    Bedarf (Steuer und KV je Tarifzone) trifft die Sekante die Lösung meist im ersten Versuch.
 * 2. Wechselt g das Vorzeichen, ist die Lösung eingeschlossen: Regula falsi (Illinois) innerhalb
 *    des Intervalls. Hat g dort eine Sprungstelle statt einer Nullstelle (Rundung auf volle Euro),
 *    schrumpft das Intervall auf die Sprungstelle; genommen wird der deckende Rand, sofern er
 *    höchstens 10 € über dem Bedarf liegt.
 * 3. Ohne Lösung nach 30 Iterationen wird eine Restabweichung bis 1 € akzeptiert, darüber ein
 *    {@link ConvergenceError} geworfen.
 */
export function solveFixpoint<T>(
  what: string,
  evaluate: (x: number) => { required: number; state: T },
  bounds: { lower: number; upper: number; start: number },
): { value: number; state: T } {
  const clamp = (v: number) => Math.min(bounds.upper, Math.max(bounds.lower, v))
  const at = (x: number): Evaluated<T> => {
    const result = evaluate(x)
    return { x, gap: clamp(result.required) - x, state: result.state }
  }
  const solved = (e: Evaluated<T>) => ({ value: e.x, state: e.state })

  let previous: Evaluated<T> | null = null
  let current = at(clamp(bounds.start))
  if (Math.abs(current.gap) < FINE_TOLERANCE) return solved(current)
  let bracket: [Evaluated<T>, Evaluated<T>] | null = null
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let candidate = current.x + current.gap
    if (previous !== null && Math.sign(previous.gap) === Math.sign(current.gap)) {
      const slope = (current.gap - previous.gap) / (current.x - previous.x)
      const secant = clamp(current.x - current.gap / slope)
      if (slope < 0 && Number.isFinite(secant) && secant !== current.x) candidate = secant
    }
    const next = at(candidate)
    if (Math.abs(next.gap) < FINE_TOLERANCE) return solved(next)
    if (Math.sign(next.gap) !== Math.sign(current.gap)) {
      bracket = [current, next]
      break
    }
    previous = current
    current = next
  }

  if (bracket !== null) {
    let [a, b] = bracket
    // Interpolationsgewichte; Illinois halbiert das Gewicht eines Randes, der zweimal stehen bleibt.
    let fa = a.gap
    let fb = b.gap
    let side = 0
    for (let i = 0; i < MAX_BRACKET_STEPS && Math.abs(b.x - a.x) >= FINE_TOLERANCE; i++) {
      let x = (a.x * fb - b.x * fa) / (fb - fa)
      if (!(x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x))) x = (a.x + b.x) / 2
      const c = at(x)
      if (Math.abs(c.gap) < FINE_TOLERANCE) return solved(c)
      if (Math.sign(c.gap) === Math.sign(a.gap)) {
        a = c
        fa = c.gap
        if (side === -1) fb /= 2
        side = -1
      } else {
        b = c
        fb = c.gap
        if (side === 1) fa /= 2
        side = 1
      }
    }
    // Sprungstelle: der Rand mit gedecktem Bedarf
    const covered = a.gap <= 0 ? a : b
    if (-covered.gap <= JUMP_TOLERANCE) return solved(covered)
    current = covered
  }

  const residual = Math.abs(current.gap)
  if (residual <= REQUIRED_TOLERANCE) return solved(current)
  throw new ConvergenceError(what, residual)
}
