import { pb } from '@/shared/api/pocketbase'
import type { CategoryRecord, GameRecord, TableRecord } from '@/shared/types/records'

const byEvent = (eventId: string) => pb.filter('event = {:event}', { event: eventId })

export function listTables(eventId: string) {
  return pb
    .collection<TableRecord>('tables')
    .getFullList({ filter: byEvent(eventId), sort: 'position,name', expand: 'judges' })
}

export function listEventCategories(eventId: string) {
  return pb
    .collection<CategoryRecord>('categories')
    .getFullList({ filter: byEvent(eventId), sort: 'name' })
}

/**
 * All games of the event with their round and team (for the schedule). Filters by the team's
 * event, which equals the round's event (M3-02): filtering through `round` together with the
 * games access rule made the query take seconds even on a handful of records.
 */
export function listScheduleGames(eventId: string) {
  return pb.collection<GameRecord>('games').getFullList({
    filter: pb.filter('team.event = {:event}', { event: eventId }),
    expand: 'round,team,table',
  })
}

export interface GameAssignmentInput {
  table: string
  sequence: number
}

/**
 * Stores a table and sequence assignment using optimistic concurrency.
 */
export function saveGameAssignment(game: GameRecord, data: GameAssignmentInput) {
  return pb.collection<GameRecord>('games').update(game.id, {
    ...data,
    expected_updated: game.updated,
  })
}

export interface ScheduleIssue {
  code: string
  field: string
  gameId: string
  otherGameId?: string
  message: string
}

export function listScheduleIssues(eventId: string) {
  return pb
    .send<{ issues: ScheduleIssue[] }>(`/api/events/${eventId}/schedule/validation`, {
      method: 'GET',
    })
    .then((r) => r.issues)
}

export interface GenerationPlacement {
  gameId: string
  table: string
  sequence: number
  label: string
}

export interface GenerationUnplaced {
  gameId: string
  label?: string
  reasons: string[]
}

/** Non-complete results come back as HTTP 409 with a report. */
export type GenerationOutcome =
  | {
      status: 'complete'
      placements: GenerationPlacement[]
      dry_run: boolean
      created_games?: number
    }
  | {
      status: 'infeasible'
      message: string
      placedCount: number
      unplaced: GenerationUnplaced[]
    }
  | { status: 'invalid'; message: string; issues: ScheduleIssue[] }

/**
 * The report of a non-complete generation is the body of an HTTP 409. Returns it for such an
 * error, or null for any other error (which the caller must rethrow).
 */
export function reportFromError(error: unknown): GenerationOutcome | null {
  const failure = error as { status?: number; response?: GenerationOutcome } | null
  return failure?.status === 409 && failure.response ? failure.response : null
}

export async function generateSchedule(
  eventId: string,
  dryRun: boolean,
): Promise<GenerationOutcome> {
  try {
    return await pb.send<GenerationOutcome>(`/api/events/${eventId}/schedule/generate`, {
      method: 'POST',
      body: { dry_run: dryRun },
    })
  } catch (error) {
    const report = reportFromError(error)
    if (report) return report
    throw error
  }
}
