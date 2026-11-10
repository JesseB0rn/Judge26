import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import { cacheAssignments, writeDraft } from '../drafts'
import { IDLE } from '../lib'
import JudgeDashboardView from '../views/JudgeDashboardView.vue'
import { makeAssignment, makeSheet } from './fixtures'

vi.mock('../api')
const mocked = vi.mocked(api)

const sat = { id: 'sat', date: '2026-06-13', label: 'Saturday' }
const sun = { id: 'sun', date: '2026-06-14', label: 'Sunday' }
const tA = { id: 'tA', name: 'Table A' }
const tB = { id: 'tB', name: 'Table B' }
const final = {
  status: 'finalized' as const,
  outcome: 'completed' as const,
  points: 40,
  time_ms: 95_370,
  updated: '',
}

const rows = [
  makeAssignment({
    id: 'g1',
    team: { id: 'a', name: 'Alpha' },
    day: sat,
    table: tA,
    sequence: 1,
    sheet: final,
  }),
  makeAssignment({ id: 'g2', team: { id: 'b', name: 'Bravo' }, day: sat, table: tA, sequence: 2 }),
  makeAssignment({
    id: 'g3',
    team: { id: 'c', name: 'Charlie' },
    day: sun,
    table: tB,
    sequence: 1,
  }),
]

const judge = { roles: [makeRole('judge', 'event1')] }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocked.listAssignments.mockResolvedValue(rows)
})
afterEach(() => document.body.replaceChildren())

const games = (w: Awaited<ReturnType<typeof mountView>>['wrapper']) =>
  w.findAll('[data-game]').map((el) => el.attributes('data-game'))

describe('JudgeDashboardView', () => {
  it('M5-01 / M5-T01: lists the assigned games in order with their status', async () => {
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(games(wrapper)).toEqual(['g1', 'g2', 'g3'])
    expect(wrapper.get('[data-game=g1]').text()).toContain('Final')
    expect(wrapper.get('[data-game=g1]').text()).toContain('40')
    expect(wrapper.get('[data-game=g2]').text()).toContain('Not scored')
    expect(wrapper.get('[data-testid=progress]').text()).toBe('1 of 3 scored')
  })

  it('shows the next game to score prominently (one tap to the score sheet)', async () => {
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    const next = wrapper.get('[data-testid=up-next]')
    expect(next.text()).toContain('Bravo')
    expect(next.attributes('href')).toContain('g2')
  })

  it('M5-02: filters by day and table', async () => {
    const { wrapper, router } = await mountView(JudgeDashboardView, { session: judge })
    await click(buttonByText('Sunday'))
    expect(games(wrapper)).toEqual(['g3'])
    expect(router.currentRoute.value.query.day).toBe('sun')
    await click(buttonByText('All'))
    await click(
      [...document.querySelectorAll('[aria-label=Table] button')].find((b) =>
        b.textContent?.includes('Table A'),
      ) as HTMLElement,
    )
    expect(games(wrapper)).toEqual(['g1', 'g2'])
    await click(buttonByText('To do'))
    expect(games(wrapper)).toEqual(['g2'])
  })

  it('explains an empty assignment list', async () => {
    mocked.listAssignments.mockResolvedValue([])
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(wrapper.get('[data-testid=no-assignments]').text()).toContain('No games')
  })

  it('M5-T13: offline it shows the list saved on the device and pending drafts', async () => {
    cacheAssignments('user1', rows)
    writeDraft({
      gameId: 'g2',
      input: { outcome: 'completed', values: {}, time_ms: 0, points: null },
      stopwatch: IDLE,
      savedAt: 1,
      synced: false,
    })
    mocked.listAssignments.mockRejectedValue(new ClientResponseError({ status: 0 }))
    mocked.saveDraft.mockRejectedValue(new ClientResponseError({ status: 0 }))
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(wrapper.text()).toContain('No connection')
    expect(games(wrapper)).toEqual(['g1', 'g2', 'g3'])
    expect(wrapper.get('[data-testid=pending-sync]').text()).toContain('1 score sheet')
  })

  it('M5-T14: pending drafts are sent when the dashboard opens', async () => {
    writeDraft({
      gameId: 'g2',
      input: { outcome: 'completed', values: { flag: true }, time_ms: 0, points: null },
      stopwatch: IDLE,
      savedAt: 1,
      synced: false,
    })
    mocked.saveDraft.mockResolvedValue({ sheet: makeSheet(), stale: false })
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(mocked.saveDraft).toHaveBeenCalledWith('g2', expect.anything(), 1)
    expect(wrapper.find('[data-testid=pending-sync]').exists()).toBe(false)
  })

  it('head judges review submitted sheets of their event', async () => {
    mocked.listEventScores.mockResolvedValue([
      makeAssignment({
        id: 's1',
        team: { id: 'd', name: 'Delta' },
        sheet: { ...final, status: 'submitted' },
      }),
      makeAssignment({ id: 's2', team: { id: 'e', name: 'Echo' } }),
    ])
    const { wrapper } = await mountView(JudgeDashboardView, {
      session: { roles: [makeRole('head_judge', 'event1')] },
    })
    const reviewTab = [...document.querySelectorAll('[role=tab]')].find((t) =>
      t.textContent?.includes('Review'),
    ) as HTMLElement
    reviewTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(mocked.listEventScores).toHaveBeenCalledWith('event1')
    const queue = wrapper.get('[data-testid=review-queue]')
    expect(queue.findAll('[data-game]').map((r) => r.attributes('data-game'))).toEqual(['s1'])
    expect(queue.text()).toContain('Waiting for review (1)')
  })
})
