import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { pb } from '@/shared/api/pocketbase'
import { makeEvent, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import type { Board } from '../api'
import BoardView from '../views/BoardView.vue'
import AssignmentBoard from '../components/AssignmentBoard.vue'

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  loadBoard: vi.fn(),
  moveTeam: vi.fn(),
  setTableCategory: vi.fn(),
  subscribeBoard: vi.fn(async () => () => {}),
}))
const mocked = vi.mocked(api)

const board = (): Board => ({
  categories: [{ id: 'rmj', name: 'Junior', code: 'RMJ', judges_per_table: 2 }],
  rounds: [{ id: 'j1', category: 'rmj', key: 'R1', name: 'Round 1', position: 1 }],
  tables: [
    {
      id: 'a',
      name: 'A',
      position: 1,
      active: true,
      category: 'rmj',
      categories: ['rmj'],
      judges: [],
      updated: 'va',
    },
  ],
  teams: [{ id: 't1', name: 'One', category: 'rmj' }],
  games: [
    {
      id: 'g1',
      round: 'j1',
      team: 't1',
      table: 'a',
      sequence: 1,
      status: 'scheduled',
      attempt: 1,
      updated: 'v1',
    },
  ],
  judges: [],
})

const manager = { roles: [makeRole('event_manager', 'event1')] }

describe('BoardView (M8-E)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(pb, 'collection').mockReturnValue({
      getOne: vi.fn(async () => makeEvent()),
    } as never)
    mocked.loadBoard.mockResolvedValue(board())
  })

  it('M8-32: sends the loaded versions with a move', async () => {
    mocked.moveTeam.mockResolvedValue(board())
    const { wrapper } = await mountView(BoardView, { props: { id: 'event1' }, session: manager })
    wrapper.getComponent(AssignmentBoard).vm.$emit('moveTeam', 't1', '', 0)
    await flushPromises()
    expect(mocked.moveTeam).toHaveBeenCalledWith('event1', {
      team: 't1',
      table: '',
      index: 0,
      expected: { g1: 'v1' },
    })
    wrapper.unmount()
  })

  it('M8-T19: a stale write reloads the board instead of failing', async () => {
    mocked.moveTeam.mockRejectedValue(Object.assign(new Error('changed'), { status: 409 }))
    const { wrapper } = await mountView(BoardView, { props: { id: 'event1' }, session: manager })
    expect(mocked.loadBoard).toHaveBeenCalledTimes(1)
    wrapper.getComponent(AssignmentBoard).vm.$emit('moveTeam', 't1', '', 0)
    await flushPromises()
    expect(mocked.loadBoard).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('M8-27: asks before moving a table with teams of another category', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper } = await mountView(BoardView, { props: { id: 'event1' }, session: manager })
    wrapper.getComponent(AssignmentBoard).vm.$emit('moveTables', [board().tables[0]!], 'rme')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(mocked.setTableCategory).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    mocked.setTableCategory.mockResolvedValue(board())
    wrapper.getComponent(AssignmentBoard).vm.$emit('moveTables', [board().tables[0]!], 'rme')
    await flushPromises()
    expect(mocked.setTableCategory).toHaveBeenCalledWith('event1', board().tables[0], 'rme', true)
    wrapper.unmount()
  })

  it('is closed to judges', async () => {
    const { wrapper } = await mountView(BoardView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('judge', 'event1')] },
    })
    expect(wrapper.text()).toContain('Only event managers and admins can use the board.')
    expect(wrapper.findComponent(AssignmentBoard).exists()).toBe(false)
    wrapper.unmount()
  })
})
