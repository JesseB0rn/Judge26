import { pb } from '@/shared/api/pocketbase'

/** Reports per page load; a crash loop must not flood the server (which also rate-limits). */
const MAX_REPORTS = 10
let sent = 0
const seen = new Set<string>()

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' }
  }
  return { message: String(error), stack: '' }
}

/**
 * Sends an unexpected frontend error to the server log (M7-13), where admins see it under
 * System health. Each distinct message is sent once per page load. Never throws.
 */
export function sendClientError(error: unknown) {
  try {
    const { message, stack } = describe(error)
    if (!message.trim() || seen.has(message) || sent >= MAX_REPORTS) return
    seen.add(message)
    sent++
    void pb
      .send('/api/app/client-errors', {
        method: 'POST',
        body: { message, stack, url: window.location.pathname + window.location.search },
        requestKey: null,
      })
      .catch(() => {})
  } catch {
    // Reporting must never cause another error.
  }
}

/** For tests. */
export function resetClientErrorReports() {
  sent = 0
  seen.clear()
}
