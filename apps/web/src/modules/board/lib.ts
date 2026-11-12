import type { Board, BoardCategory, BoardTable, BoardTeam } from './api'

/**
 * Pure helpers of the assignment board (M8-E). The scope is `'all'` (every round: the board
 * shows and edits each category's first round, later rounds follow with a rotation) or the
 * 0-based index of one round within each category.
 */
export type Scope = 'all' | number

export interface Group {
  /** null: tables without one category ("unsorted"). */
  category: BoardCategory | null
  tables: BoardTable[]
}

/** Tables grouped by category, in board order (the server's order). */
export function groupTables(board: Board): Group[] {
  const groups: Group[] = board.categories.map((category) => ({
    category,
    tables: board.tables.filter((t) => t.category === category.id),
  }))
  const unsorted = board.tables.filter((t) => !t.category)
  if (unsorted.length) groups.push({ category: null, tables: unsorted })
  return groups
}

export function categoryRounds(board: Board, categoryId: string) {
  return board.rounds
    .filter((r) => r.category === categoryId)
    .sort((a, b) => a.position - b.position)
}

/** The round of a category that the board shows for the scope, if it has one. */
export function shownRound(board: Board, categoryId: string, scope: Scope) {
  return categoryRounds(board, categoryId)[scope === 'all' ? 0 : scope]
}

/** The most rounds any category has (the round toggle offers that many). */
export function roundCount(board: Board) {
  return Math.max(0, ...board.categories.map((c) => categoryRounds(board, c.id).length))
}

/** Team ids on a table in its category's shown round, by sequence. */
export function teamsOn(board: Board, table: BoardTable, scope: Scope): string[] {
  const round = table.category ? shownRound(board, table.category, scope) : undefined
  if (!round) return []
  const seen = new Set<string>()
  return board.games
    .filter((g) => g.round === round.id && g.table === table.id)
    .sort((a, b) => a.sequence - b.sequence)
    .map((g) => g.team)
    .filter((team) => !seen.has(team) && seen.add(team))
}

/** Teams that are on no table in the shown round of their category. */
export function unassignedTeams(board: Board, scope: Scope): BoardTeam[] {
  return board.teams.filter((team) => {
    const round = shownRound(board, team.category, scope)
    return !board.games.some((g) => g.team === team.id && g.round === round?.id && g.table)
  })
}

/** Whether a game of the team in the shown round already started (it cannot move). */
export function isLocked(board: Board, teamId: string, table: BoardTable, scope: Scope) {
  const round = table.category ? shownRound(board, table.category, scope) : undefined
  return board.games.some(
    (g) =>
      g.team === teamId &&
      g.round === round?.id &&
      g.table === table.id &&
      g.status !== 'scheduled',
  )
}

/**
 * The versions the server checks for a team move (M8-32): every game of the team and of the
 * tables involved, in the rounds the move changes.
 */
export function expectedForMove(
  board: Board,
  teamId: string,
  targetId: string,
  scope: Scope,
): Record<string, string> {
  const team = board.teams.find((t) => t.id === teamId)
  if (!team) return {}
  const rounds = categoryRounds(board, team.category)
  const scoped = scope === 'all' ? rounds : rounds.slice(scope, scope + 1)
  const ids = scoped.map((r) => r.id)
  const source = board.games.find((g) => g.round === ids[0] && g.team === teamId && g.table)?.table
  const tables = [targetId, source].filter(Boolean)
  return Object.fromEntries(
    board.games
      .filter((g) => ids.includes(g.round) && (g.team === teamId || tables.includes(g.table)))
      .map((g) => [g.id, g.updated]),
  )
}

/** Judges assigned to more than one active table (M8-29: shown as a conflict). */
export function judgeConflicts(board: Board): Set<string> {
  const count = new Map<string, number>()
  for (const table of board.tables.filter((t) => t.active)) {
    for (const judge of table.judges) count.set(judge, (count.get(judge) ?? 0) + 1)
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([id]) => id))
}

/** Judges on no table. */
export function unassignedJudges(board: Board) {
  const assigned = new Set(board.tables.flatMap((t) => t.judges))
  return board.judges.filter((j) => !assigned.has(j.id))
}

export function judgeSlots(board: Board, table: BoardTable) {
  const category = board.categories.find((c) => c.id === table.category)
  return Math.max(category?.judges_per_table ?? 2, table.judges.length)
}

/**
 * Tables that change category when a group's divider is dropped before `beforeTable`
 * (M8-27). The divider is the left edge of group `index`: dropping it inside the previous group
 * gives that group's tail to this group; dropping it inside this group gives its head to the
 * previous group (`endOf(index)`: all of them). Returns null when the drop changes nothing or is
 * not possible (the first group has no previous one; tables cannot become unsorted).
 */
export function dividerMove(
  groups: Group[],
  index: number,
  beforeTable: string,
): { tables: BoardTable[]; category: string } | null {
  const group = groups[index]
  const previous = groups[index - 1]
  if (!group || !previous?.category) return null
  const tail = previous.tables.findIndex((t) => t.id === beforeTable)
  if (tail !== -1) {
    if (!group.category) return null
    const tables = previous.tables.slice(tail)
    return tables.length ? { tables, category: group.category.id } : null
  }
  const head =
    beforeTable === endOf(index)
      ? group.tables.length
      : group.tables.findIndex((t) => t.id === beforeTable)
  if (head > 0) return { tables: group.tables.slice(0, head), category: previous.category.id }
  return null
}

/** Drop position after the last table of group `index` (the `data-next` of that column). */
export function endOf(index: number) {
  return `end:${index}`
}
