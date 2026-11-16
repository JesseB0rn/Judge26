import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import { filterTeams, tablePages, teamSchedule, teamTables } from '../lib'
import type { PrintData } from '../types'
import PrintCenterView from '../views/PrintCenterView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const sat = { id: 'sat', date: '2026-06-13', label: 'Saturday' }
const sun = { id: 'sun', date: '2026-06-14', label: 'Sunday' }

const DATA: PrintData = {
  event: { id: 'event1', name: 'WRO Final', season: 2026, venue: 'Bern', status: 'published' },
  days: [sat, sun],
  categories: [
    { id: 'rmj', name: 'RoboMission Junior', code: 'RMJ' },
    { id: 'rme', name: 'RoboMission Elementary', code: 'RME' },
  ],
  rounds: [
    {
      id: 'r1',
      category: 'rmj',
      key: 'R1',
      name: 'Round 1',
      position: 1,
      day: 'sat',
      phases: [
        { phase: 'maintenance', day: 'sat', starts_at: '09:00', duration_minutes: 30 },
        { phase: 'check', day: 'sat', starts_at: '09:30', duration_minutes: 10 },
        { phase: 'scoring', day: 'sat', starts_at: '10:00', duration_minutes: 60 },
      ],
    },
    {
      id: 'r2',
      category: 'rmj',
      key: 'R2',
      name: 'Round 2',
      position: 2,
      day: 'sun',
      phases: [{ phase: 'scoring', day: 'sun', starts_at: '13:00', duration_minutes: 60 }],
    },
    {
      id: 'e1',
      category: 'rme',
      key: 'R1',
      name: 'Round 1',
      position: 1,
      day: 'sat',
      phases: [{ phase: 'scoring', day: 'sat', starts_at: '11:00', duration_minutes: 60 }],
    },
  ],
  tables: [
    { id: 't1', name: 'Table 1', categories: ['rmj'], judges: [{ id: 'j1', name: 'Judy' }] },
    { id: 't2', name: 'Table 2', categories: ['rmj'], judges: [] },
    { id: 't3', name: 'Table 3', categories: ['rme'], judges: [{ id: 'j2', name: 'Jo' }] },
  ],
  teams: [
    {
      id: 'a',
      name: 'Alpha',
      organization: 'School A',
      country: 'CH',
      category: 'rmj',
      games: [
        { id: 'a1', round: 'r1', attempt: 1, table: 't1', sequence: 2 },
        { id: 'a2', round: 'r2', attempt: 1, table: 't2', sequence: 1 },
      ],
    },
    {
      id: 'b',
      name: 'Bravo',
      organization: '',
      country: 'CH',
      category: 'rmj',
      games: [{ id: 'b1', round: 'r1', attempt: 1, table: 't1', sequence: 1 }],
    },
    {
      id: 'c',
      name: 'Charlie',
      organization: 'Club C',
      country: 'CH',
      category: 'rme',
      games: [{ id: 'c1', round: 'e1', attempt: 1, table: 't3', sequence: 1 }],
    },
  ],
}

describe('print center builders', () => {
  it('filters teams by category and day', () => {
    expect(filterTeams(DATA, { category: 'rmj', day: '' }).map((t) => t.name)).toEqual([
      'Alpha',
      'Bravo',
    ])
    expect(filterTeams(DATA, { category: '', day: 'sun' }).map((t) => t.name)).toEqual(['Alpha'])
  })

  it('M10-T47: a team’s schedule has every phase and game with day, time and table', () => {
    const lines = teamSchedule(DATA, DATA.teams[0]!)
    expect(lines.map((l) => [l.round, l.what, l.day, l.time, l.table, l.sequence])).toEqual([
      ['R1 · Round 1', 'Practice Time', 'Saturday', '09:00–09:30', '', 0],
      ['R1 · Round 1', 'Robot check', 'Saturday', '09:30–09:40', '', 0],
      ['R1 · Round 1', 'Scoring Run', 'Saturday', 'from 10:00', 'Table 1', 2],
      ['R2 · Round 2', 'Scoring Run', 'Sunday', 'from 13:00', 'Table 2', 1],
    ])
    expect(teamTables(DATA, DATA.teams[0]!).map((t) => t.name)).toEqual(['Table 1', 'Table 2'])
  })

  it('M10-T48: one table page per table of the round, teams in playing order', () => {
    const pages = tablePages(DATA, 'r1')
    expect(pages.map((p) => [p.table.name, p.teams.map((t) => t.name)])).toEqual([
      ['Table 1', ['Bravo', 'Alpha']],
    ])
  })
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.getPrintData.mockResolvedValue(DATA)
})
afterEach(() => document.body.replaceChildren())

