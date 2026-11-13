import { t, translatedLabels } from '@/i18n'
import type { Assignment, NamedRef, RoundCheck, RoundRef, SheetStatus } from './types'

// ---------------------------------------------------------------------------
// Stopwatch (M5-07). Based on wall-clock timestamps, so it survives a reload.
// ---------------------------------------------------------------------------

export interface StopwatchState {
  /** Epoch ms when the current running period started; null when not running. */
  startedAt: number | null
  /** Time accumulated in earlier running periods. */
  elapsedMs: number
}

export type StopwatchPhase = 'idle' | 'running' | 'paused'

export const IDLE: StopwatchState = { startedAt: null, elapsedMs: 0 }

export function phase(state: StopwatchState): StopwatchPhase {
  if (state.startedAt !== null) return 'running'
  return state.elapsedMs > 0 ? 'paused' : 'idle'
}

export function elapsed(state: StopwatchState, now: number): number {
  return state.elapsedMs + (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt))
}

export function start(state: StopwatchState, now: number): StopwatchState {
  return state.startedAt === null ? { startedAt: now, elapsedMs: state.elapsedMs } : state
}

export function pause(state: StopwatchState, now: number): StopwatchState {
  return state.startedAt === null ? state : { startedAt: null, elapsedMs: elapsed(state, now) }
}

