import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { flushPromises } from '@vue/test-utils'
import { mountView } from '@/test/utils'
import * as invitations from '@/modules/administration/invitations'
import AcceptInvitationView from '../views/AcceptInvitationView.vue'

vi.mock('@/modules/administration/invitations')
const mocked = vi.mocked(invitations)

const valid = {
  status: 'invited' as const,
  name: 'Grace',
  email: 'grace@example.com',
  role: 'judge' as const,
  event: { id: 'event1', name: 'Swiss Final' },
  expires_at: '2026-11-26 10:00:00.000Z',
}

/** Types the same password into both password fields. */
async function choosePassword(value: string) {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type=password]')) {
    input.value = value
    input.dispatchEvent(new Event('input'))
  }
  await flushPromises()
}

describe('AcceptInvitationView (M8-10)', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => document.body.replaceChildren())

  const mount = (path = '/auth/invitation?token=abc') =>
    mountView(AcceptInvitationView, { session: { user: null }, path })

  it('sets the password, signs in and opens the judge dashboard', async () => {
    mocked.lookupInvitation.mockResolvedValue(valid)
    mocked.acceptInvitation.mockResolvedValue({
      email: valid.email,
      role: 'judge',
      event: 'event1',
    })
    const { wrapper, router, session } = await mount()
    const login = vi.spyOn(session, 'login').mockResolvedValue()
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid=invitation-details]').text()).toContain(
        'invited to Swiss Final as Judge',
      ),
    )
    expect(mocked.lookupInvitation).toHaveBeenCalledWith('abc')
    expect((document.querySelector('input[type=email]') as HTMLInputElement).value).toBe(
      'grace@example.com',
    )
    await choosePassword('secret-pass')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('judging'))
    expect(mocked.acceptInvitation).toHaveBeenCalledWith('abc', 'secret-pass', 'secret-pass')
    expect(login).toHaveBeenCalledWith('grace@example.com', 'secret-pass')
  })

  it('head judges land on the review page of their event', async () => {
    mocked.lookupInvitation.mockResolvedValue({ ...valid, role: 'head_judge' })
    mocked.acceptInvitation.mockResolvedValue({
      email: valid.email,
      role: 'head_judge',
      event: 'event1',
    })
    const { wrapper, router, session } = await mount()
    vi.spyOn(session, 'login').mockResolvedValue()
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    await choosePassword('secret-pass')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(router.currentRoute.value).toMatchObject({
        name: 'review',
        query: { event: 'event1' },
      }),
    )
  })

  it('M8-T06: explains expired and invalid links', async () => {
    mocked.lookupInvitation.mockResolvedValue({ status: 'expired' })
    const expired = await mount()
    await vi.waitFor(() =>
      expect(expired.wrapper.get('[data-testid=invitation-unusable]').text()).toContain(
        'Ask your event manager to send it again',
      ),
    )
    document.body.replaceChildren()

    const missing = await mount('/auth/invitation')
    expect(missing.wrapper.get('[data-testid=invitation-unusable]').text()).toContain('not valid')
    expect(mocked.lookupInvitation).toHaveBeenCalledTimes(1)
  })

  it('shows server errors such as mismatching passwords', async () => {
    mocked.lookupInvitation.mockResolvedValue(valid)
    mocked.acceptInvitation.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: {
          message: 'Failed to validate the submitted data.',
          data: { passwordConfirm: { code: 'mismatch', message: 'The passwords do not match.' } },
        },
      }),
    )
    const { wrapper } = await mount()
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('The passwords do not match.'))
  })
})
