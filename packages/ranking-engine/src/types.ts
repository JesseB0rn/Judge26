/**
 * Ranking configuration format (schema version 1).
 * Specified in docs/specifications/M3-rounds-and-ranking.md.
 */

export const SCHEMA_VERSION = 1

export type Field = 'points' | 'time'
export type SortOrder = 'asc' | 'desc'

/** Orders results: e.g. `[{ field: 'points', order: 'desc' }, { field: 'time', order: 'asc' }]`. */
export interface SortKey {
  field: Field
  order: SortOrder
}

/** Reference to a round result or to another calculation. */
export type Operand = { round: string } | { calc: string }

export type CalcOp = 'ADD' | 'MAX' | 'MIN' | 'DIFFERENCE' | 'BEST_BY' | 'WORST_BY' | 'SUM_BEST_N'

/** How a set of results is combined into one. */
export interface Aggregation {
  op: CalcOp
  /** Sort order for BEST_BY / WORST_BY / SUM_BEST_N. Default: points ↓, time ↑. */
  by?: SortKey[]
  /** Number of results for SUM_BEST_N. */
  n?: number
}

export interface Calculation extends Aggregation {
  /** Unique among rounds and calculations. */
  id: string
  label: string
  /** In order; DIFFERENCE computes operands[0] − operands[1] (M3-07). */
  operands: Operand[]
}

export interface RoundConfig {
  /** Round key, e.g. "R1". Games reference rounds by key. */
  key: string
  label?: string
  /** How several attempts in this round combine. Default: BEST_BY points ↓, time ↑. */
  attempts?: Aggregation
}

export type ExclusionPolicy = 'zero' | 'exclude'

export interface Policies {
  /** No result for a round: count as 0, ignore it, or leave the team unranked. Default "zero". */
  missing?: ExclusionPolicy | 'unranked'
  /** Default "zero". */
  disqualified?: ExclusionPolicy
  /** Did not start. Default "zero". */
  absent?: ExclusionPolicy
}

export interface RankingKey {
  source: Operand
  field: Field
  order: SortOrder
  /** Column label, e.g. "Total". */
  label?: string
}

export interface RankingConfig {
  schemaVersion: typeof SCHEMA_VERSION
  /** Decimal places of points (0–4). Default 2. */
  precision?: number
  /** Times are truncated to multiples of this many milliseconds. Default 1. */
  timeResolutionMs?: number
  rounds: RoundConfig[]
  calculations?: Calculation[]
  policies?: Policies
  ranking: {
    /** Primary key first, then tie-breakers in order (M3-13, M3-14). */
    keys: RankingKey[]
    /** When all keys are equal: shared rank (default) or ordered by team name (M3-15, M3-T10). */
    ties?: 'shared' | 'name'
  }
}

// --- Inputs ---

export type GameStatus = 'completed' | 'disqualified' | 'absent'

export interface GameInput {
  round: string
  /** 1-based attempt number within the round. Default 1. */
  attempt?: number
  status: GameStatus
  points?: number | null
  /** Run time in milliseconds. */
  timeMs?: number | null
}

export interface TeamInput {
  id: string
  name: string
  games: GameInput[]
}

// --- Outputs ---

/**
 * - ok: computed from at least one result
 * - missing / disqualified / absent: round without a valid completed result
 * - excluded: nothing left to compute (all operands excluded by policy)
 */
export type ResultStatus = 'ok' | 'missing' | 'disqualified' | 'absent' | 'excluded'

export interface ResultExplanation {
  /** Round key, calculation id, or "<round>#<attempt>" for attempts. */
  id: string
  kind: 'attempt' | 'round' | 'calculation'
  label: string
  points: number | null
  timeMs: number | null
  status: ResultStatus
  /** Ignored by aggregations (exclusion policy). */
  excluded: boolean
  /** A missing result was counted somewhere in this subtree. */
  incomplete: boolean
  /** Human-readable calculation, e.g. "BEST_BY(points ↓, time ↑) → R3". */
  formula: string
  /** BEST_BY / WORST_BY: the selected operand. */
  selected?: string
  operands?: ResultExplanation[]
}

export interface RankingEntry {
  team: string
  name: string
  /** null = unranked (no result, or incomplete with the "unranked" policy). */
  rank: number | null
  /** Shares its rank with another team. */
  shared: boolean
  /** Some round result is missing. */
  provisional: boolean
  /** Values of the ranking keys, in key order. */
  values: (number | null)[]
  /**
   * Index of the ranking key that placed this team below the previous one,
   * "name" if ordered by the tie fallback, or null (first entry, shared, unranked).
   */
  decidedBy: number | 'name' | null
  /** Explanation of every round and calculation for this team (M3-16). */
  results: Record<string, ResultExplanation>
}

export interface Issue {
  code: string
  message: string
  path: string
}

export interface Ranking {
  keys: { label: string; field: Field; order: SortOrder }[]
  entries: RankingEntry[]
  /** Problems with the input data (e.g. unknown rounds); affected games are ignored. */
  issues: Issue[]
}
