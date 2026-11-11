import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  compileRuleset,
  evaluate,
  type CompiledRuleset,
  type ScoreValues,
} from '@judge26/scoring-engine'
import { AppError, toAppError } from '@/shared/api/errors'
import * as api from './api'
import {
  cachePage,
  cachedPage,
  readDraft,
  removeDraft,
  syncDraft,
  writeDraft,
  type LocalDraft,
} from './drafts'
import * as sw from './lib'
import type { Outcome, SheetInput, SheetPayload } from './types'

/** Where the judge's latest change is. */
export type SaveState =
  /** Nothing to save (read-only, or unchanged). */
  | 'idle'
  | 'saving'
  /** The server has the latest change. */
  | 'saved'
  /** Stored on this device only; synchronized when the connection is back. */
  | 'offline'
  | 'error'

const AUTOSAVE_MS = 700
const RETRY_MS = 10_000

function emptyInput(): SheetInput {
  return { outcome: 'completed', values: {}, time_ms: 0, points: null }
}

/**
 * State of the score sheet page: loads the game (from the server or, offline, from the cache),
 * restores the local draft, evaluates the score live (M5-06) and autosaves (M5-09, M5-14).
 */
export function useScoreSheet(gameId: string, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now
  const payload = shallowRef<SheetPayload | null>(null)
  const loading = ref(true)
  const loadError = ref<AppError | null>(null)
  /** Page shown from the device cache because the server was unreachable. */
  const fromCache = ref(false)
  /** Message after an outdated local draft was discarded (M5-T15). */
  const notice = ref('')

  const input = ref<SheetInput>(emptyInput())
  const stopwatch = ref<sw.StopwatchState>(sw.IDLE)
  const saveState = ref<SaveState>('idle')
  const saveError = ref('')
  /** A correction is being entered by a reviewer. */
  const correcting = ref(false)

  let savedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let retry: ReturnType<typeof setInterval> | undefined

  const ruleset = computed<CompiledRuleset | null>(() => {
    const definition = payload.value?.ruleset?.definition
    if (!definition) return null
    try {
      return compileRuleset(definition)
    } catch {
      return null
    }
  })

  const status = computed(() => payload.value?.sheet?.status ?? null)
  const editable = computed(() => !!payload.value?.permissions.canEdit || correcting.value)

  /** Live result for display (draft mode: no "required" noise while scoring). */
  const result = computed(() =>
    ruleset.value ? evaluate(ruleset.value, input.value.values, { mode: 'draft' }) : null,
  )
  /** What the server will check on submission (M5-T09). */
  const finalResult = computed(() =>
    ruleset.value ? evaluate(ruleset.value, input.value.values, { mode: 'final' }) : null,
  )

  const total = computed<number | null>(() => {
    if (input.value.outcome !== 'completed') return null
    if (ruleset.value) return result.value?.total ?? 0
    return input.value.points
  })

  /** Criteria still missing or invalid, in sheet order. */
  const problems = computed(() => {
    if (input.value.outcome !== 'completed') return []
    if (!ruleset.value) {
      return input.value.points === null
        ? [{ nodeId: 'points', message: 'Enter the points.', code: 'required' }]
        : []
    }
    const order = [...ruleset.value.nodes.keys()]
    return [...(finalResult.value?.issues ?? [])]
      .filter((i) => i.nodeId)
      .sort((a, b) => order.indexOf(a.nodeId!) - order.indexOf(b.nodeId!))
  })
  const complete = computed(() => problems.value.length === 0)

  function fromServer(p: SheetPayload) {
    const sheet = p.sheet
    if (sheet) {
      return {
        outcome: sheet.outcome,
        values: sheet.values ?? {},
        time_ms: sheet.time_ms,
        points: p.ruleset ? null : sheet.points,
      } satisfies SheetInput
    }
    if (p.game.status !== 'scheduled') {
      // Result recorded directly (M3 result form): start from it.
      return {
        outcome: p.game.status as Outcome,
        values: {},
        time_ms: p.game.time_ms,
        points: p.ruleset ? null : p.game.points,
      } satisfies SheetInput
    }
    return emptyInput()
  }

  function apply(p: SheetPayload) {
    payload.value = p
    correcting.value = false
    const local = readDraft(gameId)
    const serverSavedAt = p.sheet?.client_saved_at ?? 0
    if (local && p.permissions.canEdit && local.savedAt >= serverSavedAt) {
      // The device has the same or a newer version (e.g. entered offline): keep it.
      input.value = local.input
      stopwatch.value = local.stopwatch
      savedAt = local.savedAt
      saveState.value = local.synced ? 'saved' : 'offline'
      if (!local.synced) void sync()
      return
    }
    if (local && !p.permissions.canEdit && !local.synced) {
      notice.value =
        p.sheet?.status === 'finalized'
          ? 'This score was finalized meanwhile. The changes stored on this device were not applied.'
          : 'This score was submitted meanwhile. The changes stored on this device were not applied.'
    }
    removeDraft(gameId)
    input.value = fromServer(p)
    stopwatch.value = local && p.permissions.canEdit ? local.stopwatch : sw.IDLE
    savedAt = serverSavedAt
    saveState.value = p.sheet ? 'saved' : 'idle'
  }

  async function load() {
    loading.value = true
    loadError.value = null
    try {
      const p = await api.getSheet(gameId)
      cachePage(p)
      fromCache.value = false
      apply(p)
    } catch (e) {
      const error = toAppError(e)
      const cached = error.kind === 'network' ? cachedPage(gameId) : null
      if (cached) {
        // Offline (M5-T13): show the cached page with the local draft.
        fromCache.value = true
        apply(cached)
        if (readDraft(gameId)?.synced === false) saveState.value = 'offline'
      } else {
        loadError.value = error
      }
    } finally {
      loading.value = false
    }
  }

  function persist() {
    if (!payload.value?.permissions.canEdit) return
    savedAt = Math.max(now(), savedAt + 1)
    const draft: LocalDraft = {
      gameId,
      input: input.value,
      stopwatch: stopwatch.value,
      savedAt,
      synced: false,
    }
    writeDraft(draft)
    saveState.value = 'saving'
    clearTimeout(timer)
    timer = setTimeout(() => void sync(), AUTOSAVE_MS)
  }

  /** Stopwatch changes are kept on the device only; they are not part of the score. */
  function persistStopwatch() {
    const local = readDraft(gameId)
    if (local) writeDraft({ ...local, stopwatch: stopwatch.value })
    else if (payload.value?.permissions.canEdit) {
      writeDraft({ gameId, input: input.value, stopwatch: stopwatch.value, savedAt, synced: true })
    }
  }

  async function sync() {
    clearTimeout(timer)
    const outcome = await syncDraft(gameId)
    switch (outcome.status) {
      case 'synced':
      case 'nothing':
        if (readDraft(gameId)?.synced !== false) saveState.value = 'saved'
        saveError.value = ''
        stopRetry()
        if (outcome.status === 'synced' && payload.value) {
          payload.value = { ...payload.value, sheet: outcome.sheet }
          cachePage(payload.value)
        }
        break
      case 'stale':
        // Another device stored a newer draft: reload it.
        removeDraft(gameId)
        await load()
        break
      case 'offline':
        saveState.value = 'offline'
        startRetry()
        break
      case 'conflict':
        notice.value = `${outcome.message} The changes stored on this device were not applied.`
        await load()
        break
      case 'error':
        saveState.value = 'error'
        saveError.value = outcome.message
        startRetry()
        break
    }
  }

  function startRetry() {
    retry ??= setInterval(() => void sync(), RETRY_MS)
  }
  function stopRetry() {
    clearInterval(retry)
    retry = undefined
  }

  const onOnline = () => {
    if (readDraft(gameId)?.synced === false) void sync()
    else if (fromCache.value) void load()
  }
  window.addEventListener('online', onOnline)

  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline)
    stopRetry()
    // Do not lose a change made just before leaving the page.
    if (timer) {
      clearTimeout(timer)
      void syncDraft(gameId)
    }
  })

  // --- Editing -------------------------------------------------------------

  function setValues(values: ScoreValues) {
    if (!editable.value) return
    input.value = { ...input.value, values }
    if (!correcting.value) persist()
  }

  function setOutcome(outcome: Outcome) {
    if (!editable.value || outcome === input.value.outcome) return
    input.value = { ...input.value, outcome }
    if (!correcting.value) persist()
  }

  function setTime(timeMs: number) {
    if (!editable.value) return
    input.value = { ...input.value, time_ms: Math.max(0, Math.round(timeMs)) }
    if (!correcting.value) persist()
  }

  function setPoints(points: number | null) {
    if (!editable.value) return
    input.value = { ...input.value, points }
    if (!correcting.value) persist()
  }

  const watchPhase = computed(() => sw.phase(stopwatch.value))

  function startWatch() {
    stopwatch.value = sw.start(stopwatch.value, now())
    persistStopwatch()
  }
  function pauseWatch() {
    stopwatch.value = sw.pause(stopwatch.value, now())
    persistStopwatch()
  }
  /** Stops the stopwatch and records its time (M5-T06). */
  function stopWatch() {
    const { timeMs, state } = sw.stop(stopwatch.value, now())
    stopwatch.value = state
    setTime(timeMs)
    persistStopwatch()
  }
  function resetWatch() {
    stopwatch.value = sw.IDLE
    persistStopwatch()
  }

  // --- Workflow ------------------------------------------------------------

  const busy = ref(false)
  const actionError = ref<AppError | null>(null)

  async function run(action: () => Promise<unknown>) {
    busy.value = true
    actionError.value = null
    try {
      await action()
      return true
    } catch (e) {
      const error = toAppError(e)
      // Show the specific reason (e.g. which criteria are missing) instead of a generic message.
      const detail = Object.values(error.fieldErrors)[0]
      actionError.value = detail
        ? new AppError(error.kind, detail, {
            status: error.status,
            fieldErrors: error.fieldErrors,
            cause: e,
          })
        : error
      if (error.kind === 'conflict') await load()
      return false
    } finally {
      busy.value = false
    }
  }

  const submit = () =>
    run(async () => {
      clearTimeout(timer)
      await api.submitSheet(gameId, input.value)
      removeDraft(gameId)
      await load()
    })

  const approve = () => run(async () => (await api.approveSheet(gameId), await load()))

  const reject = (reason: string) =>
    run(async () => (await api.rejectSheet(gameId, reason), await load()))

  function startCorrection() {
    if (payload.value?.permissions.canCorrect) correcting.value = true
  }

  function cancelCorrection() {
    if (payload.value) apply(payload.value)
  }

  const correct = (reason: string) =>
    run(
      async () => (
        await api.correctSheet(gameId, input.value, reason, payload.value?.sheet?.corrections),
        await load()
      ),
    )

  // Keep the stopwatch display ticking.
  const tick = ref(now())
  let frame: ReturnType<typeof setInterval> | undefined
  watch(
    watchPhase,
    (p) => {
      clearInterval(frame)
      frame = p === 'running' ? setInterval(() => (tick.value = now()), 47) : undefined
      tick.value = now()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearInterval(frame))
  const watchElapsed = computed(() => sw.elapsed(stopwatch.value, tick.value))

  return {
    payload,
    loading,
    loadError,
    fromCache,
    notice,
    ruleset,
    status,
    editable,
    correcting,
    input,
    result,
    total,
    problems,
    complete,
    saveState,
    saveError,
    busy,
    actionError,
    watchPhase,
    watchElapsed,
    load,
    sync,
    setValues,
    setOutcome,
    setTime,
    setPoints,
    startWatch,
    pauseWatch,
    stopWatch,
    resetWatch,
    submit,
    approve,
    reject,
    startCorrection,
    cancelCorrection,
    correct,
  }
}

export type ScoreSheetState = ReturnType<typeof useScoreSheet>
