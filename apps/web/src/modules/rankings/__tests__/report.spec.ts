import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE_RANKING_CONFIG, rank } from '@judge26/ranking-engine'
import {
  buttonByText,
  click,
  makeCategory,
  makeEvent,
  makeGame,
  makeRound,
  makeTeam,
  mountView,
} from '@/test/utils'
import type { RankingSnapshotRecord } from '@/shared/types/records'
import * as api from '../api'
import * as scoringApi from '@/modules/scoring/api'
import { parseRankingConfig, toTeamInputs } from '../lib'
import RankingReportView from '../views/RankingReportView.vue'

vi.mock('../api')
vi.mock('@/modules/scoring/api')
const mocked = vi.mocked(api)

const rounds = [makeRound('R1', 1), makeRound('R2', 2), makeRound('R3', 3)]
const teams = [
  makeTeam({ id: 'alpha', name: 'Alpha', organization: 'School A' }),
  makeTeam({ id: 'bravo', name: 'Bravo', organization: 'School B' }),
]
const games = [
  makeGame({ team: 'alpha', round: 'round-R1', points: 100, time_ms: 60_000 }),
  makeGame({ team: 'bravo', round: 'round-R1', points: 120, time_ms: 50_000 }),
  makeGame({ team: 'bravo', round: 'round-R2', status: 'scheduled' }),
]
const category = makeCategory({
  name: 'RoboMission Elementary',
  code: 'RM-E',
  ranking: EXAMPLE_RANKING_CONFIG,
  expand: { event: makeEvent({ name: 'WRO Swiss Final', season: 2026, venue: 'Bern' }) },
})

const reportRows = () =>
  [...document.querySelectorAll('[data-testid=report-ranking] tbody tr')].map((r) =>
    [...r.querySelectorAll('td')].map((c) => c.textContent!.trim()),
  )

describe('ranking report (M7-07)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(scoringApi.getCategory).mockResolvedValue(category)
    mocked.listApprovedTeams.mockResolvedValue(teams)
    mocked.listRounds.mockResolvedValue(rounds)
    mocked.listGames.mockResolvedValue(games)
    mocked.listSnapshots.mockResolvedValue([])
  })
  afterEach(() => document.body.replaceChildren())

  it('M7-T06: shows the category and its live ranking, ready to print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { wrapper } = await mountView(RankingReportView, { props: { id: 'cat1' } })
    expect(wrapper.get('[data-testid=report-event]').text()).toBe(
      'WRO Swiss Final · Season 2026 · Bern',
    )
    expect(wrapper.get('[data-testid=report-category]').text()).toBe(
      'RoboMission Elementary (RM-E)',
    )
    expect(wrapper.get('[data-testid=report-title]').text()).toBe('Live ranking (provisional)')
    expect(wrapper.get('[data-testid=report-provisional]').text()).toContain('one game has')
    expect(reportRows()).toEqual([
      ['1', 'Bravo *', 'School B', '120', '50.000 s', '120'],
      ['2', 'Alpha *', 'School A', '100', '60.000 s', '100'],
    ])
    await click(buttonByText('Print / save as PDF'))
    expect(print).toHaveBeenCalledOnce()
  })

  it('prints a snapshot exactly as published', async () => {
    const config = parseRankingConfig(JSON.stringify(EXAMPLE_RANKING_CONFIG)).config!
    const inputs = toTeamInputs(teams, games.slice(0, 1), rounds)
    const snapshot = {
      id: 'snap1',
      collectionId: 's',
      collectionName: 'ranking_snapshots',
      created: '2026-06-01 16:00:00.000Z',
      updated: '',
      category: 'cat1',
      title: 'Official ranking day 1',
      config: EXAMPLE_RANKING_CONFIG,
      config_fingerprint: 'cfg',
      inputs,
      result: rank(config, inputs),
      fingerprint: 'abc123',
      created_by: '',
    } satisfies RankingSnapshotRecord
    mocked.listSnapshots.mockResolvedValue([snapshot])
    const { wrapper } = await mountView(RankingReportView, {
      props: { id: 'cat1', snapshot: 'snap1' },
    })
    expect(wrapper.get('[data-testid=report-title]').text()).toBe('Official ranking day 1')
    expect(wrapper.find('[data-testid=report-provisional]').exists()).toBe(false)
    expect(wrapper.get('[data-testid=report-fingerprint]').text()).toContain('abc123')
    expect(reportRows().map((r) => r.slice(0, 2))).toEqual([
      ['1', 'Alpha *'],
      ['2', 'Bravo *'],
    ])
    expect(mocked.listGames).not.toHaveBeenCalled()
  })

  it('explains a missing snapshot or configuration', async () => {
    const { wrapper } = await mountView(RankingReportView, {
      props: { id: 'cat1', snapshot: 'other' },
    })
    expect(wrapper.text()).toContain('This snapshot does not exist')
    document.body.replaceChildren()

    vi.mocked(scoringApi.getCategory).mockResolvedValue({ ...category, ranking: null })
    const second = await mountView(RankingReportView, { props: { id: 'cat1' } })
    expect(second.wrapper.text()).toContain('not configured')
    expect(buttonByText('Print / save as PDF').disabled).toBe(true)
  })
})
