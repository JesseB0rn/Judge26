import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import { ClientResponseError } from 'pocketbase'
import App from '@/App.vue'
import { routes } from '@/router'
import { resolveAccess } from '@/router/guards'
import { useSessionStore } from '@/shared/auth/session'
import * as categoriesApi from '@/modules/categories/api'
import * as rankingsApi from '@/modules/rankings/api'
import {
  buttonByText,
  click,
  makeCategory,
  makeEvent,
  makeRole,
  makeUser,
  mountView,
} from '@/test/utils'
import * as api from '../api'
import LiveEventView from '../views/LiveEventView.vue'
import TvView from '../views/TvView.vue'
import PublicationPanel from '../components/PublicationPanel.vue'
import { makePublicEvent, makePublicRanking, official } from './fixtures'

vi.mock('../api')
vi.mock('@/modules/categories/api')
vi.mock('@/modules/rankings/api')
vi.mock('../useLiveUpdates', () => ({
  useLiveUpdates: vi.fn<() => unknown>(() => ({
    status: ref('live'),
    lastChecked: ref(),
    check: vi.fn<() => void>(),
  })),
}))
const mocked = vi.mocked(api)

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocked.getPublicEvent.mockResolvedValue(makePublicEvent())
  mocked.getPublicRanking.mockImplementation(async (id) =>
    id === 'rmj'
      ? makePublicRanking()
      : makePublicRanking({
          category: { id, name: 'RoboMission Elementary', code: 'RM-E', event: 'event1' },
          live: null,
        }),
  )
})
afterEach(() => document.body.replaceChildren())

const guest = { user: null }
const gameIds = () =>
  [...document.querySelectorAll('[data-game]')].map((e) => e.getAttribute('data-game'))

async function openTab(name: string) {
  const tab = [...document.querySelectorAll('[role=tab]')].find((t) =>
    t.textContent?.includes(name),
  )
  tab!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  ;(tab as HTMLElement).focus()
  await flushPromises()
}

