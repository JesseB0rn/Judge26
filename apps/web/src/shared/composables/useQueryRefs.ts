import { reactive, toRefs, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * View state (tabs, filters) mirrored into the URL query. A refresh, the browser's back button
 * or a shared link lands on the same panel instead of the default one. Values equal to their
 * default are left out of the URL; query keys not managed here are kept.
 */
export function useQueryRefs<T extends Record<string, string>>(defaults: T) {
  const route = useRoute()
  const router = useRouter()
  const initial = {} as Record<string, string>
  for (const key of Object.keys(defaults)) {
    const value = route.query[key]
    initial[key] = typeof value === 'string' ? value : defaults[key]!
  }
  const state = reactive(initial) as T

  watch(
    () => ({ ...state }),
    (current) => {
      const query = { ...route.query }
      for (const key of Object.keys(defaults)) {
        if (current[key] === defaults[key]) delete query[key]
        else query[key] = current[key]!
      }
      void router.replace({ query })
    },
  )

  return toRefs(state)
}

/** Paths a score sheet may link back to (see `backTarget`). */
const BACK_PREFIXES = ['/judging', '/review', '/events/']

/** A safe in-app return path from a `from` query value, or undefined. */
export function backTarget(from: unknown): string | undefined {
  if (typeof from !== 'string' || from.startsWith('//')) return undefined
  return BACK_PREFIXES.some((p) => from.startsWith(p)) ? from : undefined
}
