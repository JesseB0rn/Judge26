import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { EXAMPLE_RANKING_CONFIG } from '@judge26/ranking-engine'
import { EXAMPLE_RULESET } from '@judge26/scoring-engine'
import {
  buttonByText,
  click,
  fill,
  makeCategory,
  makeEvent,
  makeGame,
  makeRole,
  makeRound,
  makeTeam,
  mountView,
} from '@/test/utils'
import type { RankingSnapshotRecord, RulesetRecord } from '@/shared/types/records'
import * as api from '../api'
import * as scoringApi from '@/modules/scoring/api'
import RankingView from '../views/RankingView.vue'

vi.mock('../api')
vi.mock('@/modules/scoring/api')
const mocked = vi.mocked(api)

const manager = { roles: [makeRole('event_manager', 'event1')] }
const judge = { roles: [makeRole('judge', 'event1')] }
const rounds = [makeRound('R1', 1), makeRound('R2', 2), makeRound('R3', 3)]
const alpha = makeTeam({ id: 'alpha', name: 'Alpha' })
const bravo = makeTeam({ id: 'bravo', name: 'Bravo' })

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']
async function openTab(wrapper: Wrapper, name: string) {
  await wrapper
    .findAll('[role=tab]')
    .find((t) => t.text() === name)!
    .trigger('mousedown', { button: 0 })
  await flushPromises()
}
const rows = (wrapper: Wrapper) =>
  wrapper
    .findAll('[data-testid=ranking] [data-team]')
    .map((r) => [r.attributes('data-team'), r.get('[data-testid=rank]').text()])

const publishedRuleset = {
  id: 'rs1',
  version: 1,
  status: 'published',
  category: 'cat1',
  definition: EXAMPLE_RULESET,
} as unknown as RulesetRecord

