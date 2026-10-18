import { z } from 'zod'

import { CholeskyError, cholesky } from '../random/cholesky'

// Standardmeldungen von zod (Bereichs-, Typfehler) auf Deutsch; eigene Regeln haben eigene Texte.
z.config(z.locales.de())

/** Toleranz für „Anteile summieren sich zu 1“ und Symmetrie der Korrelationsmatrix. */
export const SUM_TOLERANCE = 1e-9

const share = z.number().min(0).max(1)
const eur = z.number().min(0)
const age = z.number().int().min(0).max(120)
const smallRate = z.number().min(-0.2).max(0.2)

const ALLOCATION_SUM_MESSAGE =
  'Aktien- und Cash-Anteil zusammen dürfen 100 % nicht überschreiten (der Anleihenanteil wäre negativ).'

/** Explizite Allokation mit drei Anteilen; die Summe muss 1 ergeben. */
export const allocationSchema = z
  .object({ equity: share, bonds: share, cash: share })
  .refine((a) => Math.abs(a.equity + a.bonds + a.cash - 1) <= SUM_TOLERANCE, {
    error: 'Die Anteile von Aktien, Anleihen und Cash müssen sich zu 100 % summieren.',
  })

const longevitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed') }),
  z.object({
    type: z.literal('gompertz'),
    modalAge: z.number().min(50).max(120),
    dispersion: z.number().gt(0).max(30),
  }),
  z.object({ type: z.literal('table') }),
])

const householdSchema = z
  .object({
    startYear: z.number().int().min(2000).max(2200),
    currentAge: age,
    sex: z.enum(['m', 'w']),
    retirementAge: age,
    planningHorizonAge: age,
    longevity: longevitySchema,
    childless: z.boolean(),
    churchTaxRate: z.union([z.literal(0), z.literal(0.08), z.literal(0.09)]),
  })
  .superRefine((h, ctx) => {
    if (h.retirementAge < h.currentAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['retirementAge'],
        message: 'Das Ruhestandsalter darf nicht unter dem aktuellen Alter liegen.',
      })
    }
    if (h.planningHorizonAge < h.retirementAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['planningHorizonAge'],
        message: 'Der Planungshorizont darf nicht vor dem Ruhestandsalter liegen.',
      })
    }
  })

const portfolioSchema = z.object({
  totalValue: eur,
  // > 1 bedeutet einen nicht realisierten Verlust.
  costBasisShare: z.number().min(0).max(10),
  lossCarryForward: eur,
})

const savingsSchema = z.object({
  yearlyNet: eur,
  realGrowth: smallRate,
})

const withdrawalRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed-real') }),
  z.object({ type: z.literal('percent-of-portfolio'), rate: z.number().gt(0).max(1) }),
  z.object({
    type: z.literal('guyton-klinger'),
    initialRate: z.number().gt(0).max(1),
    guardBand: z.number().gt(0).lt(1),
    adjustment: z.number().gt(0).lt(1),
  }),
  z.object({ type: z.literal('vpw'), expectedRealReturn: z.number().gt(-0.5).max(0.5) }),
  z
    .object({
      type: z.literal('floor-ceiling'),
      rate: z.number().gt(0).max(1),
      floorFactor: z.number().min(0).max(5),
      ceilingFactor: z.number().min(0).max(5),
    })
    .refine((r) => r.floorFactor <= r.ceilingFactor, {
      path: ['ceilingFactor'],
      error: 'Der Ceiling-Faktor darf nicht unter dem Floor-Faktor liegen.',
    }),
])

function strictlyIncreasingAges(items: readonly { age: number }[]): number | null {
  for (let i = 1; i < items.length; i++) {
    if (items[i].age <= items[i - 1].age) return i
  }
  return null
}

