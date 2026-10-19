import type { EngineContext } from '@/domain/engine/context'

import { historicalEur } from './historical'
import { mortalityDe } from './mortality'
import { paramsDe2026 } from './params-de-2026'

/** Rechtsstand 2026 mit den mitgelieferten historischen Renditen und Sterbetafeln. */
export const defaultEngineContext: EngineContext = {
  params: paramsDe2026,
  historical: historicalEur,
  mortality: mortalityDe,
}
