import type { Issue, IssueCode, IssueField, ScheduleInput, SchedGame } from './types'

interface Clash {
  code: IssueCode
  field: IssueField
  message: string
  otherGameId?: string
}

const endOf = (g: SchedGame): number => (g.start as number) + g.durationMs

/**
 * Conflicts between two scheduled games (M4-07, M4-08, M4-09, M4-10). Games overlap when their
 * intervals intersect; `gap` is the free time between them (negative when they overlap).
 */
export function pairClashes(a: SchedGame, b: SchedGame, minRestMs: number): Clash[] {
  if (a.start === null || b.start === null) return []
  const gap = Math.max(b.start - endOf(a), a.start - endOf(b))
  const overlap = gap < 0
  const clashes: Clash[] = []
  const withOther = { otherGameId: b.id }

  if (overlap && a.table !== null && a.table === b.table) {
    clashes.push({
      code: 'table_conflict',
      field: 'table',
      message: 'The table is already booked for another game at this time.',
      ...withOther,
    })
  }
  if (a.team === b.team) {
    if (overlap) {
      clashes.push({
        code: 'team_conflict',
        field: 'starts_at',
        message: 'The team already plays another game at this time.',
        ...withOther,
      })
    } else if (gap < minRestMs) {
      clashes.push({
        code: 'rest_interval',
        field: 'starts_at',
        message: `The team needs ${Math.ceil(minRestMs / 60_000)} minutes of rest between games.`,
        ...withOther,
      })
    }
  }
  if (overlap && a.judges.some((judge) => b.judges.includes(judge))) {
    clashes.push({
      code: 'judge_conflict',
      field: 'judges',
      message: 'A judge is already assigned to another game at this time.',
      ...withOther,
    })
  }
  return clashes
}

/** Checks a single game against tables, categories, availability and breaks (M4-03, M4-04, M4-06). */
export function staticClashes(input: ScheduleInput, game: SchedGame): Clash[] {
  if (game.start === null) {
    return game.table === null
      ? []
      : [
          {
            code: 'time_required',
            field: 'starts_at',
            message: 'A game placed on a table needs a start time.',
          },
        ]
  }
  const clashes: Clash[] = []
  if (game.table !== null) {
    const table = input.tables.find((t) => t.id === game.table)
    if (!table) {
      clashes.push({ code: 'unknown_table', field: 'table', message: 'Unknown table.' })
    } else {
      if (!table.active) {
        clashes.push({
          code: 'table_inactive',
          field: 'table',
          message: 'The table is deactivated.',
        })
      }
      if (table.categories.length > 0 && !table.categories.includes(game.category)) {
        clashes.push({
          code: 'incompatible_category',
          field: 'table',
          message: 'The table is not available for this game’s category.',
        })
      }
    }
  }
  const end = endOf(game)
  const inPlay = input.periods.some(
    (p) => p.kind === 'play' && p.start <= game.start! && end <= p.end,
  )
  if (!inPlay) {
    clashes.push({
      code: 'outside_availability',
      field: 'starts_at',
      message: 'The game does not fit completely into an availability period.',
    })
  }
  const inBreak = input.periods.some(
    (p) => p.kind === 'break' && p.start < end && game.start! < p.end,
  )
  if (inBreak) {
    clashes.push({
      code: 'unavailable',
      field: 'starts_at',
      message: 'The game overlaps a break or unavailable period.',
    })
  }
  return clashes
}

const toIssue = (gameId: string, clash: Clash): Issue => ({
  code: clash.code,
  field: clash.field,
  gameId,
  message: clash.message,
  ...(clash.otherGameId ? { otherGameId: clash.otherGameId } : {}),
})

/**
 * All issues involving one game: its own static checks plus conflicts with every other scheduled
 * game in the input. The game itself is identified by `gameId`; other entries with the same id
 * are ignored, so a candidate placement can be checked against stored games.
 */
export function issuesForGame(input: ScheduleInput, gameId: string): Issue[] {
  const game = input.games.find((g) => g.id === gameId)
  if (!game) return []
  const issues = staticClashes(input, game).map((c) => toIssue(game.id, c))
  for (const other of input.games) {
    if (other.id === gameId || other.start === null) continue
    for (const clash of pairClashes(game, other, input.minRestMs)) {
      issues.push(toIssue(game.id, clash))
    }
  }
  return issues
}

/** Validates a complete schedule: every game statically and every pair of scheduled games. */
export function validateSchedule(input: ScheduleInput): Issue[] {
  const issues: Issue[] = []
  input.games.forEach((game) => {
    staticClashes(input, game).forEach((c) => issues.push(toIssue(game.id, c)))
  })
  const scheduled = input.games.filter((g) => g.start !== null)
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i]!
      const b = scheduled[j]!
      for (const clash of pairClashes(a, b, input.minRestMs)) {
        issues.push(toIssue(a.id, clash))
      }
    }
  }
  return issues
}
