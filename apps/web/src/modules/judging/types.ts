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

/** One row of a judge's game list (GET /api/judging/assignments). */
export interface Assignment {
  id: string
  status: GameStatus
  attempt: number
  sequence: number
  points: number
  time_ms: number
  team: NamedRef
  round: RoundRef
  category: { id: string; name: string; code: string }
  event: { id: string; name: string; status: string }
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
  updated: string
}

export interface ScoreSnapshot {
  outcome: string
  values: ScoreValues
  time_ms: number
  points: number | null
  ruleset: string
}

export interface AuditEntry {
  id: string
  action: 'submitted' | 'approved' | 'rejected' | 'corrected' | 'manual_edit'
  actor: NamedRef
  reason: string
  before: ScoreSnapshot | null
  after: ScoreSnapshot | null
  created: string
}

/** Everything the score sheet page needs (GET /api/games/{id}/sheet). */
export interface SheetPayload {
  game: {
    id: string
    status: GameStatus
    attempt: number
    sequence: number
    points: number
    time_ms: number
    updated: string
  }
  team: NamedRef & { organization: string; country: string }
  round: RoundRef & { testing_minutes: number; scoring_minutes: number }
  category: { id: string; name: string; code: string }
  event: { id: string; name: string; status: string }
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
  permissions: { canEdit: boolean; canReview: boolean; canCorrect: boolean }
}

/** The scored fields a judge edits. */
export interface SheetInput {
  outcome: Outcome
  values: ScoreValues
  time_ms: number
  /** Only used when the category has no published ruleset. */
  points: number | null
}
