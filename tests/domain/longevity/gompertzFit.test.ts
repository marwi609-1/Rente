import { describe, expect, it } from 'vitest'

import { mortalityDe } from '@/data/mortality'
import { fitGompertz } from '@/domain/longevity/gompertzFit'
import { gompertzSurvival } from '@/domain/longevity/longevity'
import { cohortQx } from '@/domain/longevity/mortalityTable'

describe('Gompertz-Anpassung an die Sterbetafel', () => {
  it('findet die Parameter einer exakten Gompertz-Kurve wieder', () => {
    const qx = Array.from({ length: 50 }, (_, k) => 1 - gompertzSurvival(60 + k, 61 + k, 87, 9))
    expect(fitGompertz(qx, 60)).toEqual({ modalAge: 87, dispersion: 9 })
  })

  it('reproduziert die Werte aus ASSUMPTIONS.md V1 (Jahrgang 1974 ab 52, Variante 3)', () => {
    // Abweichung höchstens eine Rundungsstelle (Gitterweite 0,05)
    const m = fitGompertz(cohortQx(mortalityDe, 'm', 1974, 52), 52)
    expect(Math.abs(m.modalAge - 89.1)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(m.dispersion - 9.6)).toBeLessThanOrEqual(0.15)
    const w = fitGompertz(cohortQx(mortalityDe, 'w', 1974, 52), 52)
    expect(Math.abs(w.modalAge - 93.1)).toBeLessThanOrEqual(0.15)
    expect(Math.abs(w.dispersion - 8.7)).toBeLessThanOrEqual(0.15)
  })
})
