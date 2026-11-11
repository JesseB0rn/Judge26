import { pb } from '@/shared/api/pocketbase'
import type { BlockColor, PlannerBlock, PlannerColumn, PlannerData, PlannerPhase } from './types'

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

/** A refused stale write (someone else changed the record since it was loaded). */
export function isConflict(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 409
}