/** Stops the stopwatch: returns the recorded duration and resets it. */
export function stop(
  state: StopwatchState,
  now: number,
): { timeMs: number; state: StopwatchState } {
  return { timeMs: Math.round(elapsed(state, now)), state: IDLE }
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/** 95370 → "1:35.37" (minutes:seconds.hundredths). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10))
  const hundredths = total % 100
  const seconds = Math.floor(total / 100) % 60
  const minutes = Math.floor(total / 6000)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

/**
 * Parses a manually entered time (M5-08): "1:35.37", "1:35", "95.37" or "95,37" (seconds).
 * Returns milliseconds, 0 for an empty value, or null if the value is not a time.
 */
export function parseTime(text: string): number | null {
  const value = text.trim().replace(',', '.')
  if (value === '') return 0
  const match = /^(?:(\d+):)?(\d+(?:\.\d{0,3})?)$/.exec(value)
  if (!match) return null
  const minutes = match[1] ? Number(match[1]) : 0
  const seconds = Number(match[2])
  if (match[1] && seconds >= 60) return null
  return Math.round((minutes * 60 + seconds) * 1000)
}

// ---------------------------------------------------------------------------
// Score status
// ---------------------------------------------------------------------------

/** What a judge needs to know about a game at a glance. */
export type ScoreState = 'open' | 'draft' | 'returned' | 'submitted' | 'final' | 'recorded'

export function scoreState(game: Pick<Assignment, 'status' | 'sheet'>): ScoreState {
  const status: SheetStatus | undefined = game.sheet?.status
  if (status === 'draft') return 'draft'
  if (status === 'rejected') return 'returned'
  if (status === 'submitted') return 'submitted'
  if (status === 'finalized') return 'final'
  return game.status === 'scheduled' ? 'open' : 'recorded'
}

export const SCORE_STATE_LABELS = translatedLabels<ScoreState>(
  ['open', 'draft', 'returned', 'submitted', 'final', 'recorded'],
  (state) => t(`judging.state.${state}`),
)

/** Games the judge still has to score. */
export const isToDo = (game: Pick<Assignment, 'status' | 'sheet'>) =>
  ['open', 'draft', 'returned'].includes(scoreState(game))

// ---------------------------------------------------------------------------
// Dashboard filters (M5-02)
// ---------------------------------------------------------------------------

export interface AssignmentFilter {
  /** Day id, "none" for rounds without a day, or "" for all. */
  day: string
  /** Table id or "" for all. */
  table: string
}

export function filterAssignments(rows: Assignment[], filter: AssignmentFilter) {
  return rows.filter(
    (row) =>
      (!filter.day || (row.day?.id ?? 'none') === filter.day) &&
      (!filter.table || row.table?.id === filter.table),
  )
}

export interface FilterOption {
  value: string
  label: string
  /** Days: the date for sorting. */
  sort: string
}

export function dayOptions(rows: Assignment[]): FilterOption[] {
  const map = new Map<string, FilterOption>()
  const add = (day: Assignment['day']) => {
    const value = day?.id ?? 'none'
    if (!map.has(value)) {
      map.set(value, {
        value,
        label: day ? day.label || day.date : t('judging.noDay'),
        sort: day?.date ?? '9999',
      })
    }
  }
  for (const row of rows) {
    add(row.day)
    // A robot check may be on another day than the scoring run (M5-15).
    if (row.check?.day) add(row.check.day)
  }
  return [...map.values()].sort((a, b) => a.sort.localeCompare(b.sort))
}

export function tableOptions(rows: Assignment[]): FilterOption[] {
  const map = new Map<string, FilterOption>()
  for (const row of rows) {
    if (row.table && !map.has(row.table.id)) {
      map.set(row.table.id, { value: row.table.id, label: row.table.name, sort: row.table.name })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.sort.localeCompare(b.sort, undefined, { numeric: true }),
  )
}

/** Groups rows (already in playing order) by day and round, keeping the order. */
export function groupByRound(rows: Assignment[]) {
  const groups: { key: string; title: string; subtitle: string; rows: Assignment[] }[] = []
  for (const row of rows) {
    const key = `${row.day?.id ?? ''}:${row.round.id}`
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = {
        key,
        title: `${row.round.name} · ${row.category.code}`,
        subtitle: [row.day?.label || row.day?.date, row.event.name].filter(Boolean).join(' · '),
        rows: [],
      }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// ---------------------------------------------------------------------------
// Robot check (M5-15)
// ---------------------------------------------------------------------------

/** The robot check of one round at one table: the teams to check, in playing order. */
export interface RobotCheckBlock {
  key: string
  round: RoundRef
  category: Assignment['category']
  event: Assignment['event']
  table: NamedRef | null
  check: RoundCheck
  /** Day of the round's games (the scoring run), which places the check in the timeline. */
  gameDay: Assignment['day']
  teams: { id: string; name: string; sequence: number; game: string; program_name: string }[]
}

/** "08:30" + 15 → "08:30–08:45"; "" when the check is not placed. */
export function timeRange(start: string, minutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(start)
  if (!match) return ''
  const end = (Number(match[1]) * 60 + Number(match[2]) + minutes) % (24 * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${start}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`
}

/**
 * Robot check blocks of a judge's schedule: one per round with a check and table, listing each
 * team once (its first game on that table). Sorted by day, start time, round and table.
 */
export function robotChecks(rows: Assignment[]): RobotCheckBlock[] {
  const blocks = new Map<string, RobotCheckBlock>()
  for (const row of rows) {
    if (!row.check) continue
    const key = `${row.round.id}:${row.table?.id ?? ''}`
    let block = blocks.get(key)
    if (!block) {
      block = {
        key,
        round: row.round,
        category: row.category,
        event: row.event,
        table: row.table,
        check: row.check,
        gameDay: row.day,
        teams: [],
      }
      blocks.set(key, block)
    }
    const known = block.teams.find((t) => t.id === row.team.id)
    if (!known) {
      block.teams.push({
        id: row.team.id,
        name: row.team.name,
        sequence: row.sequence,
        game: row.id,
        program_name: row.program_name ?? '',
      })
    } else if (row.sequence < known.sequence) {
      known.sequence = row.sequence
      known.game = row.id
      known.program_name = row.program_name || known.program_name
    }
  }
  const list = [...blocks.values()]
  for (const block of list) block.teams.sort((a, b) => a.sequence - b.sequence)
  return list.sort(
    (a, b) =>
      (a.check.day?.date ?? '9999').localeCompare(b.check.day?.date ?? '9999') ||
      (a.check.starts_at || '99').localeCompare(b.check.starts_at || '99') ||
      a.round.position - b.round.position ||
      (a.table?.name ?? '').localeCompare(b.table?.name ?? '', undefined, { numeric: true }),
  )
}

/** Day and time of a robot check, e.g. "Friday · 16:00–16:20". */
export function checkWhen(block: RobotCheckBlock) {
  const day = block.check.day ? block.check.day.label || block.check.day.date : ''
  const time = timeRange(block.check.starts_at, block.check.duration_minutes)
  return [day, time || t('judging.check.unscheduled', { minutes: block.check.duration_minutes })]
    .filter(Boolean)
    .join(' · ')
}

/** Route of the guided check of a block; `from` is the page to return to. */
export function checkRoute(block: RobotCheckBlock, from?: string) {
  return {
    name: 'judging-check',
    params: { roundId: block.round.id },
    query: { ...(block.table ? { table: block.table.id } : {}), ...(from ? { from } : {}) },
  }
}

/** Dashboard filters applied to robot check blocks (the check's own day). */
export function filterChecks(blocks: RobotCheckBlock[], filter: AssignmentFilter) {
  return blocks.filter(
    (block) =>
      (!filter.day || (block.check.day?.id ?? 'none') === filter.day) &&
      (!filter.table || block.table?.id === filter.table),
  )
}

// ---------------------------------------------------------------------------
// Timeline: robot checks and games in one order (M5-15)
// ---------------------------------------------------------------------------

export type GameGroup = ReturnType<typeof groupByRound>[number]

export type TimelineEntry =
  | { kind: 'check'; key: string; block: RobotCheckBlock }
  | { kind: 'games'; key: string; group: GameGroup }

/**
 * The judge's schedule in one order: game groups as in `groupByRound` (day, round, table,
 * sequence), with each round's robot checks directly before that round's games. Checks are
 * placed by the day of their round's games and the round position, so a check held the day
 * before still comes right before its round.
 */
export function buildTimeline(rows: Assignment[], checks: RobotCheckBlock[]): TimelineEntry[] {
  type Keyed = { entry: TimelineEntry; date: string; position: number; kind: number; i: number }
  const keyed: Keyed[] = []
  groupByRound(rows).forEach((group, i) => {
    const first = group.rows[0]!
    keyed.push({
      entry: { kind: 'games', key: group.key, group },
      date: first.day?.date ?? '9999',
      position: first.round.position,
      kind: 1,
      i,
    })
  })
  checks.forEach((block, i) => {
    keyed.push({
      entry: { kind: 'check', key: `check:${block.key}`, block },
      date: block.gameDay?.date ?? block.check.day?.date ?? '9999',
      position: block.round.position,
      kind: 0,
      i,
    })
  })
  return keyed
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.position - b.position || a.kind - b.kind || a.i - b.i,
    )
    .map((k) => k.entry)
}

/**
 * A robot check is done once the judge finished it (on this device) or as soon as scoring of
 * that round has started at that table.
 */
export function isCheckDone(block: RobotCheckBlock, rows: Assignment[], finished: string[]) {
  if (finished.includes(block.key)) return true
  return rows.some(
    (row) =>
      row.round.id === block.round.id &&
      (row.table?.id ?? '') === (block.table?.id ?? '') &&
      scoreState(row) !== 'open',
  )
}

export type NextUp = { kind: 'check'; block: RobotCheckBlock } | { kind: 'game'; row: Assignment }

/** The first thing on the timeline still to do: an open robot check or a game to score. */
export function nextUp(
  entries: TimelineEntry[],
  checkDone: (block: RobotCheckBlock) => boolean,
): NextUp | undefined {
  for (const entry of entries) {
    if (entry.kind === 'check') {
      if (!checkDone(entry.block)) return { kind: 'check', block: entry.block }
    } else {
      const row = entry.group.rows.find(isToDo)
      if (row) return { kind: 'game', row }
    }
  }
  return undefined
}
