import { pb } from '@/shared/api/pocketbase'

/**
 * Assignment board (M8-E): tables as columns grouped by category, with their judges and teams.
 * See docs/specifications/M8-board.md. Every write returns the whole board.
 */

export interface BoardCategory {
  id: string
  name: string
  code: string
  judges_per_table: number
}
export interface BoardRound {
  id: string
  category: string
  key: string
  name: string
  position: number
}
export interface BoardTable {
  id: string
  name: string
  position: number
  active: boolean
  /** The board category: '' when the table has none or several. */
  category: string
  categories: string[]
  judges: string[]
  updated: string
}
export interface BoardTeam {
  id: string
  name: string
  category: string
}
export interface BoardGame {
  id: string
  round: string
  team: string
  table: string
  sequence: number
  status: string
  attempt: number
  updated: string
}
export interface BoardJudge {
  id: string
  name: string
  role: 'judge' | 'head_judge'
}
export interface Board {
  categories: BoardCategory[]
  rounds: BoardRound[]
  tables: BoardTable[]
  teams: BoardTeam[]
  games: BoardGame[]
  judges: BoardJudge[]
}

const base = (eventId: string) => `/api/events/${eventId}/board`

export function loadBoard(eventId: string) {
  return pb.send<Board>(base(eventId), {})
}

export function moveTeam(
  eventId: string,
  body: {
    team: string
    table: string
    index: number
    round?: string
    expected: Record<string, string>
  },
) {
  return pb.send<Board>(`${base(eventId)}/teams`, { method: 'POST', body })
}

export function moveJudge(
  eventId: string,
  body: { judge: string; from: string; to: string; expected: Record<string, string> },
) {
  return pb.send<Board>(`${base(eventId)}/judges`, { method: 'POST', body })
}

export function createTable(eventId: string, category: string) {
  return pb.send<Board>(`${base(eventId)}/tables`, { method: 'POST', body: { category } })
}

export function setTableCategory(
  eventId: string,
  table: BoardTable,
  category: string,
  confirm = false,
) {
  return pb.send<Board>(`${base(eventId)}/tables/${table.id}/category`, {
    method: 'POST',
    body: { category, confirm, expected_updated: table.updated },
  })
}

/** Rename or (de)activate a table (record API, versioned). */
export function updateTable(table: BoardTable, data: { name?: string; active?: boolean }) {
  return pb.collection('tables').update(table.id, { ...data, expected_updated: table.updated })
}

/** Deletes a table; the server refuses while games are placed on it (M4-11). */
export function deleteTable(table: BoardTable) {
  return pb.collection('tables').delete(table.id)
}

export function setJudgesPerTable(categoryId: string, judges: number) {
  return pb.collection('categories').update(categoryId, { judges_per_table: judges })
}

/** Calls `callback` when a game or table of the event changes. Resolves to an unsubscribe. */
export async function subscribeBoard(eventId: string, callback: () => void) {
  if (typeof EventSource === 'undefined') return () => {}
  const offGames = await pb
    .collection('games')
    .subscribe('*', callback, { filter: pb.filter('team.event = {:e}', { e: eventId }) })
  const offTables = await pb
    .collection('tables')
    .subscribe('*', callback, { filter: pb.filter('event = {:e}', { e: eventId }) })
  return () => {
    void offGames()
    void offTables()
  }
}

export function isConflict(error: unknown) {
  return (error as { status?: number } | null)?.status === 409
}
