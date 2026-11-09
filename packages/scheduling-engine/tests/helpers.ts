import type { Period, ScheduleInput, SchedGame, SchedTable } from '../src'

export const MIN = 60_000
export const T0 = Date.UTC(2026, 10, 14, 9, 0) // 2026-11-14 09:00 UTC

export const table = (id: string, extra: Partial<SchedTable> = {}): SchedTable => ({
  id,
  active: true,
  categories: [],
  ...extra,
})

export const play = (startMin: number, endMin: number): Period => ({
  id: `play-${startMin}`,
  kind: 'play',
  start: T0 + startMin * MIN,
  end: T0 + endMin * MIN,
})

export const breakAt = (startMin: number, endMin: number): Period => ({
  id: `break-${startMin}`,
  kind: 'break',
  start: T0 + startMin * MIN,
  end: T0 + endMin * MIN,
})

export function game(id: string, extra: Partial<SchedGame> = {}): SchedGame {
  return {
    id,
    category: 'RM',
    team: `team-${id}`,
    judges: [],
    durationMs: 15 * MIN,
    table: null,
    start: null,
    locked: false,
    ...extra,
  }
}

export function input(parts: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    tables: [table('T1'), table('T2')],
    periods: [play(0, 120)],
    games: [],
    minRestMs: 0,
    ...parts,
  }
}

/** Shorthand: a game placed at `startMin` on `tableId`. */
export const at = (id: string, tableId: string, startMin: number, extra: Partial<SchedGame> = {}) =>
  game(id, { table: tableId, start: T0 + startMin * MIN, ...extra })
