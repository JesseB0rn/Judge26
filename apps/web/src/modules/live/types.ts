import type { Ranking, RankingConfig } from '@judge26/ranking-engine'

// Shapes of the public API (apps/backend/hooks/lib/live.js, docs/specifications/M6-live.md).

/** Coarse state of a game; never includes results. */
export type GameState = 'upcoming' | 'scoring' | 'in_review' | 'done'

export interface PublicTeam {
  id: string
  name: string
  organization: string
  country: string
}

export interface PublicDay {
  id: string
  /** YYYY-MM-DD */
  date: string
  label: string
  /** Hours of the day (HH:MM, M4-14-01). */
  starts_at?: string
  ends_at?: string
}

export interface PublicEventInfo {
  id: string
  name: string
  season: number
  venue: string
  description: string
  status: 'published' | 'archived'
}

export interface PublicEventSummary extends PublicEventInfo {
  days: PublicDay[]
}

export interface PublicCategory {
  id: string
  name: string
  code: string
  /** The live ranking is public. */
  live: boolean
  /** The published official ranking, if any. */
  official: { id: string; title: string; created: string; published_at: string } | null
}

export interface PublicRound {
  id: string
  category: string
  key: string
  name: string
  position: number
  /** Competition day id or "". */
  day: string
}

export interface PublicGame {
  id: string
  category: string
  round: string
  team: PublicTeam
  /** Table id or "" (not placed yet). */
  table: string
  sequence: number
  attempt: number
  state: GameState
}

export interface PublicEvent {
  revision: number
  event: PublicEventInfo
  days: PublicDay[]
  categories: PublicCategory[]
  tables: { id: string; name: string }[]
  rounds: PublicRound[]
  games: PublicGame[]
  /** Timetable: round phases and public blocks (M4-14-26). */
  planner?: import('@/modules/planner/types').PlannerData
}

export interface PublishedRanking {
  config: RankingConfig
  result: Ranking
}

export interface PublicRanking {
  revision: number
  category: { id: string; name: string; code: string; event: string }
  official:
    | (PublishedRanking & {
        id: string
        title: string
        created: string
        published_at: string
        fingerprint: string
      })
    | null
  live: PublishedRanking | null
  progress: { total: number; done: number; in_review: number }
  teams: Record<string, PublicTeam>
}

export type RankingSource = 'official' | 'live'
