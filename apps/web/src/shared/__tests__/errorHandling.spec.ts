import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { ClientResponseError } from 'pocketbase'
import { toast } from 'vue-sonner'
import { installErrorHandling, reportError } from '../errorHandling'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn<(message: string) => void>() } }))

describe('error handling (M0-06)', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear())

  it('shows a toast with the normalized message', () => {
    const error = reportError(
      new ClientResponseError({ status: 403, response: { message: 'Nope.' } }),
    )
    expect(error.kind).toBe('forbidden')
    expect(toast.error).toHaveBeenCalledWith('Nope.')
  })

  it('does not notify for cancelled requests', () => {
    reportError(new ClientResponseError({ isAbort: true }))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('routes uncaught component errors through the handler', () => {
    const app = createApp({})
    installErrorHandling(app)
    app.config.errorHandler?.(new Error('boom'), null, 'test')
    expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred.')
  })
})
