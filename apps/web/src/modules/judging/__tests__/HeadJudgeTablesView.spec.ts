import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import HeadJudgeTablesView from '../views/HeadJudgeTablesView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listHeadJudgeTables.mockResolvedValue([
    {
      id: 't3',
      name: 'Table 3',
      event: { id: 'event1', name: 'WRO Final' },
      category: { id: 'c1', name: 'RoboMission Junior', code: 'RMJ' },
      judges: [{ id: 'u1', name: 'Judy' }],
      progress: { done: 1, total: 4 },
    },
    {
      id: 't4',
      name: 'Table 4',
      event: { id: 'event1', name: 'WRO Final' },
      category: null,
      judges: [],
      progress: { done: 0, total: 0 },
    },
  ])
})
afterEach(() => document.body.replaceChildren())

describe('HeadJudgeTablesView (M10-07)', () => {
  it('lists tables with category, judges and progress; each opens that table’s dashboard', async () => {
    const { wrapper } = await mountView(HeadJudgeTablesView, {
      session: { roles: [makeRole('head_judge', 'event1')] },
    })
    const t3 = wrapper.get('[data-table="Table 3"]')
    expect(t3.text()).toContain('RoboMission Junior')
    expect(t3.text()).toContain('Judy')
    expect(t3.get('[data-testid=table-progress]').text()).toBe('1 of 4 scored')
    expect(t3.attributes('href')).toContain('seat=t3')
    expect(wrapper.get('[data-table="Table 4"]').text()).toContain('No judge assigned')
  })
})
