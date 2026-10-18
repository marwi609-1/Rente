import { describe, expect, it } from 'vitest'

import { defaultEngineContext as ctx } from '@/data/engineContext'
import { ConvergenceError, solveFixpoint } from '@/domain/engine/fixpoint'
import { simulateBlock } from '@/domain/engine/monteCarlo'
import { createDefaultPlan } from '@/domain/model/defaults'

const solve = (required: (x: number) => number, upper = 1_000) =>
  solveFixpoint('Test', (x) => ({ required: required(x), state: x }), {
    lower: 0,
    upper,
    start: 0,
  })

describe('Fixpunktlöser', () => {
  it('konvergiert bei kontrahierendem Bedarf auf einen Cent', () => {
    const { value } = solve((x) => 100 + 0.3 * x)
    expect(Math.abs(value - 100 / 0.7)).toBeLessThan(0.01)
  })

  it('begrenzt auf die Obergrenze, wenn der Bestand nicht reicht', () => {
    expect(solve((x) => 500 + x, 200).value).toBe(200)
  })

  it('wählt an einer Sprungstelle den kleinsten deckenden Betrag', () => {
    // Abwärtssprung um 2 € bei 142,50: links ungedeckt, rechts überdeckt → die Iteration pendelt
    const required = (x: number) => 100 + 0.3 * x - (x >= 142.5 ? 2 : 0)
    const { value, state } = solve(required)
    expect(value).toBeGreaterThanOrEqual(142.5)
    expect(value).toBeLessThan(142.51)
    expect(required(value)).toBeLessThanOrEqual(value)
    expect(state).toBe(value)
  })

  it('findet den Fixpunkt auch bei oszillierender Divergenz', () => {
    const { value } = solve((x) => 300 - 1.5 * x)
    expect(Math.abs(value - 120)).toBeLessThan(0.01)
  })

  it('meldet große Sprünge als fehlende Konvergenz', () => {
    expect(() => solve((x) => 100 + 0.3 * x - (x >= 142.5 ? 50 : 0))).toThrow(ConvergenceError)
  })

  it('rechnet den Default-Pfad mit pendelnder Brutto-Hochrechnung durch', () => {
    // Pfad 2732 des Default-Szenarios: zvE-Rundung erzeugt einen Sprung von 1,12 € im Bedarf.
    const block = simulateBlock(createDefaultPlan(2026), 2732, 2733, ctx)
    expect(block.paths).toBe(1)
  })
})
