import { describe, expect, it } from 'vitest'
import type { Board, BoardGame, BoardTable } from '../api'
import {
  dividerMove,
  endOf,
  expectedForMove,
  groupTables,
  judgeConflicts,
  judgeSlots,
  roundCount,
  teamsOn,
  unassignedJudges,
  unassignedTeams,
} from '../lib'

const table = (id: string, category: string, judges: string[] = []): BoardTable => ({
  id,
  name: id.toUpperCase(),
  position: 0,
  active: true,
  category,
  categories: category ? [category] : [],
  judges,
  updated: `v-${id}`,
})
const game = (
  id: string,
  round: string,
  team: string,
  tableId: string,
  sequence: number,
  status = 'scheduled',
): BoardGame => ({
  id,
  round,
  team,
  table: tableId,
  sequence,
  status,
  attempt: 1,
  updated: `v-${id}`,
})

function makeBoard(): Board {
  return {
    categories: [
      { id: 'rmj', name: 'Junior', code: 'RMJ', judges_per_table: 2 },
      { id: 'rme', name: 'Elementary', code: 'RME', judges_per_table: 3 },
    ],
    rounds: [
      { id: 'j1', category: 'rmj', key: 'R1', name: 'Round 1', position: 1 },
      { id: 'j2', category: 'rmj', key: 'R2', name: 'Round 2', position: 2 },
      { id: 'e1', category: 'rme', key: 'R1', name: 'Round 1', position: 1 },
    ],
    tables: [
      table('a', 'rmj', ['ann']),
      table('b', 'rmj', ['ann', 'ben']),
      table('c', 'rme'),
      table('x', ''),
    ],
    teams: [
      { id: 't1', name: 'One', category: 'rmj' },
      { id: 't2', name: 'Two', category: 'rmj' },
      { id: 't3', name: 'Three', category: 'rmj' },
      { id: 't4', name: 'Four', category: 'rme' },
    ],
    games: [
      game('g1', 'j1', 't1', 'a', 2),
      game('g2', 'j1', 't2', 'a', 1),
      game('g3', 'j2', 't1', 'a', 1),
      game('g4', 'j2', 't2', 'b', 1),
      game('g5', 'j1', 't3', '', 0),
    ],
    judges: [
      { id: 'ann', name: 'Ann', role: 'judge' },
      { id: 'ben', name: 'Ben', role: 'judge' },
      { id: 'cy', name: 'Cy', role: 'head_judge' },
    ],
  }
}

describe('assignment board helpers (M8-E)', () => {
  it('M8-25: groups tables by category, unsorted ones last', () => {
    const groups = groupTables(makeBoard())
    expect(groups.map((g) => [g.category?.id ?? null, g.tables.map((t) => t.id)])).toEqual([
      ['rmj', ['a', 'b']],
      ['rme', ['c']],
      [null, ['x']],
    ])
    expect(roundCount(makeBoard())).toBe(2)
  })

  it('M8-31: shows the first round for all rounds, or the chosen round', () => {
    const board = makeBoard()
    const a = board.tables[0]!
    expect(teamsOn(board, a, 'all')).toEqual(['t2', 't1'])
    expect(teamsOn(board, a, 1)).toEqual(['t1'])
    // Elementary has no second round: nothing is shown there.
    expect(teamsOn(board, board.tables[2]!, 1)).toEqual([])
  })

  it('M8-30: lists teams without a table in the shown round', () => {
    const board = makeBoard()
    expect(unassignedTeams(board, 'all').map((t) => t.id)).toEqual(['t3', 't4'])
    expect(unassignedTeams(board, 1).map((t) => t.id)).toEqual(['t3', 't4'])
    expect(unassignedJudges(board).map((j) => j.id)).toEqual(['cy'])
  })

  it('M8-32: states the versions of the team’s and the tables’ games', () => {
    const board = makeBoard()
    expect(expectedForMove(board, 't1', 'b', 'all')).toEqual({
      g1: 'v-g1',
      g2: 'v-g2',
      g3: 'v-g3',
      g4: 'v-g4',
    })
    expect(expectedForMove(board, 't3', 'a', 1)).toEqual({ g3: 'v-g3' })
  })

  it('M8-29: flags judges on several active tables and counts slots', () => {
    const board = makeBoard()
    expect([...judgeConflicts(board)]).toEqual(['ann'])
    board.tables[1]!.active = false
    expect([...judgeConflicts(board)]).toEqual([])
    expect(judgeSlots(board, board.tables[0]!)).toBe(2)
    expect(judgeSlots(board, board.tables[2]!)).toBe(3)
  })

  it('M8-27: a divider gives tables to the neighbouring category', () => {
    const groups = groupTables(makeBoard())
    // Elementary's divider dropped before table B: B moves to Elementary.
    expect(dividerMove(groups, 1, 'b')).toMatchObject({
      tables: [{ id: 'b' }],
      category: 'rme',
    })
    // Unsorted divider dropped after its last table: X moves to Elementary.
    expect(dividerMove(groups, 2, endOf(2))).toMatchObject({
      tables: [{ id: 'x' }],
      category: 'rme',
    })
    // No change, the first group has no divider move, and tables cannot become unsorted.
    expect(dividerMove(groups, 1, 'c')).toBeNull()
    expect(dividerMove(groups, 0, 'b')).toBeNull()
    expect(dividerMove(groups, 2, 'c')).toBeNull()
  })
})