const spendingSchema = z
  .object({
    netConsumption: eur,
    minimumAcceptableConsumption: eur,
    rule: withdrawalRuleSchema,
    ageProfile: z
      .array(z.object({ age, factor: z.number().min(0).max(5) }))
      .superRefine((points, ctx) => {
        const i = strictlyIncreasingAges(points)
        if (i !== null) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'age'],
            message:
              'Die Stützstellen des Ausgabenprofils müssen nach Alter aufsteigend sortiert sein.',
          })
        }
      }),
    oneOffs: z.array(z.object({ age, amount: eur, label: z.string().max(100) })),
  })
  .superRefine((s, ctx) => {
    // Bei festem realem Konsum wäre sonst jedes Ruhestandsjahr per Definition ein Fehljahr.
    if (s.rule.type === 'fixed-real' && s.minimumAcceptableConsumption > s.netConsumption) {
      ctx.addIssue({
        code: 'custom',
        path: ['minimumAcceptableConsumption'],
        message:
          'Bei festem realem Konsum darf der Mindestkonsum nicht über dem Netto-Konsum liegen; sonst wäre jedes Ruhestandsjahr ein Fehljahr.',
      })
    }
  })

const statePensionSchema = z
  .object({
    regularAge: z.number().int().min(60).max(75),
    startAge: z.number().int().min(60).max(75),
    monthlyGrossCurrent: eur,
    monthlyGrossProjected: eur,
    earlyStartAllowed: z.boolean(),
    adjustmentRate: smallRate,
  })
  .superRefine((p, ctx) => {
    if (p.startAge < p.regularAge) {
      if (!p.earlyStartAllowed) {
        ctx.addIssue({
          code: 'custom',
          path: ['startAge'],
          message:
            'Ein Rentenbeginn vor der Regelaltersgrenze setzt 35 Jahre Wartezeit voraus (vorgezogener Beginn nicht erlaubt).',
        })
      } else if (p.startAge < 63) {
        ctx.addIssue({
          code: 'custom',
          path: ['startAge'],
          message: 'Ein vorgezogener Rentenbeginn ist frühestens mit 63 möglich.',
        })
      }
    }
    if (p.monthlyGrossProjected < p.monthlyGrossCurrent) {
      ctx.addIssue({
        code: 'custom',
        path: ['monthlyGrossProjected'],
        message:
          'Die Hochrechnung bis zur Regelaltersgrenze darf nicht unter dem bisherigen Anspruch liegen.',
      })
    }
  })

export const INCOME_PRODUCTS = [
  'bav-insurance',
  'bav-direct',
  'riester',
  'avd',
  'basis',
  'private-annuity',
  'life-insurance',
  'other-taxable',
  'other-tax-free',
] as const

const additionalIncomeSchema = z
  .object({
    label: z.string().max(100),
    product: z.enum(INCOME_PRODUCTS),
    payout: z.enum(['lump-sum', 'lifelong', 'fixed-term']),
    startAge: age,
    years: z.number().int().min(1).max(60),
    amount: eur,
    growth: smallRate,
    basis: z.enum(['nominal', 'today']),
    contributions: eur,
    contractYear: z.number().int().min(1950).max(2200),
    fundLinked: z.boolean(),
  })
  .superRefine((income, ctx) => {
    // § 10 Abs. 1 Nr. 2 Buchst. b EStG: nur lebenslange Leibrente
    if (income.product === 'basis' && income.payout !== 'lifelong') {
      ctx.addIssue({
        code: 'custom',
        path: ['payout'],
        message: 'Eine Basisrente wird nur als lebenslange Rente ausgezahlt.',
      })
    }
  })

const healthSchema = z.object({
  bridgePhase: z.discriminatedUnion('type', [
    z.object({ type: z.literal('gkv-voluntary') }),
    z.object({ type: z.literal('pkv'), monthlyPremium: eur, premiumGrowth: smallRate }),
  ]),
  // fehlt in Szenarien vor Version 1.06
  pensionPhase: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('gkv') }),
      z.object({ type: z.literal('pkv'), monthlyPremium: eur, premiumGrowth: smallRate }),
    ])
    .default({ type: 'gkv' }),
  kvdrEligible: z.boolean(),
  paramsGrowth: smallRate,
})

