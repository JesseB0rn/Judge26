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
  sequence: 1,
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
  mocked.listTables.mockResolvedValue([
    makeTable({ id: 't1', name: 'Table 1', expand: { judges: [{ name: 'Grace' } as never] } }),
  ])
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
    expect(wrapper.get('[data-testid=schedule-summary]').text()).toBe('1 assigned · 1 unassigned')
    expect(wrapper.get('[data-game=g1]').text()).toContain('Table 1')
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain('No conflicts')
  })

  it('lists conflicts of the current schedule with team names', async () => {
    mocked.listScheduleIssues.mockResolvedValue([
      { code: 'sequence_in_use', field: 'sequence', gameId: 'g1', message: 'Sequence is used.' },
    ])
    const { wrapper } = await mountTab()
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain(
      'One conflict in the current schedule',
    )
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain(
      'Alpha (Round 1): That sequence number is already used on this table in this round.',
    )
  })

  it('shows the server message for issue codes it does not know', async () => {
    mocked.listScheduleIssues.mockResolvedValue([
      { code: 'something_new', field: 'sequence', gameId: 'g1', message: 'As sent.' },
    ])
    const { wrapper } = await mountTab()
    expect(wrapper.get('[data-testid=schedule-issues]').text()).toContain(
      'Alpha (Round 1): As sent.',
    )
  })

  it('explains why staff without manager access cannot generate the schedule', async () => {
    const { wrapper } = await mountView(EventScheduleTab, {
      props: { event: makeEvent(), canManage: false },
      session: { roles: [makeRole('judge', 'event1')] },
    })

    expect(wrapper.get('[data-testid=schedule-permission]').text()).toContain(
      'Only event managers and admins can create games or generate schedules.',
    )
    expect(wrapper.text()).not.toContain('Generate schedule')
  })

  it('preview shows why games do not fit, without saving', async () => {
    mocked.generateSchedule.mockResolvedValue({
      status: 'infeasible',
      message: 'Only 1 of 2 games fit without conflicts.',
      placedCount: 1,
      unplaced: [{ gameId: 'g2', reasons: ['no_compatible_table'] }],
    })
    const { wrapper } = await mountTab()
    const preview = wrapper.findAll('button').find((b) => b.text() === 'Preview')!
    await preview.trigger('click')
    await flushPromises()

    expect(mocked.generateSchedule).toHaveBeenCalledWith('event1', true)
    expect(wrapper.get('[data-testid=generation-summary]').text()).toContain(
      'Some teams could not be assigned to an active table with a judge.',
    )
    expect(wrapper.get('[data-testid=unplaced]').text()).toContain(
      'Bravo (Round 1): No active, assigned-judge table accepts this category.',
    )
  })

  it('reloads the schedule after a generated schedule is saved', async () => {
    mocked.generateSchedule.mockResolvedValue({
      status: 'complete',
      placements: [],
      dry_run: false,
      created_games: 2,
    })
    const { wrapper } = await mountTab()
    mocked.listScheduleGames.mockClear()
    const generate = wrapper.findAll('button').find((b) => b.text().includes('Generate schedule'))!
    await generate.trigger('click')
    await flushPromises()
    expect(mocked.generateSchedule).toHaveBeenCalledWith('event1', false)
    expect(mocked.listScheduleGames).toHaveBeenCalled()
    expect(wrapper.get('[data-testid=generation-summary]').text()).toContain(
      '2 missing games created.',
    )
  })
})
