import { describe, expect, it } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { setLocale } from '@/i18n'
import { AppError, toAppError } from '../errors'

function apiError(status: number, response: Record<string, unknown> = {}, isAbort = false) {
  return new ClientResponseError({ status, response, isAbort, url: 'http://test/api' })
}

describe('toAppError (M0-06)', () => {
  it.each([
    [0, 'network'],
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [500, 'server'],
    [503, 'server'],
    [418, 'unknown'],
  ] as const)('maps HTTP %i to %s', (status, kind) => {
    expect(toAppError(apiError(status)).kind).toBe(kind)
  })

  it('keeps an unknown API message for client errors', () => {
    const error = toAppError(apiError(403, { message: 'Only admins can assign roles.' }))
    expect(error.message).toBe('Only admins can assign roles.')
    expect(error.status).toBe(403)
  })

  it('translates PocketBase messages users run into', () => {
    const error = toAppError(apiError(400, { message: 'Failed to authenticate.' }))
    expect(error.message).toBe('The email address or password is incorrect.')
  })

  it('translates a general error by its code (data._error) and keeps it out of fields', () => {
    const error = toAppError(
      apiError(400, {
        message: 'Unknown.',
        data: { _error: { code: 'validation_required', message: 'Unknown.' } },
      }),
    )
    expect(error.message).toBe('Cannot be blank.')
    expect(error.fieldErrors).toEqual({})
  })

  it('translates codes whose meaning depends on the field', () => {
    const error = toAppError(
      apiError(400, {
        data: { ends_at: { code: 'invalid_range', message: 'The day must end after it starts.' } },
      }),
    )
    expect(error.fieldErrors.ends_at).toBe('The day must end after it starts.')
    setLocale('de')
    const german = toAppError(
      apiError(400, { data: { ends_at: { code: 'invalid_range', message: 'x' } } }),
    )
    expect(german.fieldErrors.ends_at).toBe('Der Tag muss nach seinem Beginn enden.')
    setLocale('en')
  })

  it('falls back to the server message for unknown codes', () => {
    const error = toAppError(
      apiError(400, { data: { name: { code: 'no_such_code', message: 'As sent.' } } }),
    )
    expect(error.fieldErrors).toEqual({ name: 'As sent.' })
  })

  it('translates PocketBase validation codes with their parameters', () => {
    const error = toAppError(
      apiError(400, {
        data: {
          password: {
            code: 'validation_length_out_of_range',
            message: 'The length must be between 8 and 72.',
            params: { min: 8, max: 72 },
          },
        },
      }),
    )
    expect(error.fieldErrors.password).toBe('Must be between 8 and 72 characters long.')
  })

  it('replaces server and network messages with a friendly message', () => {
    const error = toAppError(apiError(500, { message: 'sql: database is locked' }))
    expect(error.message).not.toContain('sql')
  })

  it('extracts field-level validation errors', () => {
    const error = toAppError(
      apiError(400, {
        message: 'Failed to create record.',
        data: { key: { code: 'validation_required', message: 'Cannot be blank.' } },
      }),
    )
    expect(error.fieldErrors).toEqual({ key: 'Cannot be blank.' })
  })

  it('marks aborted requests as cancelled', () => {
    expect(toAppError(apiError(0, {}, true)).kind).toBe('cancelled')
  })

  it('wraps unknown errors and keeps the cause', () => {
    const cause = new TypeError('boom')
    const error = toAppError(cause)
    expect(error.kind).toBe('unknown')
    expect(error.cause).toBe(cause)
  })

  it('returns AppError instances unchanged', () => {
    const original = new AppError('conflict', 'changed')
    expect(toAppError(original)).toBe(original)
  })
})