const taxSchema = z.object({
  enabled: z.boolean(),
  saverAllowance: eur.max(100_000),
  partialExemption: z.object({ equity: share, bonds: share }),
  basiszins: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), rate: z.number().min(-0.1).max(0.2) }),
    z.object({ type: z.literal('bond-mean') }),
  ]),
  costBasisMethod: z.literal('average'),
  guenstigerpruefung: z.boolean(),
  indexBracketsWithInflation: z.boolean(),
})

const meanRate = z.number().gt(-1).max(1)
const vol = z.number().min(0).max(1)
const assetReturnSchema = z.object({ mean: meanRate, vol, ter: z.number().min(0).max(0.05) })
const seriesSchema = z.object({ mean: meanRate, vol })

export const CORRELATION_ORDER = ['equity', 'bonds', 'cash', 'inflation'] as const

const correlationSchema = z
  .array(z.array(z.number().min(-1).max(1)).length(4))
  .length(4)
  .superRefine((m, ctx) => {
    // Dimensionsfehler meldet bereits `.length(4)`; zod führt diese Prüfung trotzdem aus.
    if (m.length !== 4 || m.some((row) => row.length !== 4)) return
    for (let i = 0; i < 4; i++) {
      if (Math.abs(m[i][i] - 1) > SUM_TOLERANCE) {
        ctx.addIssue({
          code: 'custom',
          path: [i, i],
          message: 'Die Diagonale der Korrelationsmatrix muss 1 sein.',
        })
        return
      }
      for (let j = 0; j < i; j++) {
        if (Math.abs(m[i][j] - m[j][i]) > SUM_TOLERANCE) {
          ctx.addIssue({
            code: 'custom',
            path: [i, j],
            message: `Die Korrelationsmatrix muss symmetrisch sein (${CORRELATION_ORDER[i]}/${CORRELATION_ORDER[j]}).`,
          })
          return
        }
      }
    }
    try {
      cholesky(m)
    } catch (e) {
      if (!(e instanceof CholeskyError)) throw e
      ctx.addIssue({
        code: 'custom',
        message:
          'Die Korrelationen sind untereinander widersprüchlich: Die Matrix ist nicht positiv definit (Cholesky-Zerlegung fehlgeschlagen). Bitte einzelne Korrelationen betragsmäßig verringern.',
      })
    }
  })

const marketSchema = z
  .object({
    type: z.enum([
      'deterministic',
      'lognormal',
      'student-t',
      'historical-sequence',
      'block-bootstrap',
    ]),
    equity: assetReturnSchema,
    bonds: assetReturnSchema,
    cash: seriesSchema,
    inflation: seriesSchema,
    correlation: correlationSchema,
    // ν > 2, damit die Varianz endlich ist und auf 1 skaliert werden kann.
    studentDf: z.number().gt(2).max(1000).optional(),
    bootstrap: z
      .object({
        meanBlockLength: z.number().min(1).max(50),
        fromYear: z.number().int().optional(),
        toYear: z.number().int().optional(),
      })
      .refine((b) => b.fromYear === undefined || b.toYear === undefined || b.fromYear <= b.toYear, {
        path: ['toYear'],
        error: 'Das Endjahr darf nicht vor dem Startjahr liegen.',
      })
      .optional(),
  })
  .superRefine((m, ctx) => {
    if (m.type === 'student-t' && m.studentDf === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['studentDf'],
        message: 'Für das Student-t-Modell müssen die Freiheitsgrade angegeben werden.',
      })
    }
  })

function checkEquityCash(
  ctx: z.RefinementCtx,
  equity: number,
  cash: number,
  path: (string | number)[],
): void {
  if (equity + cash > 1 + SUM_TOLERANCE) {
    ctx.addIssue({ code: 'custom', path, message: ALLOCATION_SUM_MESSAGE })
  }
}

const strategySchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('fixed'), equity: share, cash: share })
    .superRefine((s, ctx) => checkEquityCash(ctx, s.equity, s.cash, ['equity'])),
  z
    .object({
      type: z.literal('glidepath'),
      points: z.array(z.object({ age, equity: share })).min(1),
      cash: share,
    })
    .superRefine((s, ctx) => {
      const i = strictlyIncreasingAges(s.points)
      if (i !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['points', i, 'age'],
          message: 'Die Glidepath-Punkte müssen nach Alter aufsteigend sortiert sein.',
        })
      }
      s.points.forEach((p, k) => checkEquityCash(ctx, p.equity, s.cash, ['points', k, 'equity']))
    }),
  z
    .object({
      type: z.literal('bond-tent'),
      startAge: age,
      startEquity: share,
      peakAge: age,
      peakEquity: share,
      endAge: age,
      endEquity: share,
      cash: share,
    })
    .superRefine((s, ctx) => {
      // Bei gleichen Altern gilt die spätere Stützstelle; fiele der Tiefpunkt auf das Endalter,
      // würde er nie erreicht.
      if (!(s.startAge <= s.peakAge && s.peakAge < s.endAge)) {
        ctx.addIssue({
          code: 'custom',
          path: ['peakAge'],
          message: 'Für das Bond Tent muss Startalter ≤ Tiefpunktalter < Endalter gelten.',
        })
      }
      if (s.peakEquity > Math.min(s.startEquity, s.endEquity)) {
        ctx.addIssue({
          code: 'custom',
          path: ['peakEquity'],
          message:
            'Die Aktienquote am Tiefpunkt des Bond Tents darf nicht über Start- und Endquote liegen.',
        })
      }
      checkEquityCash(ctx, s.startEquity, s.cash, ['startEquity'])
      checkEquityCash(ctx, s.peakEquity, s.cash, ['peakEquity'])
      checkEquityCash(ctx, s.endEquity, s.cash, ['endEquity'])
    }),
  z.object({
    type: z.literal('bucket'),
    cashYears: z.number().min(0).max(30),
    bondYears: z.number().min(0).max(30),
    refillRule: z.enum(['annual', 'equity-up-only']),
    equityUpThreshold: z.number().min(-1).max(1),
  }),
])

const rebalancingSchema = z.object({
  band: share,
  taxAware: z.boolean(),
})

const simulationSchema = z.object({
  paths: z.number().int().min(1_000).max(100_000),
  seed: z.number().int().min(0).max(0xffff_ffff),
  outputReal: z.boolean(),
  successTargetRate: z.number().gt(0).lt(1),
})

export const retirementPlanSchema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string().trim().min(1).max(100),
    household: householdSchema,
    portfolio: portfolioSchema,
    savings: savingsSchema,
    spending: spendingSchema,
    statePension: statePensionSchema,
    // fehlt in Szenarien vor Version 1.04
    additionalIncome: z.array(additionalIncomeSchema).max(30).default([]),
    health: healthSchema,
    tax: taxSchema,
    market: marketSchema,
    strategy: strategySchema,
    rebalancing: rebalancingSchema,
    simulation: simulationSchema,
  })
  .superRefine((plan, ctx) => {
    const { currentAge, planningHorizonAge } = plan.household
    plan.spending.oneOffs.forEach((o, i) => {
      if (o.age < currentAge || o.age > planningHorizonAge) {
        ctx.addIssue({
          code: 'custom',
          path: ['spending', 'oneOffs', i, 'age'],
          message: 'Einmalausgaben müssen zwischen aktuellem Alter und Planungshorizont liegen.',
        })
      }
    })
    plan.additionalIncome.forEach((income, i) => {
      if (income.startAge < currentAge || income.startAge > planningHorizonAge) {
        ctx.addIssue({
          code: 'custom',
          path: ['additionalIncome', i, 'startAge'],
          message: 'Der Beginn muss zwischen aktuellem Alter und Planungshorizont liegen.',
        })
      }
      const payoutYear = plan.household.startYear + income.startAge - currentAge
      const insurance = income.product === 'private-annuity' || income.product === 'life-insurance'
      if (insurance && income.contractYear > payoutYear) {
        ctx.addIssue({
          code: 'custom',
          path: ['additionalIncome', i, 'contractYear'],
          message: `Der Vertrag muss spätestens im Jahr der ersten Auszahlung (${payoutYear}) abgeschlossen sein.`,
        })
      }
    })
  })
