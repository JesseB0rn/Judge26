import { pb } from '@/shared/api/pocketbase'
import type {
  Assignment,
  CheckMode,
  CheckTeam,
  EventCheckProgress,
  HeadJudgeTable,
  PartsCheckProgress,
  RoundFile,
  RoundProgress,
  TableCheckState,
  TablePartsCheck,
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

// --- Robot check, parts check and round file (M10-B) ---

/** The robot check of one table, shared by every device of the table (M10-10). */
export function getTableCheck(roundId: string, tableId: string) {
  return pb.send<TableCheckState>(`/api/rounds/${roundId}/checks`, {
    method: 'GET',
    query: { table: tableId },
  })
}

/**
 * Records (or reopens) a team's check. `clientSavedAt`: when the judge made the change; an older
 * change from another device does not overwrite a newer one (`stale`).
 */
export function setTeamCheck(
  roundId: string,
  teamId: string,
  checked: boolean,
  clientSavedAt: number,
) {
  return pb.send<{ team: CheckTeam; stale: boolean }>(`/api/rounds/${roundId}/checks`, {
    method: 'PUT',
    body: { team: teamId, checked, client_saved_at: clientSavedAt },
  })
}

/** The table's check is complete (ready for the run), or not. */
export function setTableReady(roundId: string, tableId: string, ready: boolean) {
  return pb.send<TableCheckState>(`/api/rounds/${roundId}/checks/ready`, {
    method: 'POST',
    body: { table: tableId, ready },
  })
}

/** Releases a synchronous round for scoring; a reason is needed while tables are not ready. */
export function releaseRound(roundId: string, reason?: string) {
  return pb.send<RoundProgress>(`/api/rounds/${roundId}/release`, {
    method: 'POST',
    body: reason ? { reason } : {},
  })
}

export function withdrawRelease(roundId: string) {
  return pb.send<RoundProgress>(`/api/rounds/${roundId}/release`, { method: 'DELETE' })
}

export function setCheckMode(roundId: string, mode: CheckMode) {
  return pb.send<RoundProgress>(`/api/rounds/${roundId}/check-mode`, {
    method: 'PUT',
    body: { mode },
  })
}

/** Parts checks and robot checks of an event, per round and table (head judges, M10-13). */
export function getEventChecks(eventId: string) {
  return pb.send<EventCheckProgress>(`/api/events/${eventId}/checks`, { method: 'GET' })
}

/** Parts checks of the judge's tables, or of the table a head judge stepped in at. */
export function listPartsChecks(seat?: string) {
  return pb.send<TablePartsCheck[]>('/api/judging/parts-checks', {
    method: 'GET',
    ...(seat ? { query: { table: seat } } : {}),
  })
}

export function confirmPartsCheck(blockId: string, tableId: string, confirmed: boolean) {
  return pb.send<TablePartsCheck>(`/api/parts-checks/${blockId}/tables/${tableId}`, {
    method: 'POST',
    body: { confirmed },
  })
}

/** Refused (409) with tables still open unless `force`; the app asks first. */
export function completePartsCheck(blockId: string, force = false) {
  return pb.send<PartsCheckProgress>(`/api/parts-checks/${blockId}/complete`, {
    method: 'POST',
    body: { force },
  })
}

export function reopenPartsCheck(blockId: string) {
  return pb.send<PartsCheckProgress>(`/api/parts-checks/${blockId}/complete`, {
    method: 'DELETE',
  })
}

/** Uploads or replaces the round's randomization file (image or PDF, up to 10 MB). */
export function uploadRoundFile(roundId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return pb.send<{ file: RoundFile }>(`/api/rounds/${roundId}/file`, {
    method: 'POST',
    body: form,
  })
}

export function removeRoundFile(roundId: string) {
  return pb.send<{ file: null }>(`/api/rounds/${roundId}/file`, { method: 'DELETE' })
}

/**
 * The round file as a local object URL (the file needs the sign-in, which an <img> or <iframe>
 * cannot send). The caller revokes it.
 */
export async function roundFileUrl(roundId: string) {
  const res = await fetch(pb.buildURL(`/api/rounds/${roundId}/file`), {
    headers: { Authorization: pb.authStore.token },
  })
  if (!res.ok) throw new Error(`The round file could not be loaded (${res.status}).`)
  return URL.createObjectURL(await res.blob())
}
