import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { buttonByText, click, fill, mountView } from '@/test/utils'
import * as api from '../api'
import * as rankingsApi from '@/modules/rankings/api'
import CategoryRoundsGrid from '../components/CategoryRoundsGrid.vue'
import { game, phase, rme, rmj, rms, round, ruleset, sat, sun } from './gridFixtures'

vi.mock('../api')
vi.mock('@/modules/rankings/api')
const mocked = vi.mocked(api)
const rankings = vi.mocked(rankingsApi)

const gE = game('rme', 'E')
const gJ = game('rmj', 'J')
const rmeRounds = [
  round('rme', 'R1', 1, { game_rule: gE.id, day: 'sat' }),
  round('rme', 'R2', 2, { game_rule: gE.id, day: 'sat' }),
  round('rme', 'R3', 3, { game_rule: gE.id, day: 'sun' }),
]
const rmjRounds = [
  round('rmj', 'R1', 1, { game_rule: gJ.id, day: 'sat' }),
  round('rmj', 'R2', 2, { name: 'Final', game_rule: gJ.id, day: 'sun' }),
]

function mockData() {
  mocked.listEventRounds.mockResolvedValue([...rmeRounds, ...rmjRounds])
  mocked.listEventScoringPhases.mockResolvedValue([
    phase(rmeRounds[0]!, 'sat', '09:00'),
    phase(rmeRounds[1]!, 'sat', '13:30'),
    phase(rmeRounds[2]!, 'sun', '10:00'),
    phase(rmjRounds[0]!, 'sat', ''),
    phase(rmjRounds[1]!, 'sun', ''),
  ])
  mocked.listEventGameRules.mockResolvedValue([gE, gJ])
  // RM-J has a draft only; RM-S has no game at all.
  mocked.listEventRulesetStates.mockResolvedValue([ruleset(gE, 'published'), ruleset(gJ, 'draft')])
  mocked.listEventDays.mockResolvedValue([sat, sun])
}

function mountGrid(props: Record<string, unknown> = {}) {
  return mountView(CategoryRoundsGrid, {
    props: {
      eventId: 'event1',
      categories: [rme, rmj, rms],
      editable: true,
      showRanking: true,
      ...props,
    },
  })
}

const rows = () => [...document.querySelectorAll('[data-testid=category-grid] tbody tr')]
const cellsOf = (code: string) =>
  [...document.querySelectorAll(`tr[data-category="${code}"] [data-testid=round-cell]`)].map((c) =>
    c.getAttribute('data-round'),
  )

