import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeRole, mountView } from '@/test/utils'
import type { TeamDocumentRecord } from '@/shared/types/records'
import * as api from '../api'
import * as documents from '@/modules/teams/documents'
import { cacheAssignments, cachedAssignments, finishedChecks, setCheckFinished } from '../drafts'
import {
  buildTimeline,
  dayOptions,
  filterChecks,
  isCheckDone,
  nextUp,
  robotChecks,
  timeRange,
} from '../lib'
import JudgeDashboardView from '../views/JudgeDashboardView.vue'
import RobotCheckView from '../views/RobotCheckView.vue'
import { makeAssignment } from './fixtures'

vi.mock('../api')
vi.mock('@/modules/teams/documents', async (original) => ({
  ...(await original<typeof documents>()),
  listTeamDocuments: vi.fn<typeof documents.listTeamDocuments>(),
}))
vi.mock('@/shared/composables/useFileToken', () => ({
  useFileToken: () => ({ token: ref('tok'), refresh: vi.fn<() => Promise<string>>() }),
}))
const mocked = vi.mocked(api)
const mockedDocs = vi.mocked(documents)

const sat = { id: 'sat', date: '2026-06-13', label: 'Saturday' }
const fri = { id: 'fri', date: '2026-06-12', label: 'Friday' }
const tA = { id: 'tA', name: 'Table A' }
const tB = { id: 'tB', name: 'Table B' }
const check = { day: fri, starts_at: '16:00', duration_minutes: 20 }

const rows = [
  makeAssignment({
    id: 'g2',
    team: { id: 'b', name: 'Bravo' },
    day: sat,
    table: tA,
    sequence: 2,
    check,
  }),
  makeAssignment({
    id: 'g1',
    team: { id: 'a', name: 'Alpha' },
    day: sat,
    table: tA,
    sequence: 1,
    check,
  }),
  // Second attempt of Alpha: listed once.
  makeAssignment({
    id: 'g1b',
    team: { id: 'a', name: 'Alpha' },
    day: sat,
    table: tA,
    sequence: 3,
    attempt: 2,
    check,
  }),
  makeAssignment({
    id: 'g3',
    team: { id: 'c', name: 'Charlie' },
    day: sat,
    table: tB,
    sequence: 1,
    check,
  }),
  // A round without a robot check.
  makeAssignment({
    id: 'g4',
    round: { id: 'r2', key: 'R2', name: 'Round 2', position: 2 },
    team: { id: 'a', name: 'Alpha' },
    day: sat,
    table: tA,
    sequence: 1,
  }),
]

const doc = (id: string, team: string, title: string, file: string): TeamDocumentRecord => ({
  id,
  collectionId: 'team_documents',
  collectionName: 'team_documents',
  created: '2026-01-01 00:00:00.000Z',
  updated: '2026-01-01 00:00:00.000Z',
  team,
  title,
  file,
  uploaded_by: 'm',
})

describe('robot check helpers (M5-15)', () => {
  it('builds one block per round and table with each team once, in playing order', () => {
    const blocks = robotChecks(rows)
    expect(blocks.map((b) => b.key)).toEqual(['r1:tA', 'r1:tB'])
    expect(blocks[0]!.teams.map((t) => [t.name, t.sequence, t.game])).toEqual([
      ['Alpha', 1, 'g1'],
      ['Bravo', 2, 'g2'],
    ])
  })

  it('formats time ranges and leaves unplaced checks empty', () => {
    expect(timeRange('08:30', 15)).toBe('08:30–08:45')
    expect(timeRange('23:50', 20)).toBe('23:50–00:10')
    expect(timeRange('', 10)).toBe('')
  })

  it('filters by the check’s own day and offers that day as a filter', () => {
    const blocks = robotChecks(rows)
    expect(filterChecks(blocks, { day: 'fri', table: '' })).toHaveLength(2)
    expect(filterChecks(blocks, { day: 'sat', table: '' })).toHaveLength(0)
    expect(filterChecks(blocks, { day: '', table: 'tB' }).map((b) => b.key)).toEqual(['r1:tB'])
    expect(dayOptions(rows).map((d) => d.value)).toEqual(['fri', 'sat'])
  })
})

const judge = { roles: [makeRole('judge', 'event1')] }

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocked.listAssignments.mockResolvedValue(rows)
  mockedDocs.listTeamDocuments.mockResolvedValue([
    doc('d1', 'a', 'Robot description', 'robot_abc.pdf'),
    doc('d2', 'a', 'Robot photo', 'photo_abc.jpg'),
  ])
})
afterEach(() => document.body.replaceChildren())

