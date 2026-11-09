import type { RankingConfig } from './types'

/**
 * Example: three rounds; the best round counts, ties broken by its time, then by
 * the sum of all rounds. Offered as a starting point in the configuration editor.
 */
export const EXAMPLE_RANKING_CONFIG: RankingConfig = {
  schemaVersion: 1,
  precision: 0,
  timeResolutionMs: 10,
  rounds: [
    { key: 'R1', label: 'Round 1' },
    { key: 'R2', label: 'Round 2' },
    { key: 'R3', label: 'Round 3' },
  ],
  calculations: [
    {
      id: 'best',
      label: 'Best round',
      op: 'BEST_BY',
      by: [
        { field: 'points', order: 'desc' },
        { field: 'time', order: 'asc' },
      ],
      operands: [{ round: 'R1' }, { round: 'R2' }, { round: 'R3' }],
    },
    {
      id: 'total',
      label: 'Total of all rounds',
      op: 'ADD',
      operands: [{ round: 'R1' }, { round: 'R2' }, { round: 'R3' }],
    },
  ],
  policies: { missing: 'zero', disqualified: 'zero', absent: 'zero' },
  ranking: {
    keys: [
      { source: { calc: 'best' }, field: 'points', order: 'desc', label: 'Best' },
      { source: { calc: 'best' }, field: 'time', order: 'asc', label: 'Time of best' },
      { source: { calc: 'total' }, field: 'points', order: 'desc', label: 'Total' },
    ],
    ties: 'shared',
  },
}

/** A simple configuration (sum of all rounds) for the given round keys. */
export function defaultRankingConfig(roundKeys: { key: string; label?: string }[]): RankingConfig {
  const operands = roundKeys.map((r) => ({ round: r.key }))
  return {
    schemaVersion: 1,
    precision: 0,
    timeResolutionMs: 10,
    rounds: roundKeys.map((r) => ({ key: r.key, ...(r.label ? { label: r.label } : {}) })),
    calculations: [{ id: 'total', label: 'Total', op: 'ADD', operands }],
    ranking: {
      keys: [
        { source: { calc: 'total' }, field: 'points', order: 'desc', label: 'Total' },
        { source: { calc: 'total' }, field: 'time', order: 'asc', label: 'Total time' },
      ],
      ties: 'shared',
    },
  }
}