describe('categories grid (M11-01 – M11-04)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockData()
  })
  afterEach(() => document.body.replaceChildren())

  it('M11-T01: rows per category, round columns, actions in each row', async () => {
    await mountGrid()
    expect(rows().map((r) => r.getAttribute('data-category'))).toEqual(['RM-E', 'RM-J', 'RM-S'])
    const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    expect(headers.slice(1, 4)).toEqual(['Round 1', 'Round 2', 'Round 3'])
    expect(cellsOf('RM-E')).toEqual(['R1', 'R2', 'R3'])
    expect(cellsOf('RM-J')).toEqual(['R1', 'R2'])
    expect(cellsOf('RM-S')).toEqual([])
    // "+ Round" in the first empty cell of each row.
    const add = (code: string) =>
      document.querySelector(`tr[data-category="${code}"] [data-testid=add-round]`)
    expect(add('RM-J')!.closest('td')!.getAttribute('data-col')).toBe('3')
    expect(add('RM-S')!.closest('td')!.getAttribute('data-col')).toBe('1')
    expect(add('RM-E')!.closest('td')!.getAttribute('data-col')).toBe('4')
    // Day and start, "–" when not timed.
    const rmeTime = document.querySelector('tr[data-category="RM-E"] [data-testid=cell-time]')
    expect(rmeTime!.textContent).toContain('09:00')
    const rmjTime = document.querySelector('tr[data-category="RM-J"] [data-testid=cell-time]')
    expect(rmjTime!.textContent).toContain('–')
    for (const row of rows()) {
      const code = row.getAttribute('data-category')
      expect(row.querySelector(`[aria-label="Rounds and ranking for ${code}"]`)).not.toBeNull()
      expect(row.querySelector('[data-testid=rules-link]')).not.toBeNull()
      expect(row.querySelector(`[aria-label="Edit ${code}"]`)).not.toBeNull()
      expect(row.querySelector(`[aria-label="More actions for ${code}"]`)).not.toBeNull()
    }
    // Links carry the way back (M11-08).
    const rules = rows()[0]!.querySelector('[data-testid=rules-link]')!
    expect(decodeURIComponent(rules.getAttribute('href')!)).toContain(
      'from=/events/event1?tab=categories',
    )
  })

  it('M11-T02: managers add, edit and delete rounds from the grid', async () => {
    rankings.createRound.mockResolvedValue(round('rms', 'R1', 1))
    rankings.updateRound.mockResolvedValue(rmjRounds[1]!)
    rankings.deleteRound.mockResolvedValue(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await mountGrid()
    expect(mocked.listEventRounds).toHaveBeenCalledTimes(1)

    await click(document.querySelector<HTMLElement>('[aria-label="Add a round to RM-S"]')!)
    const dialog = () => document.querySelector('[role=dialog]')
    expect(dialog()!.textContent).toContain('New round in RM-S')
    const input = (selector: string) => dialog()!.querySelector<HTMLInputElement>(selector)!
    await fill('[role=dialog] input[pattern]', 'R1')
    await fill(
      '[role=dialog] [data-testid=round-form] input[required]:not([pattern]):not([type=number])',
      'Run 1',
    )
    await click(buttonByText('Add round'))
    expect(rankings.createRound).toHaveBeenCalledWith(
      'rms',
      expect.objectContaining({ key: 'R1', name: 'Run 1', position: 1 }),
    )
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(mocked.listEventRounds).toHaveBeenCalledTimes(2)

    // Edit RM-J round 2: the form shows its values.
    await click(document.querySelector<HTMLElement>('tr[data-category="RM-J"] [data-round=R2]')!)
    expect(dialog()!.textContent).toContain('R2 Final in RM-J')
    expect(input('input[pattern]').value).toBe('R2')
    await click(buttonByText('Save round'))
    expect(rankings.updateRound).toHaveBeenCalledWith(
      'rmj-R2',
      expect.objectContaining({ key: 'R2', position: 2, day: 'sun' }),
    )
    await flushPromises()

    await click(document.querySelector<HTMLElement>('tr[data-category="RM-J"] [data-round=R2]')!)
    await click(dialog()!.querySelector<HTMLElement>('[data-testid=round-delete]')!)
    expect(rankings.deleteRound).toHaveBeenCalledWith('rmj-R2')
  })

  it('M11-T03: read-only for everyone else', async () => {
    await mountGrid({ editable: false, showRanking: false })
    expect(document.querySelector('[data-testid=add-round]')).toBeNull()
    expect(document.querySelector('[aria-label^="Edit"]')).toBeNull()
    expect(document.querySelector('[aria-label^="More actions"]')).toBeNull()
    const cell = document.querySelector<HTMLElement>('[data-testid=round-cell]')!
    expect(cell.tagName).toBe('DIV')
    await click(cell)
    expect(document.querySelector('[role=dialog]')).toBeNull()
    // The rules stay reachable.
    expect(document.querySelector('[data-testid=rules-link]')).not.toBeNull()
  })

  it('M11-T04: rules are highlighted with the reason; rounds of such games are marked', async () => {
    await mountGrid()
    const rules = (code: string) =>
      document.querySelector(`tr[data-category="${code}"] [data-testid=rules-link]`)!
    expect(rules('RM-E').textContent).not.toContain('·')
    expect(rules('RM-J').textContent).toContain('Draft only')
    expect(rules('RM-J').getAttribute('aria-label')).toBe('Scoring rules for RM-J: Draft only')
    expect(rules('RM-S').textContent).toContain('No published ruleset')
    expect(
      document.querySelectorAll('tr[data-category="RM-J"] [data-testid=cell-no-ruleset]'),
    ).toHaveLength(2)
    expect(
      document.querySelectorAll('tr[data-category="RM-E"] [data-testid=cell-no-ruleset]'),
    ).toHaveLength(0)
  })

  it('M11-T05: one tab stop, arrow keys between cells, Enter opens the round', async () => {
    await mountGrid()
    const tabStops = document.querySelectorAll('[data-testid=category-grid] [tabindex="0"]')
    expect(tabStops).toHaveLength(1)
    const first = tabStops[0] as HTMLElement
    first.focus()
    const key = async (k: string) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
      await flushPromises()
    }
    // Row header actions are the first four cells: Ranking, Rules, Edit, More.
    await key('ArrowDown')
    for (let i = 0; i < 5; i++) await key('ArrowRight')
    const cell = document.activeElement as HTMLElement
    expect(cell.getAttribute('aria-label')).toBe(
      'RM-J, round 2, R2 Final, Sunday, not timed, no published ruleset',
    )
    expect(cell.getAttribute('tabindex')).toBe('0')
    expect(document.querySelectorAll('[data-testid=category-grid] [tabindex="0"]')).toHaveLength(1)
    await key('End')
    expect(document.activeElement!.getAttribute('aria-label')).toBe('RM-J, round 4, no round')
    await key('Home')
    expect(document.activeElement!.getAttribute('aria-label')).toBe('Rounds and ranking for RM-J')
    await key('ArrowUp')
    await key('ArrowUp')
    expect(document.activeElement!.getAttribute('aria-label')).toBe('Rounds and ranking for RM-E')
    // Enter on a round button opens its form (the browser turns Enter into a click).
    for (let i = 0; i < 4; i++) await key('ArrowRight')
    await click(document.activeElement as HTMLElement)
    expect(document.querySelector('[role=dialog]')!.textContent).toContain('R1 Run 1 in RM-E')
  })

  it('M11-T06: below 768 px one card per category, rounds listed, actions below', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('max-width: 767px'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    try {
      await mountGrid()
      expect(document.querySelector('[data-testid=category-grid]')).toBeNull()
      const cards = [...document.querySelectorAll('[data-testid=category-cards] > li')]
      expect(cards.map((c) => c.getAttribute('data-category'))).toEqual(['RM-E', 'RM-J', 'RM-S'])
      expect(cards[1]!.querySelectorAll('[data-testid=round-cell]')).toHaveLength(2)
      expect(cards[2]!.textContent).toContain('No published ruleset')
      await click(buttonByText('Round', cards[2]!))
      expect(document.querySelector('[role=dialog]')!.textContent).toContain('New round in RM-S')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
