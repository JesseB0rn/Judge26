import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { makeEvent, makeGame, makeRole, makeRound, makeTable, mountView } from '@/test/utils'
import * as api from '../api'
import EventScheduleTab from '../components/EventScheduleTab.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const round = makeRound('R1', 1)
const placed = makeGame({
  id: 'g1',
  team: 'alpha',
  table: 't1',
  starts_at: '2026-11-14 09:00:00.000Z',
  status: 'scheduled',
  expand: { team: { id: 'alpha', name: 'Alpha' } as never, round },
})
const waiting = makeGame({
  id: 'g2',
  team: 'bravo',
  status: 'scheduled',
  expand: { team: { id: 'bravo', name: 'Bravo' } as never, round },
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listTables.mockResolvedValue([makeTable({ id: 't1', name: 'Table 1' })])
  mocked.listTimeSlots.mockResolvedValue([])
  mocked.listEventCategories.mockResolvedValue([])
  mocked.listEventJudges.mockResolvedValue([])
  mocked.listScheduleGames.mockResolvedValue([placed, waiting])
  mocked.listScheduleIssues.mockResolvedValue([])
})

const mountTab = () =>
  mountView(EventScheduleTab, {
    props: { event: makeEvent(), canManage: true },
    session: { roles: [makeRole('event_manager', 'event1')] },
  })

describe('EventScheduleTab', () => {
  it('shows placed and unplaced games and reports no conflicts', async () => {
    const { wrapper } = await mountTab()
    expect(wrapper.get('[data-testid=schedule-summary]').text()).toBe('1 placed · 1 unplaced')
    expect(wrapper.get('[data-game=g1]').text()).toContain('Table 1')
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain('No conflicts')
  })

  it('lists conflicts of the current schedule with team names', async () => {
    mocked.listScheduleIssues.mockResolvedValue([
      { code: 'team_conflict', field: 'starts_at', gameId: 'g1', message: 'Overlap.' },
    ])
    const { wrapper } = await mountTab()
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain(
      '1 conflict(s) in the current schedule',
    )
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain(
      'Alpha (Round 1): Overlap.',
    )
  })

  it('preview shows why games do not fit, without saving', async () => {
    mocked.generateSchedule.mockResolvedValue({
      status: 'infeasible',
      message: 'Only 1 of 2 games fit without conflicts.',
      placedCount: 1,
      unplaced: [{ gameId: 'g2', reasons: ['no_conflict_free_slot'] }],
    })
    const { wrapper } = await mountTab()
    const preview = wrapper.findAll('button').find((b) => b.text() === 'Preview')!
    await preview.trigger('click')
    await flushPromises()

    expect(mocked.generateSchedule).toHaveBeenCalledWith('event1', true)
    expect(wrapper.get('[data-testid=generation-summary]').text()).toContain('Only 1 of 2')
    expect(wrapper.get('[data-testid=unplaced]').text()).toContain(
      'Bravo (Round 1): No conflict-free slot is left after the other games.',
    )
  })

  it('reloads the schedule after a generated schedule is saved', async () => {
    mocked.generateSchedule.mockResolvedValue({
      status: 'complete',
      placements: [],
      dry_run: false,
    })
    const { wrapper } = await mountTab()
    mocked.listScheduleGames.mockClear()
    const generate = wrapper.findAll('button').find((b) => b.text().includes('Generate schedule'))!
    await generate.trigger('click')
    await flushPromises()
    expect(mocked.generateSchedule).toHaveBeenCalledWith('event1', false)
    expect(mocked.listScheduleGames).toHaveBeenCalled()
  })
})
