export * from './types'
export { validateRankingConfig, compileRankingConfig, RankingConfigError } from './validate'
export type { CompiledRankingConfig, ValidationResult } from './validate'
export { rank, explainTeam } from './rank'
export { compareResults, formatTime, DEFAULT_ORDER } from './compute'
export { EXAMPLE_RANKING_CONFIG, defaultRankingConfig } from './example'
export {
  decimalsOfResolution,
  formatRunTime,
  timeDecimals,
  timeResolutionMs,
  truncateTime,
  withTimeDecimals,
} from './time'
export type { TimeDecimals } from './time'
export { fingerprint, canonicalJson } from '@judge26/scoring-engine'
