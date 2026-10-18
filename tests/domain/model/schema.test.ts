import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'

import { createDefaultPlan, defaultPlan } from '@/domain/model/defaults'
import { allocationSchema, retirementPlanSchema } from '@/domain/model/schema'
import type { RetirementPlan } from '@/domain/model/types'
import { PlanValidationError, parsePlan, validatePlan } from '@/domain/model/validation'

function withPlan(adjust: (plan: RetirementPlan) => void): RetirementPlan {
  const plan = createDefaultPlan(2026)
  adjust(plan)
  return plan
}

function issuesOf(input: unknown) {
  const result = validatePlan(input)
  if (result.ok) throw new Error('Plan wurde unerwartet akzeptiert')
  return result.issues
}

describe('Plan-Schema', () => {
  it('beschreibt exakt den Typ RetirementPlan', () => {
    expectTypeOf<z.infer<typeof retirementPlanSchema>>().toEqualTypeOf<RetirementPlan>()
  })

  it('akzeptiert das Default-Szenario', () => {
    expect(validatePlan(defaultPlan).ok).toBe(true)
    expect(parsePlan(createDefaultPlan(2030)).household.startYear).toBe(2030)
  })

  it('setzt das Startjahr des Default-Szenarios auf das aktuelle Kalenderjahr', () => {
    expect(defaultPlan.household.startYear).toBe(new Date().getFullYear())
  })

  describe('Allokationen', () => {
    it('lehnt eine explizite Allokation mit Summe ≠ 1 ab', () => {
      expect(allocationSchema.safeParse({ equity: 0.6, bonds: 0.3, cash: 0.05 }).success).toBe(
        false,
      )
      expect(allocationSchema.safeParse({ equity: 0.6, bonds: 0.4, cash: 0.05 }).success).toBe(
        false,
      )
      expect(allocationSchema.safeParse({ equity: 0.6, bonds: 0.35, cash: 0.05 }).success).toBe(
        true,
      )
    })

    it('lehnt Anteile außerhalb von [0, 1] ab', () => {
      expect(allocationSchema.safeParse({ equity: 1.2, bonds: -0.2, cash: 0 }).success).toBe(false)
    })

    it('lehnt eine fixe Strategie ab, deren Aktien- und Cash-Anteil 1 übersteigt', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.strategy = { type: 'fixed', equity: 0.8, cash: 0.3 }
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({
          path: 'strategy.equity',
          message: expect.stringContaining('100 %'),
        }),
      )
    })

    it('lehnt Glidepath-Punkte ab, deren Aktienanteil mit Cash 1 übersteigt', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.strategy = { type: 'glidepath', points: [{ age: 60, equity: 0.98 }], cash: 0.05 }
        }),
      )
      expect(issues.map((i) => i.path)).toContain('strategy.points.0.equity')
    })

    it('lehnt ein Bond Tent mit einer Allokationssumme über 1 ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.strategy = {
            type: 'bond-tent',
            startAge: 50,
            startEquity: 0.7,
            peakAge: 57,
            peakEquity: 0.4,
            endAge: 70,
            endEquity: 0.97,
            cash: 0.05,
          }
        }),
      )
      expect(issues.map((i) => i.path)).toContain('strategy.endEquity')
    })
  })

  describe('Altersgrenzen', () => {
    it('lehnt ein Ruhestandsalter unter dem aktuellen Alter ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.household.currentAge = 60
          p.household.retirementAge = 57
        }),
      )
      expect(issues).toContainEqual(expect.objectContaining({ path: 'household.retirementAge' }))
    })

    it('lehnt einen Planungshorizont vor dem Ruhestandsalter ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.household.planningHorizonAge = 55
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({ path: 'household.planningHorizonAge' }),
      )
    })

    it('akzeptiert gleiche Altersgrenzen', () => {
      const plan = withPlan((p) => {
        p.household.currentAge = 70
        p.household.retirementAge = 70
        p.household.planningHorizonAge = 70
      })
      expect(validatePlan(plan).ok).toBe(true)
    })

    it('verlangt nach Alter sortierte Glidepath-Punkte', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.strategy = {
            type: 'glidepath',
            points: [
              { age: 60, equity: 0.5 },
              { age: 58, equity: 0.6 },
            ],
            cash: 0,
          }
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({
          path: 'strategy.points.1.age',
          message: expect.stringContaining('sortiert'),
        }),
      )
    })

    it('verlangt ein sortiertes Ausgabenprofil', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.spending.ageProfile = [
            { age: 80, factor: 0.8 },
            { age: 80, factor: 0.7 },
          ]
        }),
      )
      expect(issues.map((i) => i.path)).toContain('spending.ageProfile.1.age')
    })

    it('verlangt Einmalausgaben innerhalb des Planungszeitraums', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.spending.oneOffs = [{ age: 99, amount: 10_000, label: 'Umbau' }]
        }),
      )
      expect(issues.map((i) => i.path)).toContain('spending.oneOffs.0.age')
    })

    it('verlangt für einen vorgezogenen Rentenbeginn die erfüllte Wartezeit und mindestens 63 Jahre', () => {
      const notAllowed = issuesOf(
        withPlan((p) => {
          p.statePension.startAge = 64
          p.statePension.earlyStartAllowed = false
        }),
      )
      expect(notAllowed.map((i) => i.path)).toContain('statePension.startAge')

      const tooEarly = issuesOf(
        withPlan((p) => {
          p.statePension.startAge = 62
        }),
      )
      expect(tooEarly.map((i) => i.path)).toContain('statePension.startAge')

      expect(validatePlan(withPlan((p) => (p.statePension.startAge = 63))).ok).toBe(true)
    })
  })

  describe('Korrelationsmatrix', () => {
    it('lehnt eine nicht positiv definite Matrix mit verständlicher Meldung ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.market.correlation = [
            [1, 0.9, 0.9, 0],
            [0.9, 1, -0.9, 0],
            [0.9, -0.9, 1, 0],
            [0, 0, 0, 1],
          ]
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({
          path: 'market.correlation',
          message: expect.stringContaining('nicht positiv definit'),
        }),
      )
    })

    it('lehnt eine asymmetrische Matrix ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.market.correlation[0][1] = 0.4
        }),
      )
      expect(issues).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('symmetrisch') }),
      )
    })

    it('lehnt eine Diagonale ≠ 1 ab', () => {
      const issues = issuesOf(
        withPlan((p) => {
          p.market.correlation[2][2] = 0.9
        }),
      )
      expect(issues.map((i) => i.path)).toContain('market.correlation.2.2')
    })

    it('lehnt eine falsche Dimension ab', () => {
      const plan = withPlan((p) => {
        p.market.correlation = [
          [1, 0],
          [0, 1],
        ]
      })
      expect(validatePlan(plan).ok).toBe(false)
    })
  })

  describe('weitere Regeln', () => {
    it('verlangt Freiheitsgrade > 2 für das Student-t-Modell', () => {
      const missing = withPlan((p) => {
        p.market.type = 'student-t'
        delete p.market.studentDf
      })
      expect(issuesOf(missing).map((i) => i.path)).toContain('market.studentDf')
      const tooLow = withPlan((p) => {
        p.market.studentDf = 2
      })
      expect(validatePlan(tooLow).ok).toBe(false)
    })

    it('begrenzt die Pfadanzahl auf 1.000–100.000', () => {
      expect(validatePlan(withPlan((p) => (p.simulation.paths = 999))).ok).toBe(false)
      expect(validatePlan(withPlan((p) => (p.simulation.paths = 100_001))).ok).toBe(false)
      expect(validatePlan(withPlan((p) => (p.simulation.paths = 1_000))).ok).toBe(true)
    })

    it('lehnt einen Kirchensteuersatz außerhalb von 0, 8 und 9 % ab', () => {
      const plan = { ...createDefaultPlan(2026) } as Record<string, unknown>
      plan.household = { ...createDefaultPlan(2026).household, churchTaxRate: 0.07 }
      expect(validatePlan(plan).ok).toBe(false)
    })

    it('lehnt unbekannte Schemaversionen ab', () => {
      expect(validatePlan({ ...createDefaultPlan(2026), schemaVersion: 1 }).ok).toBe(false)
    })

    it('liefert deutschsprachige Standardmeldungen', () => {
      const issues = issuesOf(withPlan((p) => (p.portfolio.totalValue = -1)))
      const issue = issues.find((i) => i.path === 'portfolio.totalValue')
      expect(issue?.message).toMatch(/[Zz]u klein|größer/)
    })

    it('parsePlan wirft einen PlanValidationError mit allen Meldungen', () => {
      const plan = withPlan((p) => {
        p.household.retirementAge = 40
        p.strategy = { type: 'fixed', equity: 0.9, cash: 0.2 }
      })
      expect(() => parsePlan(plan)).toThrow(PlanValidationError)
      expect(() => parsePlan(plan)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ path: 'household.retirementAge' }),
            expect.objectContaining({ path: 'strategy.equity' }),
          ]),
        }),
      )
    })
  })
})