describe('LiveEventView', () => {
  it('M6-03 / M6-02: guests see the live ranking, marked provisional, with progress', async () => {
    const { wrapper } = await mountView(LiveEventView, { props: { id: 'event1' }, session: guest })
    expect(wrapper.text()).toContain('WRO Final')
    expect(mocked.getPublicRanking).toHaveBeenCalledWith('rmj')
    expect(wrapper.get('[data-testid=live-title]').text()).toContain('Live ranking')
    expect(wrapper.get('[data-testid=provisional]').text()).toContain('4 of 5 games are not final')
    expect(wrapper.findAll('[data-testid=rank]').map((r) => r.text())).toEqual(['1', '2'])
  })

  it('M6-T05: switching the category shows only that category', async () => {
    const { wrapper, router } = await mountView(LiveEventView, {
      props: { id: 'event1' },
      session: guest,
    })
    await click(buttonByText('RoboMission Elementary'))
    expect(mocked.getPublicRanking).toHaveBeenLastCalledWith('rme')
    expect(router.currentRoute.value.query.category).toBe('rme')
    expect(wrapper.find('[data-testid=not-published]').exists()).toBe(true)
    await openTab('Schedule')
    expect(gameIds()).toEqual(['e1g'])
  })

  it('M6-T06: switching the competition day shows that day’s games', async () => {
    vi.setSystemTime(new Date(2026, 5, 13, 9))
    const { router } = await mountView(LiveEventView, {
      props: { id: 'event1' },
      session: guest,
      path: '/?tab=schedule',
    })
    await click(buttonByText('All', document.querySelector('[aria-label=Category]')!))
    // Today is Saturday.
    expect(gameIds()).toEqual(['e1g', 'a1', 'b1', 'c1', 'd1'])
    await click(buttonByText('Sunday'))
    expect(gameIds()).toEqual(['a2'])
    expect(router.currentRoute.value.query.day).toBe('sun')
    expect(
      document.querySelector('[data-table="Table A"] [data-testid=table-now]')?.textContent,
    ).toBe('Alpha')
    vi.useRealTimers()
  })

  it('M6-10: shows the official ranking when published, with the live ranking as an option', async () => {
    mocked.getPublicRanking.mockResolvedValue(
      makePublicRanking({ official: official(['Bravo', 'Alpha'], 'Official day 1') }),
    )
    const { wrapper } = await mountView(LiveEventView, { props: { id: 'event1' }, session: guest })
    expect(wrapper.get('[data-testid=official-title]').text()).toContain('Official day 1')
    expect(wrapper.find('[data-testid=provisional]').exists()).toBe(false)
    expect(wrapper.get('[data-team=Bravo] [data-testid=rank]').text()).toBe('1')
    await click(buttonByText('Live'))
    expect(wrapper.get('[data-team=Alpha] [data-testid=rank]').text()).toBe('1')
  })

  it('M6-08: shows the progress per category', async () => {
    const { wrapper } = await mountView(LiveEventView, {
      props: { id: 'event1' },
      session: guest,
      path: '/?tab=progress&day=',
    })
    await click(buttonByText('All', document.querySelector('[aria-label=Category]')!))
    expect(wrapper.get('[data-category=rmj] [data-testid=progress-text]').text()).toContain(
      '1 of 5 games done',
    )
  })

  it('M6-T09: keeps showing the last data when the server cannot be reached', async () => {
    await mountView(LiveEventView, { props: { id: 'event1' }, session: guest })
    document.body.replaceChildren()
    mocked.getPublicEvent.mockRejectedValue(new ClientResponseError({ status: 0 }))
    mocked.getPublicRanking.mockRejectedValue(new ClientResponseError({ status: 0 }))
    const { wrapper } = await mountView(LiveEventView, { props: { id: 'event1' }, session: guest })
    expect(wrapper.text()).toContain('WRO Final')
    expect(wrapper.findAll('[data-testid=rank]')).toHaveLength(2)
    expect(wrapper.get('[data-testid=live-indicator]').attributes('data-status')).toBe('offline')
  })

  it('M6-T04: an event that is not public shows an error', async () => {
    mocked.getPublicEvent.mockRejectedValue(
      new ClientResponseError({ status: 404, response: { message: 'The event was not found.' } }),
    )
    const { wrapper } = await mountView(LiveEventView, { props: { id: 'event1' }, session: guest })
    expect(wrapper.text()).not.toContain('WRO Final')
    expect(wrapper.find('[data-testid=public-ranking]').exists()).toBe(false)
  })
})

describe('TvView', () => {
  it('M6-05: rotates through the published rankings, the tables and the progress', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mountView(TvView, {
      props: { id: 'event1' },
      session: guest,
      path: '/?rotate=5&day=sat',
    })
    await flushPromises()
    // Only RM-J has public results: ranking, tables, progress.
    expect(mocked.getPublicRanking).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid=tv-title]').text()).toBe('RoboMission Junior')
    expect(wrapper.get('[data-testid=tv-source]').text()).toBe('Live · provisional')
    expect(wrapper.findAll('[data-testid=tv-ranking-row]')).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('[data-testid=tv-title]').text()).toContain('At the tables')
    expect(wrapper.findAll('[data-testid=tv-table]').map((t) => t.text())).toEqual([
      expect.stringContaining('Charlie'),
      expect.stringContaining('Echo'),
    ])
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('[data-testid=tv-title]').text()).toContain('Progress')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('[data-testid=tv-title]').text()).toBe('RoboMission Junior')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('pins a view from the URL', async () => {
    const { wrapper } = await mountView(TvView, {
      props: { id: 'event1' },
      session: guest,
      path: '/?view=tables&day=sun',
    })
    expect(wrapper.get('[data-testid=tv-title]').text()).toBe('At the tables · Sunday')
    wrapper.unmount()
  })

  it('M6-T07: TV mode has no navigation or administration controls, even for admins', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.user = makeUser()
    session.roles = [makeRole('admin')]
    session.ensureInitialized = () => Promise.resolve()
    const router = createRouter({ history: createMemoryHistory(), routes })
    router.beforeEach((to) => resolveAccess(to, session))
    await router.push('/live/event1/tv')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-testid=tv]').exists()).toBe(true)
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    const buttons = wrapper.findAll('button').map((b) => b.text())
    expect(buttons).toEqual(['Full screen'])
    expect(wrapper.text()).not.toContain('Sign out')
    wrapper.unmount()
  })
})

