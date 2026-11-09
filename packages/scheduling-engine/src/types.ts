/** Milliseconds since the Unix epoch (absolute times, so schedules can span several days). */
export type Ms = number

/** A physical table. An empty `categories` list means the table accepts every category (M4-02). */
export interface SchedTable {
  id: string
  active: boolean
  categories: string[]
}

/**
 * An availability period (M4-03) or an unavailable break (M4-04). A game must lie entirely
 * within a play period and must not overlap any break.
 */
export interface Period {
  id: string
  kind: 'play' | 'break'
  start: Ms
  end: Ms
}

/** One game of one team. `start === null` means not scheduled. */
export interface SchedGame {
  id: string
  category: string
  team: string
  judges: string[]
  durationMs: Ms
  table: string | null
  start: Ms | null
  /** Locked games are never moved by the generator (M4-12). */
  locked: boolean
}

export interface ScheduleInput {
  tables: SchedTable[]
  periods: Period[]
  games: SchedGame[]
  /** Minimum gap between two games of the same team (M4-10). 0 disables the rule. */
  minRestMs: Ms
}

export type IssueCode =
  | 'unknown_table'
  | 'table_inactive'
  | 'incompatible_category'
  | 'time_required'
  | 'outside_availability'
  | 'unavailable'
  | 'table_conflict'
  | 'team_conflict'
  | 'rest_interval'
  | 'judge_conflict'

/** The game field a user must change to resolve the issue. */
export type IssueField = 'table' | 'starts_at' | 'judges'

export interface Issue {
  code: IssueCode
  field: IssueField
  gameId: string
  /** The other game involved in a pairwise conflict. */
  otherGameId?: string
  message: string
}

export interface Placement {
  gameId: string
  table: string
  start: Ms
}

export interface Unplaced {
  gameId: string
  reasons: string[]
}

export type GenerationResult =
  | { status: 'complete'; placements: Placement[] }
  | {
      status: 'infeasible'
      /** Number of unlocked games that could be placed in the best attempt found. */
      placedCount: number
      unplaced: Unplaced[]
      message: string
    }
  | { status: 'invalid'; issues: Issue[]; message: string }
  | { status: 'limit_reached'; placedCount: number; message: string }
