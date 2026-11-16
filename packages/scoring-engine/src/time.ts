import type { RulesetDefinition } from './types'

/**
 * The run time that counts for a completed run (M10-18): the ruleset's `zeroPointsTimeMs` when
 * the run scored exactly zero points and the ruleset sets one, otherwise the measured time.
 * `measuredMs` of 0 means no time was recorded.
 */
export function countedTimeMs(
  definition: Pick<RulesetDefinition, 'zeroPointsTimeMs'> | null | undefined,
  points: number | null | undefined,
  measuredMs: number,
): number {
  const zero = definition?.zeroPointsTimeMs
  return zero !== undefined && points === 0 ? zero : measuredMs
}

/** Whether a run's counted time replaces its measured time. */
export function usesZeroPointsTime(
  definition: Pick<RulesetDefinition, 'zeroPointsTimeMs'> | null | undefined,
  points: number | null | undefined,
): boolean {
  return definition?.zeroPointsTimeMs !== undefined && points === 0
}
