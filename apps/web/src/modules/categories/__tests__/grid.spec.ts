import { describe, expect, it } from 'vitest'
import { buildGrid, categoryRulesState, cellLabel, gameRulesState } from '../grid'
import { game, phase, rme, rmj, rms, round, ruleset, sat, sun } from './gridFixtures'

describe('categories grid layout (M11-01, M11-03)', () => {
  it('M11-T01: one row per category, one column per round position', () => {
    const rounds = [
      round('rmj', 'R2', 2),
      round('rme', 'R1', 1),
      round('rme', 'R3', 3),
      round('rme', 'R2', 2),
      round('rmj', 'R1', 1),
    ]
    const grid = buildGrid({
      categories: [rms, rmj, rme],
      rounds,
      phases: [],
      gameRules: [],
      rulesets: [],
      days: [],
    })
    expect(grid.columns).toBe(3)
    expect(grid.rows.map((r) => r.category.code)).toEqual(['RM-E', 'RM-J', 'RM-S'])
    expect(grid.rows.map((r) => r.cells.map((c) => c.round.key))).toEqual([
      ['R1', 'R2', 'R3'],
      ['R1', 'R2'],
      [],
    ])
    expect(grid.rows[1]!.cells.map((c) => c.position)).toEqual([1, 2])
  })

  it('a cell shows the game only with several games, its start once timed, a non-default check', () => {
    const a = game('rmj', 'A', 1)
    const b = game('rmj', 'B', 2)
    const r1 = round('rmj', 'R1', 1, { game_rule: a.id, day: 'sat' })
    const r2 = round('rmj', 'R2', 2, { game_rule: b.id, day: 'sun', check_mode: 'off' })
    const grid = buildGrid({
      categories: [rmj],
      rounds: [r1, r2],
      phases: [phase(r1, 'sat', '09:00'), phase(r2, 'sun', '')],
      gameRules: [a, b],
      rulesets: [ruleset(a, 'published')],
      days: [sat, sun],
    })
    const [c1, c2] = grid.rows[0]!.cells
    expect(c1).toMatchObject({ showGame: true, startsAt: '09:00', checkMode: undefined })
    expect(c1!.game!.name).toBe('Game A')
    expect(c1!.day!.id).toBe('sat')
    expect(c2).toMatchObject({ startsAt: '', checkMode: 'off', rulesState: 'none' })
    expect(cellLabel(rmj, c2!)).toBe(
      'RM-J, round 2, R2 Run 2, Game B, Sunday, not timed, no published ruleset',
    )
    expect(cellLabel(rmj, c1!)).toBe('RM-J, round 1, R1 Run 1, Game A, Saturday, 09:00')
  })

  it('M11-T04: a category shows the worst state of its games', () => {
    const a = game('rmj', 'A')
    const b = game('rmj', 'B', 2)
    expect(gameRulesState(a.id, [ruleset(a, 'draft'), ruleset(a, 'published')])).toBe('published')
    expect(gameRulesState(a.id, [ruleset(a, 'draft')])).toBe('draft')
    expect(gameRulesState(a.id, [ruleset(b, 'published')])).toBe('none')
    expect(gameRulesState('', [])).toBe('none')
    expect(categoryRulesState([a, b], [ruleset(a, 'published'), ruleset(b, 'draft')])).toBe('draft')
    expect(categoryRulesState([a, b], [ruleset(a, 'draft')])).toBe('none')
    // A new category has no game yet.
    expect(categoryRulesState([], [])).toBe('none')
  })
})
