import type { App } from 'vue'
import { toast } from 'vue-sonner'
import { toAppError, type AppError } from '@/shared/api/errors'

/** Shows a user-facing notification for an error and returns the normalized error. */
export function reportError(error: unknown): AppError {
  const appError = toAppError(error)
  if (appError.kind === 'cancelled') return appError
  if (import.meta.env.DEV) console.error(appError.cause ?? appError)
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
}
