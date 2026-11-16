import { pb } from '@/shared/api/pocketbase'
import type {
  BlockColor,
  PlannerBlock,
  PlannerColumn,
  PlannerData,
  PlannerDay,
  PlannerPhase,
} from './types'

// Planner API (M4-14). Writes carry the version they were based on; a stale write is refused
// with HTTP 409 (M4-14-19).

export function getPlanner(eventId: string) {
  return pb.send<PlannerData>(`/api/events/${eventId}/planner`, { method: 'GET' })
}

export interface PhaseInput {
  day?: string
  starts_at?: string
  duration_minutes?: number
}

export function updatePhase(phase: Pick<PlannerPhase, 'id' | 'updated'>, data: PhaseInput) {
  return pb
    .collection('round_phases')
    .update<PlannerPhase>(phase.id, { ...data, expected_updated: phase.updated })
}

/** Adds a robot check to a round (unplaced: it appears in the tray). */
export function addCheck(roundId: string, minutes: number, placement: PhaseInput = {}) {
  return pb.collection('round_phases').create<PlannerPhase>({
    round: roundId,
    phase: 'check',
    duration_minutes: minutes,
    ...placement,
  })
}

export function removeCheck(id: string) {
  return pb.collection('round_phases').delete(id)
}

export interface BlockInput {
  day: string
  starts_at: string
  duration_minutes: number
  title: string
  place: string
  color: BlockColor | ''
  responsibility: string
  categories: string[]
  columns: string[]
  public: boolean
  /** "parts_check" for a parts check block (M10-15), else "". */
  kind?: '' | 'parts_check'
  /** A parts check gates the day's first round until completed (M10-16). */
  blocks_first_round?: boolean
}

export function createBlock(eventId: string, data: BlockInput) {
  return pb.collection('schedule_blocks').create<PlannerBlock>({ ...data, event: eventId })
}

export function updateBlock(
  block: Pick<PlannerBlock, 'id' | 'updated'>,
  data: Partial<BlockInput>,
) {
  return pb
    .collection('schedule_blocks')
    .update<PlannerBlock>(block.id, { ...data, expected_updated: block.updated })
}

export function deleteBlock(id: string) {
  return pb.collection('schedule_blocks').delete(id)
}

/** A versioned change of one phase or block. */
export type ItemChange =
  | { kind: 'phase'; id: string; updated?: string; data: PhaseInput }
  | { kind: 'block'; id: string; updated?: string; data: Partial<BlockInput> }

/**
 * Saves several phase and block changes as one write: PocketBase's batch API runs them in one
 * transaction, so if any item changed meanwhile (409) nothing is saved (M10-24). Resolves to the
 * new `updated` of each item, in order.
 */
export async function saveChanges(changes: ItemChange[]): Promise<string[]> {
  const batch = pb.createBatch()
  for (const change of changes) {
    batch
      .collection(change.kind === 'phase' ? 'round_phases' : 'schedule_blocks')
      .update(change.id, { ...change.data, expected_updated: change.updated })
  }
  const results = await batch.send()
  return results.map((r) => String((r.body as { updated?: string } | null)?.updated ?? ''))
}

/** Changes a day's start and end time from the planner (M10-21; versioned). */
export function updateDayTimes(
  day: Pick<PlannerDay, 'id' | 'updated'>,
  data: { starts_at: string; ends_at: string },
) {
  return pb
    .collection('competition_days')
    .update<PlannerDay>(day.id, { ...data, expected_updated: day.updated })
}

// --- Custom columns (M4-14-33) ---

export interface ColumnInput {
  name: string
  position: number
  public: boolean
}

export function createColumn(eventId: string, data: ColumnInput) {
  return pb.collection('schedule_columns').create<PlannerColumn>({ ...data, event: eventId })
}

export function updateColumn(id: string, data: Partial<ColumnInput>) {
  return pb.collection('schedule_columns').update<PlannerColumn>(id, data)
}

/** Refused while blocks are placed in the column. */
export function deleteColumn(id: string) {
  return pb.collection('schedule_columns').delete(id)
}

/**
 * A refused stale write (someone else changed the record since it was loaded): a 409, or a
 * batch that failed because one of its requests got a 409.
 */
export function isConflict(error: unknown): boolean {
  const e = error as {
    status?: number
    response?: { data?: { requests?: Record<string, { response?: { status?: number } }> } }
  } | null
  if (e?.status === 409) return true
  const requests = e?.response?.data?.requests
  return !!requests && Object.values(requests).some((r) => r?.response?.status === 409)
}
