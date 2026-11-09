import { describe, expect, it } from 'vitest'
import { isRegistrationOpen, registrationSummary } from '../lib'

const now = new Date('2026-03-15T12:00:00Z')
const event = (overrides = {}) => ({
  status: 'published' as const,
  registration_opens_at: '',
  registration_closes_at: '',
  ...overrides,
})

describe('registration window', () => {
  it('is open for published events without a window', () => {
    expect(isRegistrationOpen(event(), now)).toBe(true)
    expect(registrationSummary(event(), now)).toBe('Registration open')
  })

  it('respects opening and closing times', () => {
    expect(
      isRegistrationOpen(event({ registration_opens_at: '2026-04-01 00:00:00.000Z' }), now),
    ).toBe(false)
    expect(
      registrationSummary(event({ registration_opens_at: '2026-04-01 00:00:00.000Z' }), now),
    ).toBe('Registration not yet open')
    expect(
      isRegistrationOpen(event({ registration_closes_at: '2026-03-15 12:00:00.000Z' }), now),
    ).toBe(false)
    expect(
      registrationSummary(event({ registration_closes_at: '2026-03-01 00:00:00.000Z' }), now),
    ).toBe('Registration closed')
    expect(
      isRegistrationOpen(
        event({
          registration_opens_at: '2026-03-01 00:00:00.000Z',
          registration_closes_at: '2026-04-01 00:00:00.000Z',
        }),
        now,
      ),
    ).toBe(true)
  })

  it('is closed for draft and archived events', () => {
    expect(isRegistrationOpen(event({ status: 'draft' }), now)).toBe(false)
    expect(registrationSummary(event({ status: 'draft' }), now)).toBe('Not yet published')
    expect(registrationSummary(event({ status: 'archived' }), now)).toBe('Event archived')
  })
})
