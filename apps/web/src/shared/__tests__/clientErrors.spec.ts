import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pb } from '@/shared/api/pocketbase'
import { resetClientErrorReports, sendClientError } from '../clientErrors'

describe('client error reports (M7-13)', () => {
  const send = vi.spyOn(pb, 'send')

  beforeEach(() => {
    resetClientErrorReports()
    send.mockReset().mockResolvedValue(undefined)
  })

  it('sends the message, stack and page', () => {
    const error = new TypeError('rounds is undefined')
    sendClientError(error)
    expect(send).toHaveBeenCalledWith('/api/app/client-errors', {
      method: 'POST',
      body: { message: 'TypeError: rounds is undefined', stack: error.stack, url: '/' },
      requestKey: null,
    })
  })

  it('sends each message once and at most 10 per page load', () => {
    sendClientError(new Error('same'))
    sendClientError(new Error('same'))
    expect(send).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 20; i++) sendClientError(new Error(`error ${i}`))
    expect(send).toHaveBeenCalledTimes(10)
  })

  it('never throws, also when the report fails', async () => {
    send.mockRejectedValue(new Error('offline'))
    expect(() => sendClientError('plain string')).not.toThrow()
    await Promise.resolve()
    expect(send.mock.calls[0]![1]).toMatchObject({ body: { message: 'plain string', stack: '' } })
  })
})
