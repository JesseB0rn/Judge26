import { describe, expect, it } from 'vitest'
import { generateSchedule, validateSchedule, type GenerationResult, type Placement } from '../src'
import { MIN, T0, at, breakAt, game, input, play, table } from './helpers'

/** Applies complete placements to the games and returns the resulting schedule input. */
function apply(parts: ReturnType<typeof input>, result: GenerationResult) {
  if (result.status !== 'complete') throw new Error(`expected complete, got ${result.status}`)
  const byId = new Map(result.placements.map((p: Placement) => [p.gameId, p]))
  return {
    ...parts,
    games: parts.games.map((g) => {
      const p = byId.get(g.id)
      return p ? { ...g, table: p.table, start: p.start } : g
    }),
  }
}

describe('scheduler', () => {
  it('M4-F01 (fairness fixture): 12 teams, 3 tables, 2 rounds, 15 min games, 120 min', () => {
    const tables = [table('T1'), table('T2'), table('T3')]
    const games = []
    for (let round = 1; round <= 2; round++) {
      for (let team = 1; team <= 12; team++) {
        games.push(game(`R${round}-${team}`, { team: `team-${team}` }))
      }
    }
    const parts = input({ tables, periods: [play(0, 120)], games })
    const result = generateSchedule(parts)
    expect(result.status).toBe('complete')
    const scheduled = apply(parts, result)

    expect(scheduled.games).toHaveLength(24)
    expect(validateSchedule(scheduled)).toEqual([])

    const starts = new Set(scheduled.games.map((g) => g.start))
    expect(starts.size).toBe(8)
    for (const start of starts) {
      expect(scheduled.games.filter((g) => g.start === start)).toHaveLength(3)
    }
    for (let team = 1; team <= 12; team++) {
      expect(scheduled.games.filter((g) => g.team === `team-${team}`)).toHaveLength(2)
    }
  })

  it('M4-T08: insufficient capacity yields a clear infeasibility report', () => {
    // Three games of 15 min need 45 min on one table, but only 30 min are available.
    const parts = input({
      tables: [table('T1')],
      periods: [play(0, 30)],
      games: [game('g1'), game('g2'), game('g3')],
    })
    const result = generateSchedule(parts)
    expect(result.status).toBe('infeasible')
    if (result.status !== 'infeasible') return
    expect(result.placedCount).toBe(2)
    expect(result.unplaced.map((u) => u.gameId)).toEqual(['g3'])
    expect(result.message).toMatch(/Only 2 of 3 games fit/)
  })

  it('a game without any compatible table is reported with its reason', () => {
    const parts = input({
      tables: [table('T1', { categories: ['MS'] })],
      games: [game('g1', { category: 'RM' })],
    })
    const result = generateSchedule(parts)
    expect(result).toMatchObject({
      status: 'infeasible',
      unplaced: [{ gameId: 'g1', reasons: ['no_compatible_table'] }],
    })
  })

  it('a game longer than every play period is reported', () => {
    const parts = input({ periods: [play(0, 10)], games: [game('g1')] })
    expect(generateSchedule(parts)).toMatchObject({
      status: 'infeasible',
      unplaced: [{ gameId: 'g1', reasons: ['no_availability_long_enough'] }],
    })
  })

  it('a game blocked only by locked games or breaks is explained as such', () => {
    const parts = input({
      tables: [table('T1')],
      periods: [play(0, 15), breakAt(0, 15)],
      games: [game('g1')],
    })
    const result = generateSchedule(parts)
    expect(result).toMatchObject({
      status: 'infeasible',
      unplaced: [{ gameId: 'g1', reasons: ['blocked_by_locked_games_or_breaks'] }],
    })
  })

  it('M4-T09: regeneration keeps locked games unchanged', () => {
    const parts = input({
      tables: [table('T1'), table('T2')],
      periods: [play(0, 60)],
      games: [
        at('locked', 'T1', 0, { locked: true, team: 'Alpha' }),
        game('free1', { team: 'Beta' }),
        game('free2', { team: 'Gamma' }),
      ],
    })
    const result = generateSchedule(parts)
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    expect(result.placements.map((p) => p.gameId).sort()).toEqual(['free1', 'free2'])
    const scheduled = apply(parts, result)
    expect(scheduled.games[0]).toMatchObject({ id: 'locked', table: 'T1', start: T0 })
    expect(validateSchedule(scheduled)).toEqual([])
  })

  it('M4-T09: locked games that already conflict are reported, not silently moved', () => {
    const parts = input({
      games: [at('a', 'T1', 0, { locked: true }), at('b', 'T1', 0, { locked: true })],
    })
    expect(generateSchedule(parts)).toMatchObject({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'table_conflict' })],
    })
  })

  it('M4-T09: generation with only locked games returns an empty placement list', () => {
    const parts = input({ games: [at('a', 'T1', 0, { locked: true })] })
    expect(generateSchedule(parts)).toEqual({ status: 'complete', placements: [] })
  })

  it('M4-T07: generated placements respect the minimum rest interval', () => {
    const parts = input({
      tables: [table('T1'), table('T2')],
      periods: [play(0, 60)],
      minRestMs: 15 * MIN,
      games: [game('g1', { team: 'Alpha' }), game('g2', { team: 'Alpha' })],
    })
    const scheduled = apply(parts, generateSchedule(parts))
    expect(validateSchedule(scheduled)).toEqual([])
    const [a, b] = scheduled.games
    expect(Math.abs(a!.start! - b!.start!)).toBeGreaterThanOrEqual(30 * MIN)
  })

  it('judges are never double-booked by generation', () => {
    const parts = input({
      tables: [table('T1'), table('T2')],
      periods: [play(0, 30)],
      games: [game('g1', { team: 'A', judges: ['j'] }), game('g2', { team: 'B', judges: ['j'] })],
    })
    const result = generateSchedule(parts)
    expect(result.status).toBe('complete')
    expect(validateSchedule(apply(parts, result))).toEqual([])
  })

  it('reports limit_reached when the search budget is exhausted', () => {
    const parts = input({
      tables: [table('T1')],
      periods: [play(0, 15)],
      games: [game('g1', { team: 'A' }), game('g2', { team: 'B' })],
    })
    const result = generateSchedule(parts, { maxNodes: 0 })
    expect(result.status).toBe('limit_reached')
  })

  it('uses the given grid step', () => {
    const parts = input({
      tables: [table('T1')],
      periods: [play(0, 40)],
      games: [game('g1', { team: 'A' }), game('g2', { team: 'B' })],
    })
    const result = generateSchedule(parts, { stepMs: 20 * MIN })
    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    expect(result.placements.map((p) => p.start - T0).sort((a, b) => a - b)).toEqual([0, 20 * MIN])
  })

  it('returns no placements for an empty set of unlocked games', () => {
    expect(generateSchedule(input({ games: [] }))).toEqual({ status: 'complete', placements: [] })
  })

  it('rejects non-positive durations and grid steps', () => {
    expect(() => generateSchedule(input({ games: [game('g1', { durationMs: 0 })] }))).toThrow(
      /positive/,
    )
    expect(() => generateSchedule(input({ games: [game('g1')] }), { stepMs: 0 })).toThrow(
      /positive/,
    )
  })
})