// Round 1 (no check) on Saturday, round 2 with a check on Friday evening and its games on Sunday.
const r1 = { id: 'r1', key: 'R1', name: 'Round 1', position: 1 }
const r2 = { id: 'r2', key: 'R2', name: 'Round 2', position: 2 }
const sun = { id: 'sun', date: '2026-06-14', label: 'Sunday' }
const final = {
  status: 'finalized' as const,
  outcome: 'completed' as const,
  points: 40,
  time_ms: 1000,
  updated: '',
}
const r2check = { day: sat, starts_at: '17:00', duration_minutes: 20 }
const schedule = [
  makeAssignment({
    id: 'a1',
    round: r1,
    team: { id: 'a', name: 'Alpha' },
    day: sat,
    table: tA,
    sequence: 1,
    sheet: final,
  }),
  makeAssignment({
    id: 'b1',
    round: r1,
    team: { id: 'b', name: 'Bravo' },
    day: sat,
    table: tA,
    sequence: 2,
  }),
  makeAssignment({
    id: 'a2',
    round: r2,
    team: { id: 'a', name: 'Alpha' },
    day: sun,
    table: tA,
    sequence: 1,
    check: r2check,
  }),
  makeAssignment({
    id: 'b2',
    round: r2,
    team: { id: 'b', name: 'Bravo' },
    day: sun,
    table: tA,
    sequence: 2,
    check: r2check,
  }),
]

describe('timeline (M5-15)', () => {
  const keys = (list: typeof schedule) => buildTimeline(list, robotChecks(list)).map((e) => e.key)

  it('puts each round’s robot check right before that round’s games', () => {
    expect(keys(rows)).toEqual(['check:r1:tA', 'check:r1:tB', 'sat:r1', 'sat:r2'])
    expect(keys(schedule)).toEqual(['sat:r1', 'check:r2:tA', 'sun:r2'])
  })

  it('orders by the round even if the check is on an earlier day than the previous round', () => {
    const early = schedule.map((r) => (r.check ? { ...r, check: { ...r2check, day: fri } } : r))
    expect(keys(early)).toEqual(['sat:r1', 'check:r2:tA', 'sun:r2'])
  })

  it('next up is the open robot check before the round’s first game', () => {
    const done = (finished: string[]) => (b: Parameters<typeof isCheckDone>[0]) =>
      isCheckDone(b, schedule, finished)
    const scored = schedule.map((r) => (r.id === 'b1' ? { ...r, sheet: final } : r))
    const entries = buildTimeline(scored, robotChecks(scored))
    const doneIn = (finished: string[]) => (b: Parameters<typeof isCheckDone>[0]) =>
      isCheckDone(b, scored, finished)
    expect(nextUp(buildTimeline(schedule, robotChecks(schedule)), done([]))).toMatchObject({
      kind: 'game',
      row: { id: 'b1' },
    })
    expect(nextUp(entries, doneIn([]))).toMatchObject({ kind: 'check', block: { key: 'r2:tA' } })
    expect(nextUp(entries, doneIn(['r2:tA']))).toMatchObject({ kind: 'game', row: { id: 'a2' } })
  })

  it('a check counts as done once scoring of its round started at that table', () => {
    const started = schedule.map((r) =>
      r.id === 'a2' ? { ...r, sheet: { ...final, status: 'draft' as const } } : r,
    )
    expect(isCheckDone(robotChecks(started)[0]!, started, [])).toBe(true)
    expect(isCheckDone(robotChecks(schedule)[0]!, schedule, [])).toBe(false)
  })
})

describe('JudgeDashboardView robot checks', () => {
  const order = (w: Awaited<ReturnType<typeof mountView>>['wrapper']) =>
    w
      .findAll('[data-game], [data-check]')
      .map((el) => el.attributes('data-game') ?? `check:${el.attributes('data-check')}`)

  it('M5-15: shows each robot check in the timeline right before its round’s games', async () => {
    mocked.listAssignments.mockResolvedValue(schedule)
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(order(wrapper)).toEqual(['a1', 'b1', 'check:r2:tA', 'a2', 'b2'])
    const check = wrapper.get('[data-check="r2:tA"]')
    expect(check.text()).toContain('Robot check · Round 2 · RM-J')
    expect(check.text()).toContain('Saturday · 17:00–17:20')
    expect(check.text()).toContain('2 teams')
    expect(check.attributes('href')).toContain('table=tA')
  })

  it('M5-T15: up next is the robot check once the previous round is scored', async () => {
    const scored = schedule.map((r) => (r.id === 'b1' ? { ...r, sheet: final } : r))
    mocked.listAssignments.mockResolvedValue(scored)
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    const next = wrapper.get('[data-testid=up-next]')
    expect(next.text()).toContain('Robot check · Round 2')
    expect(next.attributes('href')).toContain('judging-check')
    expect(wrapper.get('[data-check="r2:tA"]').classes()).toContain('bg-sky-50/70')
  })

  it('moves on to the round’s first game once the check is finished', async () => {
    const scored = schedule.map((r) => (r.id === 'b1' ? { ...r, sheet: final } : r))
    mocked.listAssignments.mockResolvedValue(scored)
    setCheckFinished('user1', 'r2:tA', true)
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    const next = wrapper.get('[data-testid=up-next]')
    expect(next.text()).toContain('Alpha')
    expect(next.attributes('href')).toContain('a2')
    expect(wrapper.get('[data-check="r2:tA"]').attributes('data-done')).toBe('true')
  })

  it('without robot checks the timeline is just the games', async () => {
    mocked.listAssignments.mockResolvedValue([rows[4]!])
    const { wrapper } = await mountView(JudgeDashboardView, { session: judge })
    expect(wrapper.find('[data-check]').exists()).toBe(false)
  })
})

