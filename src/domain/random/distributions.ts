import type { Xoshiro128 } from './xoshiro'

/** Standardnormalverteilte Zahlen nach Box-Muller; das zweite Ergebnis jedes Paares wird gepuffert. */
export class NormalSampler {
  private spare = 0
  private hasSpare = false

  constructor(private readonly rng: Xoshiro128) {}

  next(): number {
    if (this.hasSpare) {
      this.hasSpare = false
      return this.spare
    }
    const radius = Math.sqrt(-2 * Math.log(this.rng.nextFloat()))
    const angle = 2 * Math.PI * this.rng.nextFloat()
    this.spare = radius * Math.sin(angle)
    this.hasSpare = true
    return radius * Math.cos(angle)
  }
}

/**
 * Gamma(shape, 1) nach Marsaglia/Tsang (2000); für shape < 1 über Gamma(shape + 1) · U^(1/shape).
 */
export function sampleGamma(shape: number, normal: NormalSampler, rng: Xoshiro128): number {
  if (!(shape > 0)) throw new RangeError('Der Formparameter der Gammaverteilung muss positiv sein.')
  if (shape < 1) {
    return sampleGamma(shape + 1, normal, rng) * Math.pow(rng.nextFloat(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const x = normal.next()
    let v = 1 + c * x
    if (v <= 0) continue
    v = v * v * v
    const u = rng.nextFloat()
    const x2 = x * x
    if (u < 1 - 0.0331 * x2 * x2) return d * v
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v
  }
}

/** Chi-Quadrat mit `df` Freiheitsgraden: 2 · Gamma(df/2, 1). */
export function sampleChiSquare(df: number, normal: NormalSampler, rng: Xoshiro128): number {
  return 2 * sampleGamma(df / 2, normal, rng)
}
