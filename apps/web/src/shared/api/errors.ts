import { ClientResponseError } from 'pocketbase'
import { t, te, type MessageKey } from '@/i18n'

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

/** Friendly message for each kind, in the current language. */
export function defaultMessage(kind: AppErrorKind): string {
  return t(`errors.kind.${kind}`)
}

/**
 * PocketBase's own top-level messages, which carry no code. Only the ones users can run into;
 * any other message is shown as sent.
 */
const CORE_MESSAGES: Record<string, MessageKey> = {
  'Failed to authenticate.': 'server.core.failed_to_authenticate',
  'Failed to validate the submitted data.': 'server.core.invalid_data',
  'Failed to create record.': 'server.core.invalid_data',
  'Failed to update record.': 'server.core.invalid_data',
  'Something went wrong while processing your request.': 'errors.kind.validation',
  'The request requires valid record authorization token.': 'errors.kind.unauthorized',
  'The authorized record is not allowed to perform this action.': 'errors.kind.forbidden',
  'Only superusers can perform this action.': 'errors.kind.forbidden',
  "The requested resource wasn't found.": 'errors.kind.not_found',
  'Missing or invalid email verification token.': 'server.core.invalid_verification_token',
  'Invalid or expired verification token.': 'server.core.invalid_verification_token',
  'Invalid or expired password reset token.': 'server.core.invalid_reset_token',
}

interface CodedError {
  code?: unknown
  message?: unknown
  params?: unknown
}

/**
 * Translates an error item `{ code, message, params }` sent by the server: by its code when the
 * code has a message — `server.fields.<field>.<code>` for codes whose meaning depends on the
 * field, else `server.<code>` (PocketBase's own `validation_*` codes included) — otherwise the
 * server's (English) message.
 */
export function translateServerError(item: CodedError, field?: string): string {
  const message = typeof item.message === 'string' ? item.message : ''
  const code = typeof item.code === 'string' ? item.code : ''
  if (!code) return message
  const params = (item.params && typeof item.params === 'object' ? item.params : {}) as Record<
    string,
    unknown
  >
  for (const key of [field ? `server.fields.${field}.${code}` : '', `server.${code}`]) {
    if (key && te(key)) return t(key, params)
  }
  return message
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

/** Server-wide error of a response, sent by the hooks as `data._error` (hooks/lib/errors.js). */
const GENERAL_ERROR = '_error'

function extractFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [field, value] of Object.entries(data)) {
    if (field === GENERAL_ERROR) continue
    if (
      value &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      result[field] = translateServerError(value, field)
    }
  }
  return result
}

function apiMessage(response: Record<string, unknown> | undefined): string {
  const data = response?.data as Record<string, CodedError> | undefined
  const general = data?.[GENERAL_ERROR]
  if (general && typeof general === 'object') return translateServerError(general)
  const message = typeof response?.message === 'string' ? response.message : ''
  const core = CORE_MESSAGES[message]
  return core ? t(core) : message
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (error instanceof ClientResponseError) {
    if (error.isAbort)
      return new AppError('cancelled', defaultMessage('cancelled'), { cause: error })
    const kind = kindForStatus(error.status)
    const fieldErrors = extractFieldErrors(error.response?.data)
    // API messages are shown (translated where known) except for network/server failures.
    const fromApi = apiMessage(error.response)
    const message =
      kind === 'network' || kind === 'server' || !fromApi ? defaultMessage(kind) : fromApi
    return new AppError(kind, message, { status: error.status, fieldErrors, cause: error })
  }

  return new AppError('unknown', defaultMessage('unknown'), { cause: error })
}
