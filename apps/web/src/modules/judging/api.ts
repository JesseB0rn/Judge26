import { pb } from '@/shared/api/pocketbase'
import type { Assignment, ScoreSheet, SheetInput, SheetPayload } from './types'

/** Games on the tables the signed-in user judges (M5-01). */
export function listAssignments() {
  return pb.send<Assignment[]>('/api/judging/assignments', { method: 'GET' })
}

/** All games of an event with their score status (head judges and event managers). */
export function listEventScores(eventId: string) {
  return pb.send<Assignment[]>(`/api/events/${eventId}/judging`, { method: 'GET' })
}

export function getSheet(gameId: string) {
  return pb.send<SheetPayload>(`/api/games/${gameId}/sheet`, { method: 'GET' })
}

/** Autosave (M5-09). `stale` = a newer draft was already stored and is returned instead. */
export function saveDraft(gameId: string, input: SheetInput, clientSavedAt: number) {
  return pb.send<{ sheet: ScoreSheet; stale: boolean }>(`/api/games/${gameId}/sheet`, {
    method: 'PUT',
    body: { ...input, client_saved_at: clientSavedAt },
  })
}

export function submitSheet(gameId: string, input: SheetInput) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/submit`, {
    method: 'POST',
    body: input,
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

export function correctSheet(gameId: string, input: SheetInput, reason: string) {
  return pb.send<{ sheet: ScoreSheet }>(`/api/games/${gameId}/sheet/correct`, {
    method: 'POST',
    body: { ...input, reason },
  })
}
