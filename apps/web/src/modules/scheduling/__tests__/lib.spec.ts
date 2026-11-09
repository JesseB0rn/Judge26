import { describe, expect, it } from 'vitest'
import { makeGame, makeTable } from '@/test/utils'
import {
  gameLabel,
  isPlaced,
  isValidPeriod,
  judgeNames,
  reasonLabel,
  sortForSchedule,
} from '../lib'

describe('scheduling lib', () => {
  it('labels known unplaced reasons and passes unknown ones through', () => {
    expect(reasonLabel('no_compatible_table')).toMatch(/category/)
    expect(reasonLabel('something_new')).toBe('something_new')
  })

  it('sorts placed games by time, then table, and puts unplaced games last', () => {
    const games = [
      makeGame({ id: 'none' }),
      makeGame({ id: 'late', starts_at: '2026-11-14 10:00:00.000Z', table: 't1' }),
      makeGame({ id: 'b', starts_at: '2026-11-14 09:00:00.000Z', table: 'tB' }),
      makeGame({ id: 'a', starts_at: '2026-11-14 09:00:00.000Z', table: 'tA' }),
    ]
    expect(sortForSchedule(games).map((g) => g.id)).toEqual(['a', 'b', 'late', 'none'])
  })

  it('knows whether a game has a placement', () => {
    expect(isPlaced(makeGame({ table: 't1' }))).toBe(true)
    expect(isPlaced(makeGame({ starts_at: '2026-11-14 09:00:00.000Z' }))).toBe(true)
    expect(isPlaced(makeGame())).toBe(false)
  })

  it('names judges and falls back for unknown ones', () => {
    const judges = [{ id: 'j1', name: 'Grace' }]
    expect(judgeNames([], judges)).toBe('–')
    expect(judgeNames(['j1', 'x'], judges)).toBe('Grace, Unknown judge')
  })

  it('labels a game by team and round when expanded', () => {
    expect(gameLabel(makeGame())).toBe('Unknown team')
    expect(
      gameLabel(
        makeGame({
          expand: { team: { name: 'Alpha' } as never, round: { name: 'Round 1' } as never },
        }),
      ),
    ).toBe('Alpha (Round 1)')
  })

  it('accepts only periods that end after they start', () => {
    expect(isValidPeriod('2026-11-14 09:00:00.000Z', '2026-11-14 10:00:00.000Z')).toBe(true)
    expect(isValidPeriod('2026-11-14 10:00:00.000Z', '2026-11-14 09:00:00.000Z')).toBe(false)
    expect(isValidPeriod('', '2026-11-14 09:00:00.000Z')).toBe(false)
  })

  it('makeTable builds a table record with defaults', () => {
    expect(makeTable({ name: 'T9' })).toMatchObject({ name: 'T9', active: true, categories: [] })
  })
})
