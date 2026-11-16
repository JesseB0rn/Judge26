import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { buttonByText, click, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import type { EventCheckProgress, RoundProgress } from '../types'
import ChecksView from '../views/ChecksView.vue'

vi.mock('../api')
vi.mock('@/modules/live/useLiveUpdates', () => ({ useLiveUpdates: vi.fn<() => void>() }))
const mocked = vi.mocked(api)

const headJudge = { roles: [makeRole('head_judge', 'event1')] }

function round(over: Partial<RoundProgress> = {}): RoundProgress {
  return {
    id: 'r1',
    key: 'R1',
    name: 'Round 1',
    position: 1,
    check_mode: 'synchronous',
    released_at: '',
    released_by: null,
    release_reason: '',
    category: { id: 'cat1', name: 'RoboMission Junior', code: 'RM-J' },
    day: { id: 'sat', date: '2026-06-13', label: 'Saturday' },
    checks_recorded: true,
    parts_check: null,
    file: null,
    tables: [
      { id: 't1', name: 'Table 1', checked: 2, total: 2, ready: { at: '', by: null } },
      { id: 't2', name: 'Table 2', checked: 1, total: 2, ready: null },
    ],
    ...over,
  }
}

function progress(over: Partial<EventCheckProgress> = {}): EventCheckProgress {
  return {
    event: { id: 'event1', name: 'WRO Final', status: 'published' },
    can_manage: false,
    parts_checks: [
      {
        id: 'p1',
        title: 'Parts check',
        place: 'Hall',
        day: { id: 'sat', date: '2026-06-13', label: 'Saturday' },
        starts_at: '08:00',
        duration_minutes: 30,
        categories: [],
        blocks_first_round: true,
        completed_at: '',
        completed_by: null,
        completion_note: '',
        tables: [
          {
            id: 't1',
            name: 'Table 1',
            confirmed_at: '2026-06-13 08:10:00.000Z',
            confirmed_by: null,
          },
          { id: 't2', name: 'Table 2', confirmed_at: '', confirmed_by: null },
        ],
      },
    ],
    rounds: [round()],
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.getEventChecks.mockResolvedValue(progress())
})
afterEach(() => document.body.replaceChildren())

const mountChecks = () =>
  mountView(ChecksView, { session: headJudge, path: '/judging/checks?event=event1' })

describe('ChecksView (M10-13)', () => {
  it('M10-T19: shows teams checked of total and the ready state per table', async () => {
    const { wrapper } = await mountChecks()
    expect(mocked.getEventChecks).toHaveBeenCalledWith('event1')
    const rows = wrapper.findAll('[data-round=r1] tbody tr')
    expect(rows.map((r) => [r.attributes('data-table'), r.attributes('data-ready')])).toEqual([
      ['Table 1', 'true'],
      ['Table 2', 'false'],
    ])
    expect(rows[1]!.get('[data-testid=table-checked]').text()).toBe('1 of 2')
    // Checks recorded: the mode is fixed; only managers can turn the check off.
    const select = wrapper.get('[data-testid=check-mode-select]')
    expect(select.attributes('disabled')).toBeDefined()
    expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual([
      'synchronous',
      'asynchronous',
    ])
  })

  it('M10-T16: releasing with a table not ready asks for a reason', async () => {
    mocked.releaseRound.mockResolvedValue(round({ released_at: 'x' }))
    const { wrapper } = await mountChecks()
    await click(wrapper.get('[data-testid=release-round]').element as HTMLElement)
    const dialog = document.querySelector('[role=dialog]') as HTMLElement
    expect(dialog.textContent).toContain('Not ready yet: Table 2')
    const reason = dialog.querySelector('textarea')!
    reason.value = 'Judge of table 2 is late'
    reason.dispatchEvent(new Event('input'))
    await flushPromises()
    await click(buttonByText('Release for scoring', dialog))
    expect(mocked.releaseRound).toHaveBeenCalledWith('r1', 'Judge of table 2 is late')
  })

  it('releases at once when every table is ready', async () => {
    const ready = { at: '', by: null }
    mocked.getEventChecks.mockResolvedValue(
      progress({
        rounds: [
          round({
            tables: [
              { id: 't1', name: 'Table 1', checked: 2, total: 2, ready },
              { id: 't2', name: 'Table 2', checked: 2, total: 2, ready },
            ],
          }),
        ],
      }),
    )
    const { wrapper } = await mountChecks()
    await click(wrapper.get('[data-testid=release-round]').element as HTMLElement)
    expect(mocked.releaseRound).toHaveBeenCalledWith('r1')
  })

  it('M10-T24: completing a parts check with a table open names it first', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper } = await mountChecks()
    const block = wrapper.get('[data-parts-check="Parts check"]')
    expect(block.get('[data-table="Table 2"]').attributes('data-confirmed')).toBe('false')
    await click(block.get('[data-testid=parts-complete]').element as HTMLElement)
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('Table 2'))
    expect(mocked.completePartsCheck).toHaveBeenCalledWith('p1', true)
    ask.mockRestore()
  })

  it('M10-17: uploads the round file', async () => {
    const { wrapper } = await mountChecks()
    const input = wrapper.get('[data-testid=round-file-input]').element as HTMLInputElement
    const file = new File(['x'], 'field.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(mocked.uploadRoundFile).toHaveBeenCalledWith('r1', file)
  })
})
