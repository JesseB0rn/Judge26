import type { RulesetDefinition, ScoreValues } from '@judge26/scoring-engine'
import type { GameStatus } from '@/shared/types/records'

// Payloads of the judging endpoints (apps/backend/hooks/judging.pb.js).

export type SheetStatus = 'draft' | 'submitted' | 'rejected' | 'finalized'
export type Outcome = 'completed' | 'disqualified' | 'absent'

export interface NamedRef {
  id: string
  name: string
}

export interface DayRef {
  id: string
  date: string
  label: string
}

export interface RoundRef {
  id: string
  key: string
  name: string
  position: number
  /** Start of the scoring run (HH:MM) from the schedule planner, or "". */
  starts_at?: string
}

/** A round's robot check from the schedule planner (M5-15). */
export interface RoundCheck {
  /** Null while the check is not placed in the planner. */
  day: DayRef | null
  /** HH:MM, or "" while unplaced. */
  starts_at: string
  duration_minutes: number
}

/** How a round's robot check gates scoring (M10-08, M10-09). */
export type CheckMode = 'off' | 'synchronous' | 'asynchronous'

/**
 * Why scoring is locked (M10-B): an open parts check, a synchronous round not released yet, or an
 * asynchronous round whose team is not checked yet. "" = open.
 */
export type ScoringGate = '' | 'parts_check' | 'not_released' | 'not_confirmed'

/** The robot check state of a row on the server (M10-10). */
export interface RobotCheckState {
  mode: CheckMode
  released_at: string
  /** This team's check is confirmed. */
  checked: boolean
  /** The row's table confirmed its check as complete. */
  table_ready: boolean
  /** The open parts check that gates this round, or null. */
  parts_check: { id: string; title: string } | null
}

/** The randomization file of a round (M10-17), once it is shown. */
export interface RoundFile {
  name: string
  kind: 'image' | 'pdf'
  updated: string
}

/** M10-B fields of list rows and the score sheet page; absent in data cached before M10-B. */
export interface CheckFields {
  robot_check?: RobotCheckState
  gate?: ScoringGate
  round_file?: RoundFile | null
}

/** One row of a judge's game list (GET /api/judging/assignments). */
export interface Assignment extends CheckFields {
  id: string
  status: GameStatus
  attempt: number
  sequence: number
  points: number
  time_ms: number
  /** Program the team plans to run, recorded at the robot check (M9-B). */
  program_name?: string
  team: NamedRef
  round: RoundRef
  /** The round's robot check, or null/absent if it has none (M5-15). */
  check?: RoundCheck | null
  category: { id: string; name: string; code: string }
  /** `time_decimals`: decimals of run times (M10-19). */
  event: {
    id: string
    name: string
    status: string
    time_decimals?: number
    /** Whether a team may refuse to confirm a score sheet (M10-06). */
    allow_team_refusal?: boolean
  }
  table: NamedRef | null
  day: DayRef | null
  sheet: {
    status: SheetStatus
    outcome: Outcome
    points: number
    time_ms: number
    updated: string
  } | null
}

export interface ScoreSheet {
  id: string
  status: SheetStatus
  outcome: Outcome
  ruleset: string
  values: ScoreValues
  time_ms: number
  points: number
  client_saved_at: number
  judge: NamedRef
  submitted_at: string
  submitted_by: NamedRef
  reviewed_at: string
  reviewed_by: NamedRef
  review_note: string
  corrections: number
  /** Re-runs granted by a head judge (M9-A); the last one's reason, reviewer and time. */
  mulligans: number
  mulligan_reason: string
  mulligan_at: string
  /** M10-06: when the team confirmed, or refused (with the reason). */
  team_confirmed_at?: string
  team_refused_at?: string
  team_refusal_reason?: string
  mulligan_by: NamedRef
  updated: string
}

export interface ScoreSnapshot {
  outcome: string
  values: ScoreValues
  time_ms: number
  points: number | null
  ruleset: string
  /** Sheet status of the discarded run (only on `mulligan` entries). */
  status?: string
}

export interface AuditEntry {
  id: string
  action: 'submitted' | 'approved' | 'rejected' | 'corrected' | 'manual_edit' | 'mulligan'
  actor: NamedRef
  reason: string
  before: ScoreSnapshot | null
  after: ScoreSnapshot | null
  created: string
}

