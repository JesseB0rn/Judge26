import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import {
  buttonByText,
  click,
  eventNav,
  fill,
  makeEvent,
  makeRole,
  menuItem,
  mountView,
  openMenu,
} from '@/test/utils'
import * as api from '../api'
import * as templatesApi from '@/modules/templates/api'
import EventListView from '../views/EventListView.vue'
import EventDetailView from '../views/EventDetailView.vue'
import CompetitionDays from '../components/CompetitionDays.vue'

vi.mock('../api')
vi.mock('@/modules/categories/api')
vi.mock('@/modules/teams/api')
vi.mock('@/modules/administration/api')
vi.mock('@/modules/templates/api')

const mocked = vi.mocked(api)
const templates = vi.mocked(templatesApi)

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

  it('lists events with their status', async () => {
    const { wrapper } = await mountView(EventListView)
    const text = wrapper.get('[data-testid=event-list]').text()
    expect(text).toContain('WRO Final')
    expect(text).toContain('Draft Cup')
    expect(text).not.toContain('Registration')
  })

  it('only admins can create events (M1-06)', async () => {
    const coach = await mountView(EventListView)
    expect(coach.wrapper.text()).not.toContain('New event')
    coach.wrapper.unmount()

    mocked.createEvent.mockResolvedValue(makeEvent({ id: 'new' }))
    const { router } = await mountView(EventListView, { session: { roles: [makeRole('admin')] } })
    await click(buttonByText('New event'))
    await fill('[role=dialog] input[required]', 'Swiss Final')
    // M10-19: run times in whole seconds by default; tenths chosen here.
    const decimals = 'select[data-testid=time-decimals]'
    expect(document.querySelector<HTMLSelectElement>(decimals)!.value).toBe('0')
    await fill(decimals, '1')
    // M11-10: no status field, the server makes it a draft. M11-11: optional first day.
    expect(document.querySelector('[role=dialog]')!.textContent).not.toContain('Status')
    expect(document.querySelector('[data-testid=draft-notice]')).not.toBeNull()
    await fill('[data-testid=first-day-date]', '2026-06-13')
    await click(buttonByText('Save'))
    expect(mocked.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Swiss Final',
        season: new Date().getFullYear(),
        time_decimals: 1,
        first_day: { date: '2026-06-13', starts_at: '08:00', ends_at: '18:00' },
      }),
    )
    expect(mocked.createEvent.mock.calls[0]![0]).not.toHaveProperty('status')
    expect(router.currentRoute.value.name).toBe('event')
  })

  it('shows management actions to event managers and archives events (M1-06)', async () => {
    mocked.updateEvent.mockResolvedValue(makeEvent({ status: 'archived' }))
    const { wrapper } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(wrapper.text()).toContain('Edit')
    // M11-16: Archive is in the More menu; the header holds actions only.
    await openMenu(wrapper.get('[data-testid=event-more]').element)
    await click(menuItem('Archive'))
    expect(mocked.updateEvent).toHaveBeenCalledWith('event1', { status: 'archived' })
    expect(wrapper.text()).toContain('This event is archived')
    await openMenu(wrapper.get('[data-testid=event-more]').element)
    expect(menuItem('Restore')).toBeTruthy()
  })

  it('M8-02: users without a role see the event, but no teams and no registration', async () => {
    const { wrapper } = await mountView(EventDetailView, { props: { id: 'event1' } })
    expect(wrapper.text()).not.toContain('Register a team')
    expect(wrapper.text()).not.toContain('Registration')
    expect(eventNav(wrapper.element).sections).toEqual(['Overview', 'Categories', 'Schedule'])
    expect(wrapper.text()).not.toContain('Archive')
    expect(wrapper.text()).not.toContain('Staff')
  })

  it('opens the tab named in the URL and falls back to the overview for hidden ones', async () => {
    const coach = await mountView(EventDetailView, {
      props: { id: 'event1' },
      path: '/?tab=staff',
    })
    expect(eventNav(coach.wrapper.element).current).toBe('Overview')
    coach.wrapper.unmount()

    const { wrapper } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('head_judge', 'event1')] },
      path: '/?tab=teams',
    })
    expect(eventNav(wrapper.element).current).toBe('Teams')
    // Reviewing has one home: the review page, linked from the event navigation.
    expect(wrapper.text()).not.toContain('Scores')
    expect(wrapper.get('a[href*="event=event1"]').text()).toContain('Review scores')
  })

  it('M11-T16: old schedule links open the Assignments tab; tabs follow the setup order', async () => {
    const { wrapper, router } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('admin')] },
      path: '/?tab=schedule',
    })
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('assignments')
    expect(eventNav(wrapper.element).current).toBe('Assignments')
    // M11-17: the planner and print center sit with the assignments.
    expect(eventNav(wrapper.element).sections).toEqual([
      'Overview',
      'Setup',
      'Categories',
      'Teams',
      'Staff',
      'Assignments',
      'Planner',
      'Print',
      'Public results',
      'Messages',
      'Activity',
    ])
  })

  it('M11-T21: a draft opens on Setup for its managers, on Overview for everyone else', async () => {
    mocked.getEvent.mockResolvedValue(makeEvent({ status: 'draft' }))
    templates.getSetupStatus.mockResolvedValue({ complete: false, steps: [] })
    const manager = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(eventNav(manager.wrapper.element).current).toBe('Setup')
    manager.wrapper.unmount()

    const judge = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('judge', 'event1')] },
    })
    expect(eventNav(judge.wrapper.element).current).toBe('Overview')
    judge.wrapper.unmount()

    mocked.getEvent.mockResolvedValue(makeEvent())
    const published = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(eventNav(published.wrapper.element).current).toBe('Overview')
  })

  it('M11-T17: the header holds actions; places are links in the event navigation', async () => {
    const { wrapper } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    // At most the event name links home (off the event page); no other place is in the header.
    const links = wrapper.get('header').findAll('a')
    expect(links.every((a) => a.attributes('data-testid') === 'event-title-link')).toBe(true)
    const nav = wrapper.get('[data-testid=event-nav]')
    // The test router serves each named route at /__{name}/{id}.
    expect(nav.get('[data-section=planner]').attributes('href')).toBe('/__event-planner/event1')
    expect(nav.get('[data-section=print]').attributes('href')).toBe('/__event-print/event1')
    expect(nav.get('[data-outbound=review]').attributes('href')).toContain('event=event1')
    expect(nav.get('[data-outbound=live]').attributes('href')).toBe('/__live-event/event1')
  })

  it('M11-T15: publishes a complete setup at once', async () => {
    mocked.getEvent.mockResolvedValue(makeEvent({ status: 'draft' }))
    mocked.updateEvent.mockResolvedValue(makeEvent({ status: 'published' }))
    templates.getSetupStatus.mockResolvedValue({
      complete: false,
      steps: [
        { key: 'days', done: true, needs: [] },
        { key: 'publish', done: false, needs: ['schedule'] },
      ],
    })
    await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('admin')] },
    })
    await click(buttonByText('Publish'))
    await flushPromises()
    expect(document.querySelector('[data-testid=publish-dialog]')).toBeNull()
    expect(mocked.updateEvent).toHaveBeenCalledWith('event1', { status: 'published' })
  })

  it('M11-T15: asks first when the setup is incomplete, listing the open steps', async () => {
    mocked.getEvent.mockResolvedValue(makeEvent({ status: 'draft' }))
    mocked.updateEvent.mockResolvedValue(makeEvent({ status: 'published' }))
    templates.getSetupStatus.mockResolvedValue({
      complete: false,
      steps: [
        { key: 'days', done: true, needs: [] },
        { key: 'rounds', done: false, needs: ['days', 'categories'] },
        { key: 'schedule', done: false, needs: ['rounds'] },
        { key: 'publish', done: false, needs: ['schedule'] },
      ],
    })
    const { router } = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('admin')] },
    })
    const confirm = vi.spyOn(window, 'confirm')
    await click(buttonByText('Publish'))
    await flushPromises()
    const steps = document.querySelector('[data-testid=publish-open-steps]')!.textContent
    expect(steps).toContain('Rounds')
    expect(steps).toContain('Schedule')
    expect(steps).not.toContain('Competition days')
    expect(mocked.updateEvent).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()

    await click(buttonByText('Go to setup'))
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('setup')
    expect(mocked.updateEvent).not.toHaveBeenCalled()

    await click(buttonByText('Publish'))
    await flushPromises()
    await click(buttonByText('Publish anyway'))
    await flushPromises()
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
    expect(mocked.createDay).toHaveBeenCalledWith('event1', '2026-06-13', 'Day 1', {
      starts_at: '08:00',
      ends_at: '18:00',
    })
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
