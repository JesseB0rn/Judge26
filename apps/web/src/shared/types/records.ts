import { t, translatedLabels } from '@/i18n'
// Record shapes of the PocketBase collections (see apps/backend/migrations).

export interface BaseRecord {
  id: string
  collectionId: string
  collectionName: string
  created: string
  updated: string
}

export type Role = 'admin' | 'event_manager' | 'head_judge' | 'judge'
export type EventStatus = 'draft' | 'published' | 'archived'
export type TeamStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn'

export interface UserRecord extends BaseRecord {
  email: string
  name: string
  verified: boolean
  avatar: string
  /** UI and email language (en, de, fr, it); empty until the user has used the app. */
  language?: string
}

export interface EventRecord extends BaseRecord {
  name: string
  season: number
  venue: string
  description: string
  status: EventStatus
  /** PocketBase datetime string ("YYYY-MM-DD HH:mm:ss.SSSZ") or "". */
  registration_opens_at: string
  registration_closes_at: string
}

export interface RoleAssignmentRecord extends BaseRecord {
  user: string
  role: Role
  /** Empty for global roles (admin). */
  event: string
  expand?: { user?: UserRecord; event?: EventRecord }
}

export interface CompetitionDayRecord extends BaseRecord {
  event: string
  /** YYYY-MM-DD */
  date: string
  label: string
  /** Planner hours (HH:MM); empty = 08:00 / 18:00 (M4-14-01). */
  starts_at?: string
  ends_at?: string
}

export interface CategoryRecord extends BaseRecord {
  /** Empty for templates in the category library. */
  event: string
  name: string
  code: string
  description: string
  min_age: number
  max_age: number
  min_team_size: number
  max_team_size: number
  max_teams: number
  settings: unknown
  /** Ranking configuration (see @judge26/ranking-engine). */
  ranking: unknown
  source: string
  /** M6-10: the public sees the live (provisional) ranking. */
  public_live?: boolean
  /** M6-10: id of the ranking snapshot published as the official ranking, or "". */
  published_snapshot?: string
  /** Set by the server when the official ranking is published. */
  results_published_at?: string
  results_published_by?: string
  expand?: { event?: EventRecord }
}

export interface TeamMember {
  first_name: string
  last_name: string
  birth_year: number
}

export interface TeamRecord extends BaseRecord {
  event: string
  category: string
  name: string
  organization: string
  country: string
  /** Unused since M8-A (teams have no owner); kept so older records stay valid. */
  coach: string
  /** The team's optional contact (shown as "Contact"); gets schedule emails when set. */
  coach_name: string
  coach_email: string
  members: TeamMember[] | null
  /** Active (`approved`) or `withdrawn`; the others only occur on teams registered before M8-A. */
  status: TeamStatus
  review_note: string
  submitted_at: string
  reviewed_at: string
  reviewed_by: string
  expand?: { event?: EventRecord; category?: CategoryRecord }
}

/** A file attached to a team by an event manager (M1-13). The file is protected. */
export interface TeamDocumentRecord extends BaseRecord {
  team: string
  title: string
  /** Stored file name; download it with a file token (see teams/documents.ts). */
  file: string
  uploaded_by: string
}

export const ROLE_LABELS = translatedLabels<Role>(
  ['admin', 'event_manager', 'head_judge', 'judge'],
  (role) => t(`common.roles.${role}`),
)

export type RulesetStatus = 'draft' | 'published'

/** One game of a category with its own versioned ruleset; rounds choose one. */
export interface GameRuleRecord extends BaseRecord {
  category: string
  key: string
  name: string
  description: string
  position: number
}

export interface RulesetRecord extends BaseRecord {
  category: string
  /** The game rule this version belongs to; versions are numbered per game rule. */
  game_rule?: string
  version: number
  status: RulesetStatus
  /** Ruleset definition (see @judge26/scoring-engine). Drafts may be invalid. */
  definition: unknown
  notes: string
  fingerprint: string
  published_at: string
  published_by: string
  source: string
}

export interface RoundRecord extends BaseRecord {
  category: string
  key: string
  name: string
  position: number
  /** Shared maintenance/testing phase duration, in minutes. */
  testing_minutes: number
  /** Shared scoring phase duration, in minutes. */
  scoring_minutes: number
  /** Competition day on which the round is played, or "". */
  day?: string
  /** Game rule the round is scored with, or "" (then the category's only game rule). */
  game_rule?: string
}

export type GameStatus = 'scheduled' | 'completed' | 'disqualified' | 'absent'

export interface GameRecord extends BaseRecord {
  round: string
  team: string
  attempt: number
  status: GameStatus
  /** Derived from `values` when `ruleset` is set. */
  points: number
  /** 0 = no time recorded. */
  time_ms: number
  ruleset: string
  values: Record<string, unknown> | null
  notes: string
  /** Schedule: assigned table id or "". */
  table: string
  /** Position in the per-round sequence at the assigned table; 0 means unassigned. */
  sequence: number
  expand?: { round?: RoundRecord; team?: TeamRecord; table?: TableRecord }
}

export interface TableRecord extends BaseRecord {
  event: string
  name: string
  position: number
  active: boolean
  /** Empty = accepts every category of the event. */
  categories: string[]
  /** Fixed judge assigned to this table. */
  judge: string
  expand?: { judge?: UserRecord }
}

export interface RankingSnapshotRecord extends BaseRecord {
  category: string
  title: string
  config: unknown
  config_fingerprint: string
  inputs: unknown
  result: import('@judge26/ranking-engine').Ranking
  fingerprint: string
  created_by: string
}

/** Configurable email of a notification (M7-02). Keys are fixed by the server. */
/** One notification in one language (M7-02); each key exists once per language. */
export interface MailTemplateRecord extends BaseRecord {
  key: string
  /** en, de, fr or it: the recipient's language picks the template. */
  language: string
  name: string
  enabled: boolean
  subject: string
  body: string
}

export type MailStatus = 'pending' | 'sent' | 'failed'

/** A queued notification and its delivery state (M7-01). Read-only. */
export interface MailOutboxRecord extends BaseRecord {
  template: string
  to: string
  subject: string
  html: string
  status: MailStatus
  attempts: number
  next_attempt_at: string
  last_error: string
  sent_at: string
  immediate: boolean
  event: string
  team: string
  expand?: { team?: TeamRecord }
}

/** An administrative action (M7-08). Written by the server only. */
export interface AuditLogRecord extends BaseRecord {
  actor: string
  actor_label: string
  action: string
  collection: string
  record: string
  event: string
  summary: string
  changes: Record<string, unknown> | null
  ip: string
}
