import { ClientResponseError } from 'pocketbase'

export type AppErrorKind =
  | 'network'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'server'
  | 'cancelled'
  | 'unknown'

/**
 * Normalized error used throughout the frontend. API and runtime errors are
 * converted with `toAppError` so components only deal with one shape.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly status: number
  /** Field-level validation messages keyed by field name. */
  readonly fieldErrors: Record<string, string>
  readonly cause: unknown

  constructor(
    kind: AppErrorKind,
    message: string,
    options: { status?: number; fieldErrors?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.kind = kind
    this.status = options.status ?? 0
    this.fieldErrors = options.fieldErrors ?? {}
    this.cause = options.cause
  }
}

const defaultMessages: Record<AppErrorKind, string> = {
  network: 'The server could not be reached. Check your connection and try again.',
  validation: 'Some values are invalid.',
  unauthorized: 'Please sign in to continue.',
  forbidden: 'You do not have permission to perform this action.',
  not_found: 'The requested resource was not found.',
  conflict: 'The data was changed by someone else. Reload and try again.',
  server: 'The server encountered an error. Please try again later.',
  cancelled: 'The request was cancelled.',
  unknown: 'An unexpected error occurred.',
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 0) return 'network'
  if (status === 400) return 'validation'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status >= 500) return 'server'
  return 'unknown'
}

function extractFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [field, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      result[field] = value.message
    }
  }
  return result
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (error instanceof ClientResponseError) {
    if (error.isAbort) return new AppError('cancelled', defaultMessages.cancelled, { cause: error })
    const kind = kindForStatus(error.status)
    const fieldErrors = extractFieldErrors(error.response?.data)
    // PocketBase's generic messages are fine to show except for network/server failures.
    const apiMessage = typeof error.response?.message === 'string' ? error.response.message : ''
    const message =
      kind === 'network' || kind === 'server' || !apiMessage ? defaultMessages[kind] : apiMessage
    return new AppError(kind, message, { status: error.status, fieldErrors, cause: error })
  }

  return new AppError('unknown', defaultMessages.unknown, { cause: error })
}