const headJudge = { roles: [makeRole('head_judge', 'event1')] }
const mountPrint = (query = '') =>
  mountView(PrintCenterView, {
    props: { id: 'event1' },
    session: headJudge,
    path: `/events/event1/print${query}`,
  })
const pages = (w: Awaited<ReturnType<typeof mountPrint>>['wrapper']) =>
  w.findAll('[data-page]').map((p) => p.attributes('data-record'))

describe('PrintCenterView (M10-31)', () => {
  it('M10-T46: parking labels of one category, one page per team with name and category', async () => {
    const { wrapper } = await mountPrint('?kind=parking&category=rmj')
    expect(pages(wrapper)).toEqual(['a', 'b'])
    const label = wrapper.get('[data-record=a][data-page]')
    expect(label.text()).toContain('Alpha')
    expect(label.text()).toContain('RoboMission Junior (RMJ)')
    expect(label.text()).toContain('School A')
    expect(wrapper.get('[data-testid=print-button]').text()).toContain('Print 2 pages')
  })

  it('printing a selection gives one page per selected record', async () => {
    const { wrapper } = await mountPrint('?kind=parking')
    const box = wrapper.get('input[data-record=b]')
    ;(box.element as HTMLInputElement).checked = false
    await box.trigger('change')
    // By category code, then name.
    expect(pages(wrapper)).toEqual(['c', 'a'])
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await wrapper.get('[data-testid=print-button]').trigger('click')
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })

  it('M10-T47: the workplace sheet names the table’s judges and lists the schedule', async () => {
    const { wrapper } = await mountPrint('?kind=workplace&category=rmj')
    const sheet = wrapper.get('[data-record=a][data-page]')
    expect(sheet.get('[data-table="Table 1"]').text()).toContain('Judy')
    expect(sheet.findAll('[data-testid=workplace-schedule] tbody tr')).toHaveLength(4)
  })

  it('M10-T48: table assignments in three variants', async () => {
    const { wrapper } = await mountPrint('?kind=tables&round=r1&variant=teams')
    const page = () => wrapper.get('[data-page=table]')
    expect(pages(wrapper)).toEqual(['t1'])
    expect(
      page()
        .findAll('[data-team]')
        .map((t) => t.attributes('data-team')),
    ).toEqual(['Bravo', 'Alpha'])
    expect(page().find('[data-testid=table-judges]').exists()).toBe(false)
    await wrapper.get('[data-testid=print-variant]').setValue('judges')
    await flushPromises()
    expect(page().find('[data-testid=table-teams]').exists()).toBe(false)
    expect(page().get('[data-testid=table-judges]').text()).toContain('Judy')
    await wrapper.get('[data-testid=print-variant]').setValue('both')
    await flushPromises()
    expect(page().find('[data-testid=table-teams]').exists()).toBe(true)
    expect(page().find('[data-testid=table-judges]').exists()).toBe(true)
  })

  it('M10-T46: a judge is denied', async () => {
    mocked.getPrintData.mockRejectedValue(
      new ClientResponseError({
        status: 403,
        response: {
          message: 'Forbidden',
          data: { _error: { code: 'print_not_allowed', message: 'x' } },
        },
      }),
    )
    const { wrapper } = await mountPrint()
    expect(wrapper.text()).toContain(
      'Only event managers and head judges can use the print center.',
    )
    expect(wrapper.find('[data-page]').exists()).toBe(false)
  })
})
