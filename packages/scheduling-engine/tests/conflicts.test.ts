import { describe, expect, it } from 'vitest'
import { issuesForGame, validateSchedule } from '../src'
import { MIN, T0, at, breakAt, game, input, play, table } from './helpers'

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

describe('conflict detection', () => {
  it('M4-T01: a single game fits an available table', () => {
    const issues = validateSchedule(input({ games: [at('g1', 'T1', 0)] }))
    expect(issues).toEqual([])
  })

  it('M4-T02: two simultaneous games on one table are rejected', () => {
    const issues = validateSchedule(input({ games: [at('g1', 'T1', 0), at('g2', 'T1', 10)] }))
    expect(codes(issues)).toEqual(['table_conflict'])
    expect(issues[0]).toMatchObject({ field: 'table', gameId: 'g1', otherGameId: 'g2' })
  })

  it('adjacent games on one table do not overlap', () => {
    expect(validateSchedule(input({ games: [at('g1', 'T1', 0), at('g2', 'T1', 15)] }))).toEqual([])
  })

  it('M4-T03: one team in two simultaneous games is a conflict', () => {
    const games = [at('g1', 'T1', 0, { team: 'Alpha' }), at('g2', 'T2', 0, { team: 'Alpha' })]
    expect(codes(validateSchedule(input({ games })))).toEqual(['team_conflict'])
  })

  it('M4-T04: one judge in two overlapping games is a conflict', () => {
    const games = [
      at('g1', 'T1', 0, { judges: ['judge-1'] }),
      at('g2', 'T2', 10, { judges: ['judge-1'] }),
    ]
    const issues = validateSchedule(input({ games }))
    expect(codes(issues)).toEqual(['judge_conflict'])
    expect(issues[0]!.field).toBe('judges')
  })

  it('M4-T04: different judges on overlapping games are fine', () => {
    const games = [
      at('g1', 'T1', 0, { judges: ['judge-1'] }),
      at('g2', 'T2', 0, { judges: ['judge-2'] }),
    ]
    expect(validateSchedule(input({ games }))).toEqual([])
  })

  it('M4-T05: a game overlapping a lunch break is rejected', () => {
    const parts = input({
      periods: [play(0, 180), breakAt(60, 90)],
      games: [at('g1', 'T1', 50)],
    })
    expect(codes(validateSchedule(parts))).toEqual(['unavailable'])
    // Ending exactly when the break starts is allowed.
    expect(validateSchedule({ ...parts, games: [at('g1', 'T1', 45)] })).toEqual([])
  })

  it('M4-T06: a table restricted to other categories rejects the game', () => {
    const parts = input({
      tables: [table('T1', { categories: ['MS'] })],
      games: [at('g1', 'T1', 0, { category: 'RM' })],
    })
    expect(codes(validateSchedule(parts))).toEqual(['incompatible_category'])
    expect(validateSchedule({ ...parts, games: [at('g1', 'T1', 0, { category: 'MS' })] })).toEqual(
      [],
    )
  })

  it('M4-T07: the minimum rest interval between games of one team is respected', () => {
    const games = [
      at('g1', 'T1', 0, { team: 'Alpha' }),
      at('g2', 'T2', 20, { team: 'Alpha' }), // 5 minutes after g1 ends
    ]
    expect(codes(validateSchedule(input({ games, minRestMs: 10 * MIN })))).toEqual([
      'rest_interval',
    ])
    expect(validateSchedule(input({ games, minRestMs: 5 * MIN }))).toEqual([])
  })

  it('games must fit completely into an availability period', () => {
    const parts = input({ periods: [play(0, 30)], games: [at('g1', 'T1', 20)] })
    expect(codes(validateSchedule(parts))).toEqual(['outside_availability'])
  })

  it('a schedule without any availability period rejects every game', () => {
    expect(codes(validateSchedule(input({ periods: [], games: [at('g1', 'T1', 0)] })))).toEqual([
      'outside_availability',
    ])
  })

  it('inactive and unknown tables are reported', () => {
    const parts = input({
      tables: [table('T1', { active: false })],
      games: [at('g1', 'T1', 0), at('g2', 'missing', 0)],
    })
    expect(codes(validateSchedule(parts))).toEqual(['table_inactive', 'unknown_table'])
  })

  it('a table without a start time is reported; a start without a table is allowed', () => {
    const parts = input({
      games: [game('g1', { table: 'T1' }), game('g2', { start: T0 })],
    })
    expect(codes(validateSchedule(parts))).toEqual(['time_required'])
  })

  it('a time-only game still conflicts with its team', () => {
    const games = [
      game('g1', { team: 'Alpha', start: T0 }),
      game('g2', { team: 'Alpha', start: T0 + 5 * MIN }),
    ]
    expect(codes(validateSchedule(input({ games })))).toEqual(['team_conflict'])
  })

  it('issuesForGame checks one game against the others only', () => {
    const parts = input({
      games: [at('g1', 'T1', 0), at('g2', 'T1', 0), at('g3', 'T2', 60)],
    })
    expect(codes(issuesForGame(parts, 'g1'))).toEqual(['table_conflict'])
    expect(issuesForGame(parts, 'g3')).toEqual([])
    expect(issuesForGame(parts, 'unknown')).toEqual([])
  })

  it('issuesForGame ignores a stored copy of the same game', () => {
    const parts = input({ games: [at('g1', 'T1', 0), at('g1', 'T1', 0)] })
    expect(issuesForGame(parts, 'g1')).toEqual([])
  })

  it('M4-T11: moving a game to another table re-evaluates its conflicts', () => {
    const games = [at('g1', 'T1', 0), at('g2', 'T2', 0, { team: 'Beta' })]
    const moved = [at('g1', 'T2', 0), at('g2', 'T2', 0, { team: 'Beta' })]
    expect(validateSchedule(input({ games }))).toEqual([])
    expect(codes(validateSchedule(input({ games: moved })))).toEqual(['table_conflict'])
  })

  it('M4-T10: games on two days keep their absolute times', () => {
    const day2 = T0 + 24 * 60 * MIN
    const games = [game('g1', { table: 'T1', start: T0 }), game('g2', { table: 'T1', start: day2 })]
    const parts = input({
      periods: [
        { id: 'd1', kind: 'play', start: T0, end: T0 + 120 * MIN },
        { id: 'd2', kind: 'play', start: day2, end: day2 + 120 * MIN },
      ],
      games,
    })
    expect(validateSchedule(parts)).toEqual([])
    expect(parts.games[1]!.start).toBe(day2)
  })
})