/** Everything the score sheet page needs (GET /api/games/{id}/sheet). */
export interface SheetPayload extends CheckFields {
  game: {
    id: string
    status: GameStatus
    attempt: number
    sequence: number
    points: number
    time_ms: number
    /** Program the team plans to run, recorded at the robot check (M9-B). */
    program_name?: string
    updated: string
  }
  team: NamedRef & { organization: string; country: string }
  round: RoundRef & { testing_minutes: number; scoring_minutes: number }
  category: { id: string; name: string; code: string }
  /** `time_decimals`: decimals of run times (M10-19). */
  event: {
    id: string
    name: string
    status: string
    time_decimals?: number
    /** Whether a team may refuse to confirm a score sheet (M10-06). */
    allow_team_refusal?: boolean
  }
  table: NamedRef | null
  day: DayRef | null
  ruleset: {
    id: string
    version: number
    /** The game (of the round) this version belongs to; null if the category has one game. */
    game_rule?: { id: string; key: string; name: string } | null
    definition: RulesetDefinition
  } | null
  sheet: ScoreSheet | null
  history: AuditEntry[]
  permissions: {
    canEdit: boolean
    canReview: boolean
    canCorrect: boolean
    /** May grant a re-run (M9-A); absent in pages cached before M9. */
    canMulligan?: boolean
  }
}

/** The scored fields a judge edits. */
export interface SheetInput {
  outcome: Outcome
  values: ScoreValues
  time_ms: number
  /** Only used when the category has no published ruleset. */
  points: number | null
}

/** The team's sign-off of the verdict, sent with a submission (M10-06). */
export type TeamSignOff =
  { team_confirmation: 'confirmed' } | { team_confirmation: 'refused'; refusal_reason: string }

/** A table a head judge can step in at (M10-07). */
export interface HeadJudgeTable {
  id: string
  name: string
  event: { id: string; name: string }
  category: { id: string; name: string; code: string } | null
  judges: NamedRef[]
  progress: { done: number; total: number }
}

/** A team of a table's robot check, as stored on the server (M10-10). */
export interface CheckTeam {
  id: string
  name: string
  game: string
  sequence: number
  checked: boolean
  checked_at: string
  checked_by: NamedRef | null
  client_saved_at: number
  scoring_started: boolean
}

export interface RoundCheckInfo {
  id: string
  key: string
  name: string
  position: number
  check_mode: CheckMode
  released_at: string
  released_by: NamedRef | null
  release_reason: string
  category: { id: string; name: string; code: string }
}

/** The robot check of one table (GET /api/rounds/{id}/checks?table=). */
export interface TableCheckState {
  round: RoundCheckInfo
  event: { id: string; name: string; status: string }
  table: NamedRef
  parts_check: { id: string; title: string } | null
  ready: { at: string; by: NamedRef | null } | null
  teams: CheckTeam[]
  file: RoundFile | null
  can_release: boolean
}

/** A round's robot check per table, for the head judge (M10-13). */
export interface RoundProgress extends RoundCheckInfo {
  day: DayRef | null
  checks_recorded: boolean
  parts_check: { id: string; title: string } | null
  file: RoundFile | null
  tables: {
    id: string
    name: string
    checked: number
    total: number
    ready: { at: string; by: NamedRef | null } | null
  }[]
}

/** A parts check block with each table's confirmation (M10-16). */
export interface PartsCheckProgress {
  id: string
  title: string
  place: string
  day: DayRef | null
  starts_at: string
  duration_minutes: number
  categories: string[]
  blocks_first_round: boolean
  completed_at: string
  completed_by: NamedRef | null
  completion_note: string
  tables: { id: string; name: string; confirmed_at: string; confirmed_by: NamedRef | null }[]
}

/** GET /api/events/{id}/checks */
export interface EventCheckProgress {
  event: { id: string; name: string; status: string }
  can_manage: boolean
  parts_checks: PartsCheckProgress[]
  rounds: RoundProgress[]
}

/** A parts check at one of the judge's tables (GET /api/judging/parts-checks). */
export interface TablePartsCheck {
  id: string
  title: string
  place: string
  day: DayRef | null
  starts_at: string
  duration_minutes: number
  blocks_first_round: boolean
  completed_at: string
  table: NamedRef
  confirmed_at: string
  confirmed_by: NamedRef | null
}