describe('RankingView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(scoringApi.getCategory).mockResolvedValue(
      makeCategory({ ranking: EXAMPLE_RANKING_CONFIG, expand: { event: makeEvent() } }),
    )
    vi.mocked(scoringApi.listRulesets).mockResolvedValue([publishedRuleset])
    mocked.listRounds.mockResolvedValue(rounds)
    mocked.listApprovedTeams.mockResolvedValue([alpha, bravo])
    mocked.listGames.mockResolvedValue([
      makeGame({ team: 'alpha', round: 'round-R1', points: 100, time_ms: 120_000 }),
      makeGame({ team: 'alpha', round: 'round-R2', points: 80, time_ms: 90_000 }),
      makeGame({ team: 'alpha', round: 'round-R3', points: 100, time_ms: 110_000 }),
      makeGame({ team: 'bravo', round: 'round-R1', points: 100, time_ms: 100_000 }),
    ])
    mocked.listSnapshots.mockResolvedValue([])
  })
  afterEach(() => document.body.replaceChildren())

  it('M3-16: previews the live ranking with explanations', async () => {
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: judge })
    // Bravo: best 100 / 100 s beats Alpha's best 100 / 110 s (second key).
    expect(rows(wrapper)).toEqual([
      ['Bravo', '1'],
      ['Alpha', '2'],
    ])
    expect(wrapper.get('[data-team=Alpha]').text()).toContain('110.000 s')
    expect(wrapper.get('[data-team=Alpha]').text()).toContain('by Time of best')
    expect(wrapper.text()).toContain('(provisional)')

    await click(wrapper.get('button[aria-label="Explain Alpha"]').element as HTMLElement)
    const explanation = wrapper.get('[data-testid=explain-Alpha]').text()
    expect(explanation).toContain('BEST_BY(points ↓, time ↑) → R3')
    expect(explanation).toContain('ADD(100, 80, 100) = 280')
  })

  it('staff without management rights cannot edit', async () => {
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: judge })
    expect(wrapper.text()).not.toContain('Publish snapshot')
    await openTab(wrapper, 'Results')
    expect(wrapper.findAll('[data-testid=results-matrix] button')).toHaveLength(0)
    await openTab(wrapper, 'Configuration')
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
  })

  it('previews unsaved configuration changes and saves them', async () => {
    mocked.saveRankingConfig.mockImplementation(async (_id, ranking) => makeCategory({ ranking }))
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Configuration')
    await click(buttonByText('Generate from rounds'))
    expect(wrapper.find('[data-testid=config-valid]').exists()).toBe(true)
    await openTab(wrapper, 'Ranking')
    expect(wrapper.text()).toContain('Preview with unsaved configuration changes')
    // Total of all rounds: Alpha 280, Bravo 100.
    expect(rows(wrapper)).toEqual([
      ['Alpha', '1'],
      ['Bravo', '2'],
    ])
    expect(buttonByText('Publish snapshot').disabled).toBe(true)

    await openTab(wrapper, 'Configuration')
    await click(buttonByText('Save configuration'))
    expect(mocked.saveRankingConfig).toHaveBeenCalledWith(
      'cat1',
      expect.objectContaining({ calculations: [expect.objectContaining({ id: 'total' })] }),
    )
  })

  it('reports invalid configurations and unknown rounds', async () => {
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Configuration')
    await wrapper.get('textarea').setValue('{"schemaVersion": 1}')
    expect(wrapper.get('[data-testid=config-issues]').text()).toContain('$.rounds')
    expect(buttonByText('Save configuration').disabled).toBe(true)
    await click(buttonByText('Load example'))
    mocked.listRounds.mockResolvedValue([])
    const other = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(other.wrapper, 'Configuration')
    expect(other.wrapper.text()).toContain('rounds that do not exist yet: R1, R2, R3')
  })

  it('M3-17: publishes and shows snapshots', async () => {
    const snapshot = {
      id: 'snap1',
      title: 'Day 1',
      created: '2026-06-13 18:00:00.000Z',
      fingerprint: '0123456789abcdef',
      config_fingerprint: 'fedcba9876543210',
      config: EXAMPLE_RANKING_CONFIG,
      result: {
        keys: [{ label: 'Best', field: 'points', order: 'desc' }],
        entries: [],
        issues: [],
      },
    } as unknown as RankingSnapshotRecord
    mocked.createSnapshot.mockResolvedValue(snapshot)
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await fill('input[aria-label="Snapshot title"]', 'Day 1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocked.createSnapshot).toHaveBeenCalledWith('cat1', 'Day 1')
    expect(wrapper.get('[data-testid=snapshot-fingerprint]').text()).toContain('0123456789abcdef')
  })

  it('records results manually and with the score sheet', async () => {
    mocked.saveGame.mockResolvedValue(makeGame())
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Results')
    expect(wrapper.get('[data-team=Alpha] [data-round=R3]').text()).toContain('100 / 110.000 s')

    // Bravo has no R2 result yet: score with the ruleset (default when one is published).
    await click(
      wrapper.get('button[aria-label="Results of Bravo in Round 2"]').element as HTMLElement,
    )
    const dialog = () => document.querySelector('[role=dialog]')!
    expect(dialog().querySelector('[data-testid=score-sheet]')).not.toBeNull()
    expect(buttonByText('Save result', dialog()).disabled).toBe(true) // required criteria missing
    await click(buttonByText('Yes (+10)', dialog()))
    await click(
      dialog().querySelector<HTMLElement>('[data-node=blocks] button[aria-label=Increase]')!,
    )
    await click(buttonByText('Yes (+15)', dialog()))
    await click(buttonByText('Two levels', dialog()))
    await fill('[role=dialog] input[placeholder="e.g. 95.37"]', '88.5')
    await click(buttonByText('Save result', dialog()))
    expect(mocked.saveGame).toHaveBeenCalledWith(undefined, {
      round: 'round-R2',
      team: 'bravo',
      attempt: 1,
      status: 'completed',
      points: 0,
      time_ms: 88_500,
      ruleset: 'rs1',
      values: { flag: true, blocks: 1, parkFull: true, tower: 'two' },
    })

    // Manual entry for a disqualification.
    await click(
      wrapper.get('button[aria-label="Results of Bravo in Round 3"]').element as HTMLElement,
    )
    const status = dialog().querySelectorAll('select')[1] as HTMLSelectElement
    status.value = 'disqualified'
    status.dispatchEvent(new Event('change'))
    await flushPromises()
    await click(buttonByText('Save result', dialog()))
    expect(mocked.saveGame).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ status: 'disqualified', time_ms: 0, ruleset: '' }),
    )
  })

  it('edits and deletes existing attempts; adds new attempts', async () => {
    mocked.saveGame.mockResolvedValue(makeGame())
    mocked.deleteGame.mockResolvedValue(true)
    vi.mocked(scoringApi.listRulesets).mockResolvedValue([])
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Results')
    await click(
      wrapper.get('button[aria-label="Results of Alpha in Round 1"]').element as HTMLElement,
    )
    const dialog = () => document.querySelector('[role=dialog]')!
    expect((dialog().querySelector('input[type=number]') as HTMLInputElement).value).toBe('100')
    await fill('[role=dialog] input[type=number]', '105')
    await click(buttonByText('Save result', dialog()))
    expect(mocked.saveGame).toHaveBeenCalledWith(
      expect.stringMatching(/^game-/),
      expect.objectContaining({ points: 105, time_ms: 120_000, attempt: 1 }),
    )

    await click(
      wrapper.get('button[aria-label="Results of Alpha in Round 1"]').element as HTMLElement,
    )
    const attempt = dialog().querySelector('select') as HTMLSelectElement
    attempt.value = 'new'
    attempt.dispatchEvent(new Event('change'))
    await flushPromises()
    await fill('[role=dialog] input[type=number]', '7')
    await click(buttonByText('Save result', dialog()))
    expect(mocked.saveGame).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ attempt: 2, points: 7 }),
    )

    await click(
      wrapper.get('button[aria-label="Results of Alpha in Round 1"]').element as HTMLElement,
    )
    await click(buttonByText('Delete attempt', dialog()))
    expect(mocked.deleteGame).toHaveBeenCalled()
  })

  it('manages rounds', async () => {
    mocked.createRound.mockResolvedValue(makeRound('R4', 4))
    mocked.deleteRound.mockResolvedValue(true)
    const { wrapper } = await mountView(RankingView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Rounds')
    expect(wrapper.get('[data-testid=rounds]').text()).toContain('Round 3')
    await fill('input[pattern]', 'R4')
    await fill('input[required]:not([pattern])', 'Final')
    const forms = wrapper.findAll('form')
    await forms[forms.length - 1]!.trigger('submit')
    await flushPromises()
    expect(mocked.createRound).toHaveBeenCalledWith('cat1', {
      key: 'R4',
      name: 'Final',
      position: 4,
    })
    await click(wrapper.get('button[aria-label="Delete Round 1"]').element as HTMLElement)
    expect(mocked.deleteRound).toHaveBeenCalledWith('round-R1')
  })

  it('templates only show rounds and configuration', async () => {
    vi.mocked(scoringApi.getCategory).mockResolvedValue(makeCategory({ event: '', ranking: null }))
    const { wrapper } = await mountView(RankingView, {
      props: { id: 'cat1' },
      session: { roles: [makeRole('admin')] },
    })
    expect(wrapper.findAll('[role=tab]').map((t) => t.text())).toEqual(['Rounds', 'Configuration'])
    expect(mocked.listGames).not.toHaveBeenCalled()
  })
})
