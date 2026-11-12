import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, click, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import UsersView from '../views/UsersView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

describe('administration views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })
  afterEach(() => document.body.replaceChildren())

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
