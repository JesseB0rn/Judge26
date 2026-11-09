import { describe, expect, it } from 'vitest'
import { ClientResponseError } from 'pocketbase'
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

  it('keeps the API message for client errors', () => {
    const error = toAppError(apiError(403, { message: 'Only superusers can perform this action.' }))
    expect(error.message).toBe('Only superusers can perform this action.')
    expect(error.status).toBe(403)
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
