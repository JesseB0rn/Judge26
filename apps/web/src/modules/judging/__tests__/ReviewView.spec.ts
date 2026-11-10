import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { makeEvent, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import * as eventsApi from '@/modules/events/api'
import ReviewView from '../views/ReviewView.vue'
import { makeAssignment } from './fixtures'

vi.mock('../api')
vi.mock('@/modules/events/api')
const mocked = vi.mocked(api)
const events = vi.mocked(eventsApi)

const submitted = {
  status: 'submitted' as const,
  outcome: 'completed' as const,
  points: 40,
  time_ms: 95_370,
  updated: '',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listEventScores.mockResolvedValue([
    makeAssignment({ id: 's1', team: { id: 'd', name: 'Delta' }, sheet: submitted }),
    makeAssignment({ id: 's2', team: { id: 'e', name: 'Echo' } }),
  ])
})
afterEach(() => document.body.replaceChildren())

const games = (w: Awaited<ReturnType<typeof mountView>>['wrapper']) =>
  w.findAll('[data-game]').map((el) => el.attributes('data-game'))

describe('ReviewView', () => {
  it('M5-11: head judges see the sheets waiting for review of their event', async () => {
    const { wrapper } = await mountView(ReviewView, {
      session: { roles: [makeRole('head_judge', 'event1')] },
    })
    expect(mocked.listEventScores).toHaveBeenCalledWith('event1')
    const queue = wrapper.get('[data-testid=review-queue]')
    expect(games(wrapper)).toEqual(['s1'])
    expect(queue.text()).toContain('Waiting for review (1)')
  })

  it('keeps its filters in the URL and links sheets back to it', async () => {
    const { wrapper, router } = await mountView(ReviewView, {
      session: { roles: [makeRole('head_judge', 'event1')] },
      path: '/?state=open',
    })
    expect(games(wrapper)).toEqual(['s2'])
    const href = wrapper.get('[data-game=s2]').attributes('href')!
    expect(decodeURIComponent(href)).toContain('from=/?state=open')
    expect(router.currentRoute.value.query.state).toBe('open')
  })

  it('admins review every running event', async () => {
    events.listEvents.mockResolvedValue([
      makeEvent({ id: 'e2', name: 'Regional' }),
      makeEvent({ id: 'old', name: 'Last year', status: 'archived' }),
    ])
    const { wrapper } = await mountView(ReviewView, { session: { roles: [makeRole('admin')] } })
    await flushPromises()
    expect(mocked.listEventScores).toHaveBeenCalledWith('e2')
    expect(wrapper.text()).not.toContain('Last year')
  })

  it('explains when there is nothing to review', async () => {
    const { wrapper } = await mountView(ReviewView, {
      session: { roles: [makeRole('judge', 'e')] },
    })
    expect(wrapper.find('[data-testid=no-review-events]').exists()).toBe(true)
  })
})
