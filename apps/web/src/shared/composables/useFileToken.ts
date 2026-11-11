import { onBeforeUnmount, ref } from 'vue'
import { pb } from '@/shared/api/pocketbase'

/** PocketBase file tokens are valid for a few minutes; refresh well before that. */
const REFRESH_MS = 90_000

/**
 * A current file token for protected files (e.g. team documents), refreshed while the component
 * is mounted so download links keep working. Empty until the first token arrives.
 */
export function useFileToken() {
  const token = ref('')
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh() {
    try {
      token.value = await pb.files.getToken()
    } catch {
      // Keep the previous token; links fail visibly if it has expired.
    }
    return token.value
  }

  void refresh()
  timer = setInterval(() => void refresh(), REFRESH_MS)
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = undefined
  })
  return { token, refresh }
}
