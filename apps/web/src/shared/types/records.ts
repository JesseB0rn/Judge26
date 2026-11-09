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
  source: string
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
  coach: string
  coach_name: string
  coach_email: string
  members: TeamMember[] | null
  status: TeamStatus
  review_note: string
  submitted_at: string
  reviewed_at: string
  reviewed_by: string
  expand?: { event?: EventRecord; category?: CategoryRecord }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  event_manager: 'Event manager',
  head_judge: 'Head judge',
  judge: 'Judge',
}

export type RulesetStatus = 'draft' | 'published'

export interface RulesetRecord extends BaseRecord {
  category: string
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
