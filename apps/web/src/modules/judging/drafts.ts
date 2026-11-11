import { toAppError } from '@/shared/api/errors'
import { saveDraft } from './api'
import { IDLE, type StopwatchState } from './lib'
import type { Assignment, ScoreSheet, SheetInput, SheetPayload } from './types'

/**
 * Score sheet drafts on this device (M5-09, M5-14).
 *
 * Every change is written to localStorage immediately, so a reload, a crash or a lost connection
 * never loses what the judge entered. The draft is then synchronized with the server; while that
 * fails it stays marked as unsynced and is retried when the browser is back online. The last
 * loaded sheet page is cached as well, so an open game can be reloaded while offline.
 */

export interface LocalDraft {
  gameId: string
  input: SheetInput
  stopwatch: StopwatchState
  /** Epoch ms of the judge's last change; sent as `client_saved_at`. */
  savedAt: number
  /** The server has this version. */
  synced: boolean
}

const PREFIX = 'judge26:judging:'
const draftKey = (gameId: string) => `${PREFIX}draft:${gameId}`
const pageKey = (gameId: string) => `${PREFIX}page:${gameId}`

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: the server copy still works while online.
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function readDraft(gameId: string): LocalDraft | null {
  const draft = read<LocalDraft>(draftKey(gameId))
  return draft ? { ...draft, stopwatch: draft.stopwatch ?? IDLE } : null
}

export function writeDraft(draft: LocalDraft) {
  write(draftKey(draft.gameId), draft)
}

export function removeDraft(gameId: string) {
  remove(draftKey(gameId))
}

export function cachePage(payload: SheetPayload) {
  write(pageKey(payload.game.id), payload)
}

export function cachedPage(gameId: string): SheetPayload | null {
  return read<SheetPayload>(pageKey(gameId))
}

/** The judge's game list, per user, for opening the dashboard offline. */
export function cacheAssignments(userId: string, rows: Assignment[]) {
  write(`${PREFIX}assignments:${userId}`, rows)
}

export function cachedAssignments(userId: string): Assignment[] | null {
  return read<Assignment[]>(`${PREFIX}assignments:${userId}`)
}

/** Ids of games with changes that have not reached the server yet. */
export function pendingDraftIds(): string[] {
  const ids: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(`${PREFIX}draft:`)) continue
      const draft = read<LocalDraft>(key)
      if (draft && !draft.synced) ids.push(draft.gameId)
    }
  } catch {
    // ignore
  }
  return ids
}

export type SyncResult =
  | { status: 'synced'; sheet: ScoreSheet }
  /** A newer version from another device was already stored; it is returned. */
  | { status: 'stale'; sheet: ScoreSheet }
  /** Not reachable; the draft stays on this device. */
  | { status: 'offline' }
  /**
   * The sheet was submitted or finalized meanwhile (M5-T15). The outdated local draft is
   * discarded; the server's score is kept.
   */
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string }
  | { status: 'nothing' }

const inFlight = new Map<string, Promise<SyncResult>>()

/** Sends the local draft of a game to the server. Concurrent calls for a game are merged. */
export function syncDraft(gameId: string): Promise<SyncResult> {
  const running = inFlight.get(gameId)
  if (running) return running.then(() => syncDraft(gameId))
  const promise = doSync(gameId).finally(() => inFlight.delete(gameId))
  inFlight.set(gameId, promise)
  return promise
}

async function doSync(gameId: string): Promise<SyncResult> {
  const draft = readDraft(gameId)
  if (!draft || draft.synced) return { status: 'nothing' }
  try {
    const { sheet, stale } = await saveDraft(gameId, draft.input, draft.savedAt)
    // Only mark as synced if nothing changed while the request was running.
    const latest = readDraft(gameId)
    if (latest && latest.savedAt === draft.savedAt) writeDraft({ ...latest, synced: true })
    return { status: stale ? 'stale' : 'synced', sheet }
  } catch (e) {
    const error = toAppError(e)
    if (error.kind === 'network') return { status: 'offline' }
    if (error.kind === 'conflict') {
      removeDraft(gameId)
      return { status: 'conflict', message: error.message }
    }
    return { status: 'error', message: error.message }
  }
}

/** Synchronizes every pending draft (on reconnect and when the dashboard opens). */
export async function syncPendingDrafts() {
  const results = await Promise.all(pendingDraftIds().map((id) => syncDraft(id)))
  return results
}

let installed = false

/** Retries pending drafts whenever the browser comes back online. */
export function installAutoSync() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('online', () => void syncPendingDrafts())
}

/** Robot checks (block keys) the judge finished on this device (M5-15). */
export function finishedChecks(userId: string): string[] {
  return read<string[]>(`${PREFIX}checks:${userId}`) ?? []
}

export function setCheckFinished(userId: string, key: string, finished: boolean) {
  const keys = finishedChecks(userId).filter((k) => k !== key)
  if (finished) keys.push(key)
  write(`${PREFIX}checks:${userId}`, keys)
}
