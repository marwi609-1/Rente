/** Additive Konstante von SplitMix32 (⌊2³² / φ⌋). */
const GOLDEN_GAMMA = 0x9e3779b9
const TWO_POW_26 = 67_108_864
const TWO_POW_53 = 9_007_199_254_740_992

/** Finalisierer von SplitMix32 (Konstanten aus MurmurHash3 fmix32). */
function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
  return (z ^ (z >>> 16)) >>> 0
}

/** SplitMix32-Folge zum Startwert `seed`; jeder Aufruf liefert die nächste 32-Bit-Zahl. */
export function splitMix32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + GOLDEN_GAMMA) >>> 0
    return mix32(state)
  }
}

/**
 * Seed eines Pfades: erster SplitMix32-Wert zu `seed + pathIndex`. Jeder Pfad ist damit allein durch
 * (seed, pathIndex) bestimmt und unabhängig davon, wie die Pfade auf Worker verteilt werden.
 */
export function pathSeed(seed: number, pathIndex: number): number {
  return splitMix32((seed + pathIndex) >>> 0)()
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k))
}

/** xoshiro128** (Blackman/Vigna) mit 128 Bit Zustand. */
export class Xoshiro128 {
  private s0: number
  private s1: number
  private s2: number
  private s3: number

  /** Initialisiert den Zustand über SplitMix32 aus einem 32-Bit-Seed. */
  static fromSeed(seed: number): Xoshiro128 {
    const next = splitMix32(seed)
    return new Xoshiro128([next(), next(), next(), next()])
  }

  constructor(state: readonly [number, number, number, number]) {
    this.s0 = state[0] >>> 0
    this.s1 = state[1] >>> 0
    this.s2 = state[2] >>> 0
    this.s3 = state[3] >>> 0
    // Der Nullzustand ist ein Fixpunkt und daher unzulässig.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1
  }

  /** Nächste gleichverteilte 32-Bit-Ganzzahl ohne Vorzeichen. */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0
    const t = this.s1 << 9
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = rotl(this.s3, 11)
    return result
  }

  /** Gleichverteilte Zahl im offenen Intervall (0, 1) mit 53 Bit Auflösung. */
  nextFloat(): number {
    const a = this.nextUint32() >>> 5
    const b = this.nextUint32() >>> 6
    return (a * TWO_POW_26 + b + 0.5) / TWO_POW_53
  }
}
