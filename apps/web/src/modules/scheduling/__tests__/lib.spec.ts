import { describe, expect, it } from 'vitest'
import { makeGame, makeTable } from '@/test/utils'
import { gameLabel, isPlaced, reasonLabel, sortForSchedule } from '../lib'

describe('scheduling lib', () => {
  it('labels known unplaced reasons and passes unknown ones through', () => {
    expect(reasonLabel('no_compatible_table')).toMatch(/category/)
    expect(reasonLabel('something_new')).toBe('something_new')
  })

  it('sorts assigned games by table and sequence, then puts unassigned games last', () => {
    const games = [
      makeGame({ id: 'none' }),
      makeGame({ id: 'later', sequence: 2, table: 't1' }),
      makeGame({ id: 'second-table', sequence: 1, table: 't2' }),
      makeGame({ id: 'first', sequence: 1, table: 't1' }),
    ]
    expect(sortForSchedule(games).map((g) => g.id)).toEqual([
      'first',
      'later',
      'second-table',
      'none',
    ])
  })

  it('knows whether a game has a placement', () => {
    expect(isPlaced(makeGame({ table: 't1', sequence: 1 }))).toBe(true)
    expect(isPlaced(makeGame({ table: 't1' }))).toBe(false)
    expect(isPlaced(makeGame())).toBe(false)
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

  it('makeTable builds a table record with defaults', () => {
    expect(makeTable({ name: 'T9' })).toMatchObject({ name: 'T9', active: true, categories: [] })
  })
})
