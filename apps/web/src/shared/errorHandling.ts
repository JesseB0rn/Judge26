import type { App } from 'vue'
import { ClientResponseError } from 'pocketbase'
import { toast } from 'vue-sonner'
import { toAppError, type AppError } from '@/shared/api/errors'
import { sendClientError } from '@/shared/clientErrors'

/**
 * Shows a user-facing notification for an error and returns the normalized error. Unexpected
 * errors (not API responses) are also reported to the server (M7-13).
 */
export function reportError(error: unknown): AppError {
  const appError = toAppError(error)
  if (appError.kind === 'cancelled') return appError
  if (import.meta.env.DEV) console.error(appError.cause ?? appError)
  if (appError.kind === 'unknown' && !(appError.cause instanceof ClientResponseError)) {
    sendClientError(appError.cause ?? appError)
  }
  toast.error(appError.message)
  return appError
}

/** Routes uncaught component and promise errors through `reportError`. */
export function installErrorHandling(app: App) {
  app.config.errorHandler = (error) => {
    reportError(error)
  }
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason)
  })
  // Errors outside Vue (event handlers of third-party code, failed scripts): reported only.
  window.addEventListener('error', (event) => {
    sendClientError(event.error ?? event.message)
  })
}
