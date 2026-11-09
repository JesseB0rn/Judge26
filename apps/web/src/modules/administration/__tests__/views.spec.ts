import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeEvent, makeRole, makeUser, mountView } from '@/test/utils'
import * as api from '../api'
import EventStaffTab from '../components/EventStaffTab.vue'
import UsersView from '../views/UsersView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

describe('administration views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listRoleAssignments.mockResolvedValue([
      {
        ...makeRole('judge', 'event1'),
        user: 'u2',
        expand: { user: makeUser({ id: 'u2', name: 'Jo Judge', email: 'jo@example.com' }) },
      },
    ])
  })
  afterEach(() => document.body.replaceChildren())

  it('M1-05: assigns event roles by email', async () => {
    mocked.assignRoleByEmail.mockResolvedValue(makeRole('head_judge', 'event1'))
    const { wrapper } = await mountView(EventStaffTab, { props: { event: makeEvent() } })
    expect(wrapper.get('[data-testid=event-staff]').text()).toContain('Jo Judge')
    await fill('input[type=email]', 'head@example.com')
    await wrapper.get('select').setValue('head_judge')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocked.assignRoleByEmail).toHaveBeenCalledWith(
      'head@example.com',
      'head_judge',
      'event1',
    )
  })

  it('shows an error for unknown users', async () => {
    mocked.assignRoleByEmail.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: {
          message: 'x',
          data: {
            email: { code: 'not_found', message: 'No user with this email address exists.' },
          },
        },
      }),
    )
    const { wrapper } = await mountView(EventStaffTab, { props: { event: makeEvent() } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('No user with this email address exists.')
  })

  it('removes event roles', async () => {
    mocked.removeRole.mockResolvedValue(true)
    const { wrapper } = await mountView(EventStaffTab, { props: { event: makeEvent() } })
    await click(wrapper.get('button[aria-label="Remove role"]').element as HTMLElement)
    expect(mocked.removeRole).toHaveBeenCalledWith('judge-event1')
  })

  it('lists users with roles and toggles the admin role', async () => {
    mocked.listUsers.mockResolvedValue({
      total: 1,
      items: [{ id: 'u2', name: 'Jo Judge', email: 'jo@example.com', verified: false }],
    })
    mocked.assignRole.mockResolvedValue(makeRole('admin'))
    const { wrapper } = await mountView(UsersView, { session: { roles: [makeRole('admin')] } })
    const text = wrapper.get('[data-testid=users]').text()
    expect(text).toContain('jo@example.com')
    expect(text).toContain('unverified')
    expect(text).toContain('Judge')
    await click(buttonByText('Make admin'))
    expect(mocked.assignRole).toHaveBeenCalledWith('u2', 'admin')
  })
})
