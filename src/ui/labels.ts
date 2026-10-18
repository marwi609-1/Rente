import type {
  Longevity,
  MarketModelType,
  StrategyConfig,
  WithdrawalRule,
} from '@/domain/model/types'

export const withdrawalRuleLabels: Record<WithdrawalRule['type'], string> = {
  'fixed-real': 'Fester realer Konsum',
  'percent-of-portfolio': 'Prozent vom Depot',
  'guyton-klinger': 'Guyton-Klinger',
  vpw: 'Variable Percentage Withdrawal',
  'floor-ceiling': 'Floor & Ceiling',
}

export const strategyLabels: Record<StrategyConfig['type'], string> = {
  fixed: 'Feste Allokation',
  glidepath: 'Glidepath',
  'bond-tent': 'Bond Tent',
  bucket: 'Bucket-Strategie',
}

export const marketModelLabels: Record<MarketModelType, string> = {
  deterministic: 'Deterministisch',
  lognormal: 'Lognormal',
  'student-t': 'Student-t',
  'historical-sequence': 'Historische Sequenzen',
  'block-bootstrap': 'Block-Bootstrap',
}

export const longevityLabels: Record<Longevity['type'], string> = {
  fixed: 'Fester Horizont',
  gompertz: 'Gompertz',
  table: 'Sterbetafel (Destatis)',
}