describe('RobotCheckView (M5-15)', () => {
  const mountCheck = (query = '?table=tA') =>
    mountView(RobotCheckView, {
      session: judge,
      props: { roundId: 'r1' },
      path: `/judging/rounds/r1/check${query}`,
    })

  it('steps through the teams in playing order and shows each team’s documents', async () => {
    const { wrapper, router } = await mountCheck()
    expect(mockedDocs.listTeamDocuments).toHaveBeenCalledWith(['a', 'b'])
    const current = () => wrapper.get('[data-testid=check-current]')
    expect(current().text()).toContain('Alpha')
    expect(current().text()).toContain('Team 1 of 2')
    expect(
      current()
        .findAll('[data-document]')
        .map((d) => d.attributes('data-document')),
    ).toEqual(['Robot description', 'Robot photo'])
    expect(current().find('iframe').attributes('src')).toContain('token=tok')
    expect(current().find('img').attributes('src')).toContain('photo_abc.jpg')

    await click(wrapper.get('[data-testid=check-next]').element as HTMLElement)
    expect(current().text()).toContain('Bravo')
    expect(router.currentRoute.value.query.team).toBe('b')
    expect(current().find('[data-testid=no-documents]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=check-next]').exists()).toBe(false)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await new Promise((r) => setTimeout(r))
    expect(current().text()).toContain('Alpha')
  })

  it('finishing the check on the last team marks it done and returns to the dashboard', async () => {
    const { wrapper, router } = await mountCheck('?table=tA&team=b&from=/judging?day=fri')
    await click(wrapper.get('[data-testid=check-finish]').element as HTMLElement)
    expect(finishedChecks('user1')).toEqual(['r1:tA'])
    expect(router.currentRoute.value.fullPath).toBe('/judging?day=fri')
  })

  it('a finished check can be reopened', async () => {
    setCheckFinished('user1', 'r1:tA', true)
    const { wrapper } = await mountCheck('?table=tA&team=b')
    expect(wrapper.get('[data-testid=check-done]').text()).toContain('You finished')
    await click(buttonByText('Mark as not done'))
    expect(finishedChecks('user1')).toEqual([])
    expect(wrapper.find('[data-testid=check-finish]').exists()).toBe(true)
  })

  it('opens the team from the URL and links to its score sheet', async () => {
    const { wrapper } = await mountCheck('?table=tA&team=b')
    const current = wrapper.get('[data-testid=check-current]')
    expect(current.text()).toContain('Bravo')
    expect(current.get('a[href*=g2]').text()).toContain('Score')
  })

  it('says so when the round has no robot check at the judge’s table', async () => {
    const { wrapper } = await mountView(RobotCheckView, {
      session: judge,
      props: { roundId: 'r2' },
      path: '/judging/rounds/r2/check',
    })
    expect(wrapper.find('[data-testid=no-check]').exists()).toBe(true)
  })

  it('falls back to the teams saved on this device when offline', async () => {
    cacheAssignments('user1', rows)
    mocked.listAssignments.mockRejectedValue(new ClientResponseError({ status: 0 }))
    mockedDocs.listTeamDocuments.mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountView(RobotCheckView, {
      session: { roles: judge.roles },
      props: { roundId: 'r1' },
      path: '/judging/rounds/r1/check?table=tB',
    })
    expect(wrapper.text()).toContain('No connection')
    expect(wrapper.get('[data-testid=check-current]').text()).toContain('Charlie')
    // M9-06: recording the program needs a connection.
    expect(wrapper.find('#program-g3').exists()).toBe(false)
  })

  it('M9-06: the judge records the program the current team will run', async () => {
    mocked.setProgram.mockResolvedValue({ program_name: 'mission_v3' })
    const { wrapper } = await mountCheck('?table=tA&team=b')
    const current = wrapper.get('[data-testid=check-current]')
    expect(current.get('[data-testid=program-name]').text()).toContain('Program')
    await fill('#program-g2', ' mission_v3 ')
    await click(buttonByText('Save', current.element))
    expect(mocked.setProgram).toHaveBeenCalledWith('g2', 'mission_v3')
    expect(current.find('[data-testid=program-saved]').exists()).toBe(true)
    expect(cachedAssignments('user1')?.find((r) => r.id === 'g2')?.program_name).toBe('mission_v3')

    // The next team starts with its own (empty) program.
    await click(wrapper.get('[data-testid=check-prev]').element as HTMLElement)
    expect((document.querySelector('#program-g1') as HTMLInputElement).value).toBe('')
  })
})
