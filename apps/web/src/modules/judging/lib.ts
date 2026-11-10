import type { Assignment, SheetStatus } from './types'

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

export const SCORE_STATE_LABELS: Record<ScoreState, string> = {
  open: 'Not scored',
  draft: 'Draft',
  returned: 'Returned',
  submitted: 'Submitted',
  final: 'Final',
  recorded: 'Recorded',
}

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
  for (const row of rows) {
    const value = row.day?.id ?? 'none'
    if (!map.has(value)) {
      map.set(value, {
        value,
        label: row.day ? row.day.label || row.day.date : 'No day',
        sort: row.day?.date ?? '9999',
      })
    }
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
