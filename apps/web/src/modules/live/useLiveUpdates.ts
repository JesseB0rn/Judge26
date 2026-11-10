import { onScopeDispose, readonly, ref, watch } from 'vue'
import { getRevision, subscribeRevision } from './api'

/**
 * - `live`: realtime connection established
 * - `polling`: realtime unavailable, checking for changes periodically
 * - `offline`: the server cannot be reached; the last data stays on screen
 */
export type LiveStatus = 'connecting' | 'live' | 'polling' | 'offline'

export const POLL_MS = 20_000

/**
 * Calls `reload` whenever the public data of the event changes (M6-01).
 *
 * The server increases a per-event revision on every committed change. This subscribes to it
 * (realtime) and additionally polls the tiny revision record, which covers missed realtime
 * messages, sleeping tablets and proxies that break server-sent events. Reloads never overlap:
 * a change during a reload causes exactly one more reload afterwards.
 *
 * `shownRevision` is the revision of the data on screen (from the last response), so a change
 * that happened between loading the data and subscribing is not missed.
 */
export function useLiveUpdates(
  eventId: () => string | undefined,
  reload: () => Promise<unknown> | unknown,
  options: { shownRevision?: () => number | undefined; pollMs?: number } = {},
) {
  const status = ref<LiveStatus>('connecting')
  const lastChecked = ref<Date>()
  let known: number | undefined
  let subscribed = false
  let running = false
  let again = false
  let unsubscribe: (() => Promise<void>) | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let generation = 0

  async function runReload() {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        await reload()
      } while (again)
    } finally {
      running = false
    }
  }

  function seen(revision: number) {
    const shown = options.shownRevision?.()
    const previous = known
    known = revision
    if (shown !== undefined ? revision > shown : previous !== undefined && revision !== previous) {
      void runReload()
    }
  }

  async function poll() {
    const id = eventId()
    if (!id) return
    const gen = generation
    try {
      const revision = await getRevision(id)
      if (gen !== generation) return
      lastChecked.value = new Date()
      if (status.value === 'offline' || status.value === 'connecting') {
        status.value = subscribed ? 'live' : 'polling'
      }
      seen(revision)
    } catch {
      if (gen === generation) status.value = 'offline'
    }
  }

  async function stop() {
    generation++
    if (timer) clearInterval(timer)
    timer = undefined
    subscribed = false
    const off = unsubscribe
    unsubscribe = undefined
    known = undefined
    if (off) await off().catch(() => undefined)
  }

  async function start(id: string | undefined) {
    await stop()
    if (!id) return
    const gen = generation
    status.value = 'connecting'
    timer = setInterval(poll, options.pollMs ?? POLL_MS)
    try {
      const off = await subscribeRevision(id, (revision) => {
        if (gen !== generation) return
        lastChecked.value = new Date()
        status.value = 'live'
        seen(revision)
      })
      if (gen !== generation) {
        await off().catch(() => undefined)
        return
      }
      unsubscribe = off
      subscribed = true
      status.value = 'live'
    } catch {
      if (gen === generation) status.value = 'polling'
    }
    await poll()
  }

  const onOnline = () => void poll()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void poll()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  watch(eventId, (id) => void start(id), { immediate: true })

  onScopeDispose(() => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    void stop()
  })

  return { status: readonly(status), lastChecked: readonly(lastChecked), check: poll }
}
