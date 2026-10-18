import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

import { createDefaultPlan } from '@/domain/model/defaults'
import { createPresetScenarios } from '@/domain/model/presets'
import { exportPlan, importPlan } from '@/domain/model/scenarioFile'
import { validatePlan } from '@/domain/model/validation'
import {
  deleteScenario,
  getScenario,
  listScenarios,
  openScenarioDb,
  putScenario,
} from '@/persistence/scenarioDb'

let dbCounter = 0
const freshDb = () => openScenarioDb(`test-scenarios-${++dbCounter}`)

describe('Mitgelieferte Szenarien', () => {
  it('sind gültig und setzen die Marktannahmen der Spezifikation', () => {
    const [basis, pessimistic, optimistic] = createPresetScenarios(2026)
    for (const preset of [basis, pessimistic, optimistic]) {
      expect(validatePlan(preset.plan).ok).toBe(true)
    }
    expect(basis.plan).toEqual(createDefaultPlan(2026))
    expect(pessimistic.plan.name).toBe('Pessimistisch')
    expect(pessimistic.plan.market).toMatchObject({
      type: 'student-t',
      studentDf: 5,
      equity: { mean: 0.06, vol: 0.18 },
      inflation: { mean: 0.03 },
    })
    expect(optimistic.plan.market.equity.mean).toBe(0.09)
    expect(optimistic.plan.market.inflation.mean).toBe(0.02)
  })
})

describe('JSON-Export und -Import', () => {
  it('ergibt nach Export und Import ein identisches Objekt', () => {
    const plans = createPresetScenarios(2026).map((p) => p.plan)
    const custom = createDefaultPlan(2026)
    custom.name = 'Mit allem'
    custom.market.type = 'block-bootstrap'
    custom.market.bootstrap = { meanBlockLength: 7, fromYear: 1950, toYear: 2020 }
    custom.spending.oneOffs = [{ age: 60, amount: 25_000, label: 'Auto' }]
    custom.spending.ageProfile = [
      { age: 70, factor: 1 },
      { age: 85, factor: 0.8 },
    ]
    custom.strategy = {
      type: 'bucket',
      cashYears: 2.5,
      bondYears: 5,
      refillRule: 'equity-up-only',
      equityUpThreshold: 0.02,
    }
    custom.health.bridgePhase = { type: 'pkv', monthlyPremium: 650, premiumGrowth: 0.03 }
    for (const plan of [...plans, custom]) {
      expect(importPlan(exportPlan(plan))).toEqual({ ok: true, plan })
    }
  })

  it('lehnt kaputtes JSON, das Ursprungsformat und ungültige Pläne mit Meldung ab', () => {
    expect(importPlan('{ kein json')).toMatchObject({
      ok: false,
      message: expect.stringContaining('JSON'),
    })
    expect(
      importPlan(JSON.stringify({ schemaVersion: 1, yearlyWithdrawal: 100_000 })),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining('schemaVersion 1'),
    })
    expect(importPlan(JSON.stringify({ name: 'ohne Version' }))).toMatchObject({
      ok: false,
      message: expect.stringContaining('Unbekannte schemaVersion'),
    })
    const invalid = createDefaultPlan(2026)
    invalid.household.retirementAge = 40
    expect(importPlan(exportPlan(invalid))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: 'household.retirementAge' }),
      ]),
    })
  })
})

describe('IndexedDB', () => {
  it('speichert, lädt und löscht Szenarien', async () => {
    const db = await freshDb()
    const plan = createDefaultPlan(2026)
    await putScenario(db, { id: 'a', name: 'Zweites', plan, updatedAt: 2 })
    await putScenario(db, {
      id: 'b',
      name: 'Erstes',
      plan: { ...plan, name: 'Erstes' },
      updatedAt: 1,
    })
    expect((await listScenarios(db)).map((s) => s.name)).toEqual(['Erstes', 'Zweites'])
    expect((await getScenario(db, 'a'))?.plan).toEqual(plan)
    await deleteScenario(db, 'a')
    expect((await listScenarios(db)).map((s) => s.id)).toEqual(['b'])
    expect(await getScenario(db, 'a')).toBeUndefined()
  })
})
