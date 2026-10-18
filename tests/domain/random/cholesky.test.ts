import { describe, expect, it } from 'vitest'

import { CholeskyError, cholesky } from '@/domain/random/cholesky'

function multiplyLLt(l: number[][]): number[][] {
  const n = l.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0
      for (let k = 0; k < n; k++) s += l[i][k] * l[j][k]
      return s
    }),
  )
}

describe('cholesky', () => {
  it('zerlegt eine bekannte Matrix exakt', () => {
    const l = cholesky([
      [4, 12, -16],
      [12, 37, -43],
      [-16, -43, 98],
    ])
    expect(l).toEqual([
      [2, 0, 0],
      [6, 1, 0],
      [-8, 5, 3],
    ])
  })

  it('rekonstruiert die Default-Korrelationsmatrix', () => {
    const a = [
      [1.0, 0.1, 0.0, -0.1],
      [0.1, 1.0, 0.3, -0.2],
      [0.0, 0.3, 1.0, 0.5],
      [-0.1, -0.2, 0.5, 1.0],
    ]
    const back = multiplyLLt(cholesky(a))
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) expect(back[i][j]).toBeCloseTo(a[i][j], 12)
    }
  })

  it('wirft bei nicht positiv definiter Matrix', () => {
    expect(() =>
      cholesky([
        [1, 2],
        [2, 1],
      ]),
    ).toThrow(CholeskyError)
    // positiv semidefinit (perfekte Korrelation) genügt nicht
    expect(() =>
      cholesky([
        [1, 1],
        [1, 1],
      ]),
    ).toThrow(CholeskyError)
  })

  it('wirft bei nicht quadratischer Matrix', () => {
    expect(() => cholesky([[1, 0]])).toThrow(RangeError)
  })
})
