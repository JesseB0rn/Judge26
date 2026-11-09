import { pb } from '@/shared/api/pocketbase'
import type {
  CategoryRecord,
  GameRecord,
  TableRecord,
  TimeSlotKind,
  TimeSlotRecord,
} from '@/shared/types/records'

const byEvent = (eventId: string) => pb.filter('event = {:event}', { event: eventId })

export function listTables(eventId: string) {
  return pb
    .collection<TableRecord>('tables')
    .getFullList({ filter: byEvent(eventId), sort: 'position,name' })
}

export interface TableInput {
  name: string
  active: boolean
  categories: string[]
}

export function saveTable(eventId: string, id: string | undefined, data: TableInput) {
  return id
    ? pb.collection<TableRecord>('tables').update(id, data)
    : pb.collection<TableRecord>('tables').create({ ...data, event: eventId })
}

export function deleteTable(id: string) {
  return pb.collection('tables').delete(id)
}

export function listTimeSlots(eventId: string) {
  return pb
    .collection<TimeSlotRecord>('time_slots')
    .getFullList({ filter: byEvent(eventId), sort: 'starts_at' })
}

export interface TimeSlotInput {
  kind: TimeSlotKind
  label: string
  starts_at: string
  ends_at: string
}

export function saveTimeSlot(eventId: string, id: string | undefined, data: TimeSlotInput) {
  return id
    ? pb.collection<TimeSlotRecord>('time_slots').update(id, data)
    : pb.collection<TimeSlotRecord>('time_slots').create({ ...data, event: eventId })
}

export function deleteTimeSlot(id: string) {
  return pb.collection('time_slots').delete(id)
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
    expand: 'round,team',
  })
}

export interface PlacementInput {
  table: string
  starts_at: string
  judges: string[]
  locked: boolean
}

/**
 * Stores a placement. `expected_updated` is the version the editor loaded; the server refuses
 * the change if the game was edited since (M4-T12).
 */
export function savePlacement(game: GameRecord, data: PlacementInput) {
  return pb.collection<GameRecord>('games').update(game.id, {
    ...data,
    expected_updated: game.updated,
  })
}

export interface EventJudge {
  id: string
  name: string
}

export function listEventJudges(eventId: string) {
  return pb.send<EventJudge[]>(`/api/events/${eventId}/judges`, { method: 'GET' })
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
  start: number
}

export interface GenerationUnplaced {
  gameId: string
  reasons: string[]
}

/** Outcome of a generation request. Non-complete results come back as HTTP 409 with a report. */
export type GenerationOutcome =
  | { status: 'complete'; placements: GenerationPlacement[]; dry_run: boolean }
  | {
      status: 'infeasible'
      message: string
      placedCount: number
      unplaced: GenerationUnplaced[]
    }
  | { status: 'invalid'; message: string; issues: ScheduleIssue[] }
  | { status: 'limit_reached'; message: string; placedCount: number }

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
