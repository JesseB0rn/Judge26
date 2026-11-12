import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, mountView } from '@/test/utils'
import { mailDocument } from '../devMailbox'
import DevMailboxView from '../views/DevMailboxView.vue'

describe('dev mailbox (M8-11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          {
            to: ['a@example.com'],
            subject: 'First',
            html: '<p>One</p>',
            sentAt: '2026-11-12T10:00:00.000Z',
          },
          {
            to: ['b@example.com'],
            subject: 'You are invited',
            html: '<a href="http://app/auth/invitation?token=x">Accept</a>',
            sentAt: '2026-11-12T11:00:00.000Z',
          },
        ]),
      ),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('lists captured emails newest first and shows the selected one', async () => {
    const { wrapper } = await mountView(DevMailboxView, { session: { roles: [] } })
    await vi.waitFor(() =>
      expect(wrapper.findAll('[data-testid=mailbox-list] button')).toHaveLength(2),
    )
    const subjects = wrapper.findAll('[data-testid=mailbox-list] button').map((b) => b.text())
    expect(subjects[0]).toContain('You are invited')
    const frame = wrapper.get('[data-testid=mailbox-body]')
    expect(frame.attributes('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox')
    expect(frame.attributes('srcdoc')).toContain('href="http://app/auth/invitation?token=x"')

    await click(wrapper.findAll('[data-testid=mailbox-list] button')[1]!.element as HTMLElement)
    expect(wrapper.get('[data-testid=mailbox-message]').text()).toContain('First')
  })

  it('M8-T07: production builds have no mailbox route', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_ENV', 'production')
    const production = await import('../routes')
    expect(production.communicationRoutes.map((r) => r.name)).not.toContain('dev-mailbox')
    vi.resetModules()
    vi.stubEnv('VITE_APP_ENV', 'test')
    const test = await import('../routes')
    expect(test.communicationRoutes.map((r) => r.name)).toContain('dev-mailbox')
    vi.unstubAllEnvs()
  })

  it('links in an email open in a new tab', () => {
    expect(mailDocument('<a href="x">x</a>')).toContain('<base target="_blank">')
  })
})
