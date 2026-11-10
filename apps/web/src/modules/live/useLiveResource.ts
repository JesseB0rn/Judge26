import { ref, shallowRef } from 'vue'
import { toAppError, type AppError } from '@/shared/api/errors'

const PREFIX = 'judge26.live.'

interface Cached<T> {
  at: number
  data: T
}

export function readCache<T>(key: string): Cached<T> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Cached<T>) : undefined
  } catch {
    return undefined
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // Storage full or disabled: the display still works, it just cannot start offline.
  }
}

function dropCache(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/**
 * Public data that is reloaded on every change (M6-01) and survives failures (M6-T09):
 *
 * - The last good response stays on screen when a reload fails (`stale` is set), so a network
 *   blip never blanks a display.
 * - Each response is cached on the device; after a reload of the page without a connection the
 *   cached data is shown, marked as stale, until the server answers.
 * - Only the newest request is applied (responses arriving out of order are dropped).
 * - A `404` means the data is no longer public: it is removed from the screen and the cache.
 */
export function useLiveResource<T>(key: () => string, fetcher: () => Promise<T>) {
  const data = shallowRef<T>()
  const error = ref<AppError | null>(null)
  const loading = ref(false)
  const stale = ref(false)
  const updatedAt = ref<Date>()
  let shownKey = ''
  let sequence = 0

  async function load() {
    const id = ++sequence
    const k = key()
    if (k !== shownKey) {
      shownKey = k
      const cached = readCache<T>(k)
      data.value = cached?.data
      updatedAt.value = cached ? new Date(cached.at) : undefined
      stale.value = !!cached
      error.value = null
    }
    loading.value = true
    try {
      const next = await fetcher()
      if (id !== sequence) return
      data.value = next
      updatedAt.value = new Date()
      stale.value = false
      error.value = null
      writeCache(k, next)
    } catch (e) {
      if (id !== sequence) return
      const appError = toAppError(e)
      error.value = appError
      if (appError.kind === 'not_found') {
        data.value = undefined
        dropCache(k)
      }
      stale.value = data.value !== undefined
    } finally {
      if (id === sequence) loading.value = false
    }
  }

  return { data, error, loading, stale, updatedAt, load }
}