describe('PublicationPanel', () => {
  const rmj = makeCategory({ id: 'rmj', name: 'RoboMission Junior', ranking: { schemaVersion: 1 } })
  const noRanking = makeCategory({ id: 'rme', name: 'RoboMission Elementary', ranking: null })
  const snapshot = {
    id: 'snap1',
    category: 'rmj',
    title: 'Day 1',
    created: '2026-06-13 18:00:00.000Z',
  }

  beforeEach(() => {
    vi.mocked(categoriesApi.listEventCategories).mockResolvedValue([rmj, noRanking])
    mocked.listEventSnapshots.mockResolvedValue([snapshot as never])
    mocked.updatePublication.mockImplementation(async (id, data) => ({
      ...(id === 'rmj' ? rmj : noRanking),
      ...data,
      results_published_at: data.published_snapshot ? '2026-06-13 18:05:00.000Z' : '',
    }))
  })

  const manager = { roles: [makeRole('event_manager', 'event1')] }

  it('M6-10: toggles the public live ranking and publishes a snapshot as the official ranking', async () => {
    const { wrapper } = await mountView(PublicationPanel, {
      props: { event: makeEvent(), editable: true },
      session: manager,
    })
    const live = wrapper.get<HTMLInputElement>(
      '[aria-label="Show the live ranking of RoboMission Junior publicly"]',
    )
    expect(live.element.checked).toBe(false)
    await live.setValue(true)
    await flushPromises()
    expect(mocked.updatePublication).toHaveBeenCalledWith('rmj', { public_live: true })
    expect(wrapper.get('[data-category="RoboMission Junior"]').text()).toContain('Public')

    await wrapper.get('[aria-label="Official ranking of RoboMission Junior"]').setValue('snap1')
    await flushPromises()
    expect(mocked.updatePublication).toHaveBeenLastCalledWith('rmj', {
      published_snapshot: 'snap1',
    })
    expect(wrapper.find('[data-testid=published-at]').exists()).toBe(true)

    // Live results need a ranking configuration.
    expect(
      wrapper.get<HTMLInputElement>(
        '[aria-label="Show the live ranking of RoboMission Elementary publicly"]',
      ).element.disabled,
    ).toBe(true)
  })

  it('M6-10: publishes the current ranking in one step', async () => {
    vi.mocked(rankingsApi.createSnapshot).mockResolvedValue({ ...snapshot, id: 'snap2' } as never)
    const { wrapper } = await mountView(PublicationPanel, {
      props: { event: makeEvent(), editable: true },
      session: manager,
    })
    await click(
      buttonByText(
        'Publish current ranking',
        wrapper.get('[data-category="RoboMission Junior"]').element,
      ),
    )
    expect(rankingsApi.createSnapshot).toHaveBeenCalledWith(
      'rmj',
      expect.stringContaining('Official ranking'),
    )
    expect(mocked.updatePublication).toHaveBeenCalledWith('rmj', { published_snapshot: 'snap2' })
  })

  it('warns that draft events are not public and is read-only when not editable', async () => {
    const { wrapper } = await mountView(PublicationPanel, {
      props: { event: makeEvent({ status: 'draft' }), editable: false },
      session: manager,
    })
    expect(wrapper.text()).toContain('This event is a draft')
    expect(wrapper.text()).not.toContain('Publish current ranking')
  })
})
