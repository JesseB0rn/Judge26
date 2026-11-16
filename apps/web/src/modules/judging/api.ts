import { pb } from '@/shared/api/pocketbase'
import type {
  Assignment,
  HeadJudgeTable,
  ScoreSheet,
  SheetInput,
  SheetPayload,
  TeamSignOff,
} from './types'

/**
 * Games on the tables the signed-in user judges (M5-01), or with `table` the games of one table
 * a head judge steps in at (M10-07).
 */
export function listAssignments(table?: string) {
  return pb.send<Assignment[]>('/api/judging/assignments', {
    method: 'GET',
    ...(table ? { query: { table } } : {}),
  })
}

/** Tables a head judge can step in at, with judges and progress (M10-07). */
export function listHeadJudgeTables() {
  return pb.send<HeadJudgeTable[]>('/api/judging/tables', { method: 'GET' })
}

/** All games of an event with their score status (head judges and event managers). */
export function listEventScores(eventId: string) {
  return pb.send<Assignment[]>(`/api/events/${eventId}/judging`, { method: 'GET' })
}

export function getSheet(gameId: string) {
  return pb.send<SheetPayload>(`/api/games/${gameId}/sheet`, { method: 'GET' })
}

/**
 * Autosave (M5-09). `stale` = a newer draft was already stored and is returned instead.
 * `mulligans`: the re-runs the draft knows of; a draft of a discarded run is stale (M9-04).
 */
export function saveDraft(
  gameId: string,
  input: SheetInput,
  clientSavedAt: number,
  mulligans?: number,
) {
  return pb.send<{ sheet: ScoreSheet; stale: boolean }>(`/api/games/${gameId}/sheet`, {
    method: 'PUT',
    body: { ...input, client_saved_at: clientSavedAt, mulligans },
  })
}

/** Submits the sheet with the team's sign-off (M10-06; not needed for absent teams). */
export function submitSheet(gameId: string, input: SheetInput, signOff?: TeamSignOff) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/submit`, {
    method: 'POST',
    body: { ...input, ...signOff },
  })
}

export function approveSheet(gameId: string) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/approve`, { method: 'POST' })
}

export function rejectSheet(gameId: string, reason: string) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/reject`, {
    method: 'POST',
    body: { reason },
  })
}

/** `expectedCorrections`: the correction count the edit was based on (refused with 409 if outdated). */
export function correctSheet(
  gameId: string,
  input: SheetInput,
  reason: string,
  expectedCorrections?: number,
) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/correct`, {
    method: 'POST',
    body: { ...input, reason, expected_corrections: expectedCorrections },
  })
}

/** Discards the scored run so the team can re-run (M9-A). */
export function mulliganSheet(gameId: string, reason: string) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/mulligan`, {
    method: 'POST',
    body: { reason },
  })
}

/** The program the team plans to run, recorded at the robot check (M9-B). */
export function setProgram(gameId: string, programName: string) {
  return pb.send<{ program_name: string }>(`/api/games/${gameId}/program`, {
    method: 'PUT',
    body: { program_name: programName },
  })
}
