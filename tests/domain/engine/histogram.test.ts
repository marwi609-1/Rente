import { describe, expect, it } from 'vitest'

import { histogramOfSorted, niceStep } from '@/domain/engine/histogram'

describe('Histogramm', () => {
  it('rundet Klassenbreiten auf 1, 2, 2,5 oder 5 × 10^k', () => {
    expect(niceStep(0.7)).toBe(1)
    expect(niceStep(1.3)).toBe(2)
    expect(niceStep(2.2)).toBe(2.5)
    expect(niceStep(4_100)).toBe(5_000)
    expect(niceStep(61_000)).toBe(100_000)
    expect(niceStep(0)).toBe(1)
  })

  it('zählt jeden Wert genau einmal und kappt am Quantil', () => {
    const values = Float64Array.from({ length: 1_000 }, (_, i) => i * 1_000).sort()
    const h = histogramOfSorted(values, 20, 0.95)
    expect(h.counts.length).toBeLessThanOrEqual(20)
    expect(h.counts.reduce((a, b) => a + b, 0) + h.overflow).toBe(1_000)
    expect(h.start).toBe(0)
    // 95. Perzentil = 949.050 €; Klassen zu 50.000 € reichen bis 1.000.000 €
    expect(h.step).toBe(50_000)
    expect(h.counts).toHaveLength(19)
    expect(h.overflow).toBe(50)
  })

  it('beginnt bei negativen Werten unterhalb des Minimums', () => {
    const h = histogramOfSorted(Float64Array.from([-1.5, 0, 2, 3]), 10, 1)
    expect(h.start).toBeLessThanOrEqual(-1.5)
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(4)
    expect(h.overflow).toBe(0)
  })

  it('kommt mit leeren und konstanten Stichproben aus', () => {
    expect(histogramOfSorted(new Float64Array(0))).toEqual({
      start: 0,
      step: 1,
      counts: [],
      overflow: 0,
    })
    const constant = histogramOfSorted(Float64Array.from([5, 5, 5]))
    expect(constant.counts).toEqual([3])
  })
})
