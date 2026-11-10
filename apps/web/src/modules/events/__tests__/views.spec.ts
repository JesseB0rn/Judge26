import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { buttonByText, click, fill, makeEvent, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import EventListView from '../views/EventListView.vue'
import EventDetailView from '../views/EventDetailView.vue'
import CompetitionDays from '../components/CompetitionDays.vue'

vi.mock('../api')
vi.mock('@/modules/categories/api')
vi.mock('@/modules/teams/api')
vi.mock('@/modules/administration/api')

const mocked = vi.mocked(api)

describe('event views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listEvents.mockResolvedValue([
      makeEvent(),
      makeEvent({ id: 'e2', name: 'Draft Cup', status: 'draft' }),
    ])
    mocked.getEvent.mockResolvedValue(makeEvent())
    mocked.listDays.mockResolvedValue([])
  })
  afterEach(() => document.body.replaceChildren())

  it('lists events with status and registration state', async () => {
    const { wrapper } = await mountView(EventListView)
    const text = wrapper.get('[data-testid=event-list]').text()
    expect(text).toContain('WRO Final')
    expect(text).toContain('Registration open')
    expect(text).toContain('Draft Cup')
    expect(text).toContain('Not yet published')
  })

  it('only admins can create events (M1-06)', async () => {
    const coach = await mountView(EventListView)
    expect(coach.wrapper.text()).not.toContain('New event')
    coach.wrapper.unmount()

    mocked.createEvent.mockResolvedValue(makeEvent({ id: 'new' }))
    const { router } = await mountView(EventListView, { session: { roles: [makeRole('admin')] } })
    await click(buttonByText('New event'))
    await fill('[role=dialog] input[required]', 'Swiss Final')
    await click(buttonByText('Save'))
    expect(mocked.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Swiss Final',
        status: 'draft',
        season: new Date().getFullYear(),
      }),
    )
    expect(router.currentRoute.value.name).toBe('event')
  })

  it('shows management actions to event managers and archives events (M1-06)', async () => {
    mocked.updateEvent.mockResolvedValue(makeEvent({ status: 'archived' }))
    const { wrapper } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(wrapper.text()).toContain('Edit')
    await click(buttonByText('Archive'))
    expect(mocked.updateEvent).toHaveBeenCalledWith('event1', { status: 'archived' })
    expect(wrapper.text()).toContain('This event is archived')
    expect(wrapper.text()).toContain('Restore')
  })

  it('offers team registration to coaches while registration is open', async () => {
    const { wrapper } = await mountView(EventDetailView, { props: { id: 'event1' } })
    expect(wrapper.text()).toContain('Register a team')
    expect(wrapper.text()).not.toContain('Archive')
    expect(wrapper.text()).not.toContain('Staff')
  })

  it('opens the tab named in the URL and falls back to the overview for hidden ones', async () => {
    const coach = await mountView(EventDetailView, {
      props: { id: 'event1' },
      path: '/?tab=staff',
    })
    expect(coach.wrapper.get('[role=tab][data-state=active]').text()).toBe('Overview')
    coach.wrapper.unmount()

    const { wrapper } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('head_judge', 'event1')] },
      path: '/?tab=teams',
    })
    expect(wrapper.get('[role=tab][data-state=active]').text()).toBe('Teams')
    // Reviewing has one home: the review page, linked from the event header.
    expect(wrapper.text()).not.toContain('Scores')
    expect(wrapper.get('a[href*="event=event1"]').text()).toContain('Review scores')
  })

  it('hides registration when it is closed', async () => {
    mocked.getEvent.mockResolvedValue(
      makeEvent({ registration_closes_at: '2020-01-01 00:00:00.000Z' }),
    )
    const { wrapper } = await mountView(EventDetailView, { props: { id: 'event1' } })
    expect(wrapper.text()).not.toContain('Register a team')
    expect(wrapper.text()).toContain('Registration closed')
  })

  it('publishes draft events', async () => {
    mocked.getEvent.mockResolvedValue(makeEvent({ status: 'draft' }))
    mocked.updateEvent.mockResolvedValue(makeEvent({ status: 'published' }))
    await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('admin')] },
    })
    await click(buttonByText('Publish'))
    expect(mocked.updateEvent).toHaveBeenCalledWith('event1', { status: 'published' })
  })

  it('manages competition days (M1-07)', async () => {
    mocked.listDays
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { ...makeEvent(), id: 'd1', event: 'event1', date: '2026-06-13', label: 'Day 1' },
      ])
    mocked.createDay.mockResolvedValue({} as never)
    const { wrapper } = await mountView(CompetitionDays, {
      props: { eventId: 'event1', editable: true },
    })
    await fill('input[type=date]', '2026-06-13')
    await fill('input[placeholder="e.g. Day 1"]', 'Day 1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocked.createDay).toHaveBeenCalledWith('event1', '2026-06-13', 'Day 1')
    expect(wrapper.get('[data-testid=competition-days]').text()).toContain('Day 1')

    mocked.deleteDay.mockResolvedValue(true)
    await click(wrapper.get('button[aria-label="Remove 2026-06-13"]').element as HTMLElement)
    expect(mocked.deleteDay).toHaveBeenCalledWith('d1')
  })

  it('competition days are read-only without permission', async () => {
    const { wrapper } = await mountView(CompetitionDays, {
      props: { eventId: 'event1', editable: false },
    })
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
