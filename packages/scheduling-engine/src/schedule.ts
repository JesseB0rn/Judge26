import { pairClashes, staticClashes, validateSchedule } from './conflicts'
import type { GenerationResult, Ms, Placement, ScheduleInput, SchedGame, Unplaced } from './types'

export interface GenerateOptions {
  /** Start-time grid. Defaults to the shortest duration of the games being placed. */
  stepMs?: Ms
  /** Search budget; exceeding it returns `limit_reached` instead of running forever. */
  maxNodes?: number
}

interface Candidate {
  table: string
  start: Ms
}

const DEFAULT_MAX_NODES = 200_000

/**
 * Places every unlocked game on a table and start time without conflicts (M4-06). Locked games
 * are kept as they are (M4-12). Uses backtracking that always continues with the game that has
 * the fewest remaining options, so the result is deterministic for a given input.
 *
 * Returns `complete` with all placements, or `infeasible` with the best partial arrangement and
 * a per-game explanation (M4-T08). Nothing is changed unless the caller persists a complete result.
 */
export function generateSchedule(
  input: ScheduleInput,
  options: GenerateOptions = {},
): GenerationResult {
  const fixed = input.games.filter((g) => g.locked)
  const lockedReport = validateSchedule({ ...input, games: fixed })
  if (lockedReport.length > 0) {
    return {
      status: 'invalid',
      issues: lockedReport,
      message: 'Locked games already conflict with each other. Resolve them before generating.',
    }
  }

  const free = input.games.filter((g) => !g.locked)
  if (free.length === 0) return { status: 'complete', placements: [] }

  const step = options.stepMs ?? Math.min(...free.map((g) => g.durationMs))
  if (!(step > 0) || free.some((g) => !(g.durationMs > 0))) {
    throw new Error('Game durations and the time grid must be positive.')
  }

  const minRest = input.minRestMs
  const domains = new Map<string, Candidate[]>()
  const unplaced: Unplaced[] = []
  for (const game of free) {
    const candidates = candidatesFor(input, game, step).filter((c) =>
      fixed.every((f) => pairClashes(asPlaced(game, c), f, minRest).length === 0),
    )
    if (candidates.length === 0) {
      unplaced.push({ gameId: game.id, reasons: explainNoCandidates(input, game) })
    }
    domains.set(game.id, candidates)
  }
  if (unplaced.length > 0) {
    return {
      status: 'infeasible',
      placedCount: 0,
      unplaced,
      message: `${unplaced.length} of ${free.length} games have no possible table and time.`,
    }
  }

  const gameById = new Map(free.map((g) => [g.id, g]))
  const placed: SchedGame[] = [...fixed]
  const chosen = new Map<string, Candidate>()
  let nodes = 0
  let aborted = false
  let best: Placement[] = []

  const snapshot = () => {
    if (chosen.size > best.length) {
      best = [...chosen].map(([gameId, c]) => ({ gameId, table: c.table, start: c.start }))
    }
  }

  const search = (remaining: string[]): boolean => {
    if (remaining.length === 0) return true
    if (++nodes > (options.maxNodes ?? DEFAULT_MAX_NODES)) {
      aborted = true
      return false
    }
    snapshot()

    let pick: { id: string; options: Candidate[] } | null = null
    for (const id of remaining) {
      const game = gameById.get(id)!
      const available = domains
        .get(id)!
        .filter((c) => placed.every((p) => pairClashes(asPlaced(game, c), p, minRest).length === 0))
      if (available.length === 0) return false
      if (!pick || available.length < pick.options.length) pick = { id, options: available }
    }

    const game = gameById.get(pick!.id)!
    const rest = remaining.filter((id) => id !== pick!.id)
    for (const c of pick!.options) {
      placed.push(asPlaced(game, c))
      chosen.set(game.id, c)
      if (search(rest)) return true
      placed.pop()
      chosen.delete(game.id)
      if (aborted) return false
    }
    return false
  }

  const found = search(free.map((g) => g.id))
  if (found) {
    const placements = free.map((g) => {
      const c = chosen.get(g.id)!
      return { gameId: g.id, table: c.table, start: c.start }
    })
    return { status: 'complete', placements }
  }
  if (aborted) {
    return {
      status: 'limit_reached',
      placedCount: best.length,
      message:
        'The search budget was exhausted. Reduce the number of unlocked games or add capacity.',
    }
  }
  const placedIds = new Set(best.map((p) => p.gameId))
  return {
    status: 'infeasible',
    placedCount: best.length,
    unplaced: free
      .filter((g) => !placedIds.has(g.id))
      .map((g) => ({ gameId: g.id, reasons: ['no_conflict_free_slot'] })),
    message: `Only ${best.length} of ${free.length} games fit without conflicts. Add table capacity or availability, or reduce the rest interval.`,
  }
}

function asPlaced(game: SchedGame, c: Candidate): SchedGame {
  return { ...game, table: c.table, start: c.start }
}

/** Every table and start time on the grid where the game passes its static checks. */
function candidatesFor(input: ScheduleInput, game: SchedGame, step: Ms): Candidate[] {
  const seen = new Map<string, Candidate>()
  const tableOrder = input.tables.map((t) => t.id)
  const playPeriods = input.periods
    .filter((p) => p.kind === 'play')
    .sort((a, b) => a.start - b.start)
  for (const period of playPeriods) {
    for (let start = period.start; start + game.durationMs <= period.end; start += step) {
      for (const table of tableOrder) {
        const key = `${table}|${start}`
        if (seen.has(key)) continue
        const probe = { ...game, table, start }
        if (staticClashes(input, probe).length === 0) seen.set(key, { table, start })
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.start - b.start || tableOrder.indexOf(a.table) - tableOrder.indexOf(b.table),
  )
}

function explainNoCandidates(input: ScheduleInput, game: SchedGame): string[] {
  const reasons: string[] = []
  const eligible = input.tables.filter(
    (t) => t.active && (t.categories.length === 0 || t.categories.includes(game.category)),
  )
  if (eligible.length === 0) reasons.push('no_compatible_table')
  const fitsPlay = input.periods.some(
    (p) => p.kind === 'play' && p.end - p.start >= game.durationMs,
  )
  if (!fitsPlay) reasons.push('no_availability_long_enough')
  if (reasons.length === 0) reasons.push('blocked_by_locked_games_or_breaks')
  return reasons
}
