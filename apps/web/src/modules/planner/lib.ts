import { t, te, translatedLabels } from '@/i18n'
import {
  PHASE_ORDER,
  type BlockColor,
  type GridColumn,
  type ItemRef,
  type PhaseKind,
  type Placement,
  type PlannerBlock,
  type PlannerData,
  type PlannerDay,
  type PlannerIssue,
  type PlannerPhase,
  type PlannerRound,
} from './types'

// Pure logic of the schedule planner (M4-14). No Vue, no API.

export const DAY_MINUTES = 24 * 60
/** Drag and keyboard moves snap to this many minutes (M4-14-11). */
export const SNAP_MINUTES = 5
/** Minimum duration when resizing by drag or keyboard (forms allow 1 minute for phases). */
export const MIN_DRAG_MINUTES = 5
export const MIN_BLOCK_MINUTES = 5
export const DEFAULT_CHECK_MINUTES = 10

// --- Time -------------------------------------------------------------------

/** Minutes since midnight of "HH:MM", or null. */
export function toMinutes(value: string | undefined | null): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

/** "HH:MM" of minutes since midnight (24:00 for the end of the day). */
export function formatTime(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Start of a block, clamped so it ends by midnight. */
export function clampStart(start: number, duration: number): number {
  return clamp(start, 0, DAY_MINUTES - duration)
}

export function timeRange(starts_at: string, duration: number): string {
  const start = toMinutes(starts_at)
  if (start === null) return t('live.schedule.notPlaced')
  return `${starts_at}–${formatTime(start + duration)}`
}

// --- Refs and lookups ------------------------------------------------------

export function refKey(ref: ItemRef): string {
  return `${ref.kind}:${ref.id}`
}

/** Parses a deep-link value ("phase:<id>" or "block:<id>"). */
export function parseRef(value: unknown): ItemRef | null {
  if (typeof value !== 'string') return null
  const match = /^(phase|block):([A-Za-z0-9_-]+)$/.exec(value)
  return match ? { kind: match[1] as ItemRef['kind'], id: match[2]! } : null
}

export function findItem(
  data: Pick<PlannerData, 'phases' | 'blocks'>,
  ref: ItemRef,
): PlannerPhase | PlannerBlock | undefined {
  return ref.kind === 'phase'
    ? data.phases.find((p) => p.id === ref.id)
    : data.blocks.find((b) => b.id === ref.id)
}

export function isPlaced(item: { day: string; starts_at: string }, days?: PlannerDay[]): boolean {
  if (!item.day || toMinutes(item.starts_at) === null) return false
  return !days || days.some((d) => d.id === item.day)
}

const PHASES: PhaseKind[] = ['maintenance', 'check', 'scoring']

export const PHASE_LABELS = translatedLabels(PHASES, (p) => t(`planner.phase.${p}`))

export const PHASE_SHORT = translatedLabels(PHASES, (p) => t(`planner.phaseShort.${p}`))

export function dayName(day: PlannerDay | undefined): string {
  if (!day) return t('judging.noDay')
  return day.label || day.date
}

export function sortedDays(days: PlannerDay[]): PlannerDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date))
}

/** Today's day id, if today is a competition day. */
export function todayId(days: PlannerDay[], today: string): string | undefined {
  return days.find((d) => d.date === today)?.id
}

/** Issues per item key ("phase:<id>"). */
export function issuesByItem(issues: PlannerIssue[]): Record<string, PlannerIssue[]> {
  const map: Record<string, PlannerIssue[]> = {}
  for (const issue of issues) {
    for (const item of issue.items) (map[refKey(item)] ??= []).push(issue)
  }
  return map
}

/** Phases still to be placed, by category name, round position and phase order. */
export function unplacedPhases(data: PlannerData): PlannerPhase[] {
  const rounds = new Map(data.rounds.map((r) => [r.id, r]))
  const catName = new Map(data.categories.map((c) => [c.id, c.name]))
  return data.phases
    .filter((p) => rounds.has(p.round) && !isPlaced(p, data.days))
    .sort((a, b) => {
      const ra = rounds.get(a.round)!
      const rb = rounds.get(b.round)!
      return (
        (catName.get(ra.category) ?? '').localeCompare(catName.get(rb.category) ?? '') ||
        ra.position - rb.position ||
        ra.key.localeCompare(rb.key) ||
        PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase)
      )
    })
}

/** Placed phases of the same round that come after `phase` (for "move with later phases"). */
export function laterPhases(phases: PlannerPhase[], phase: PlannerPhase): PlannerPhase[] {
  const index = PHASE_ORDER.indexOf(phase.phase)
  return phases.filter(
    (p) => p.round === phase.round && PHASE_ORDER.indexOf(p.phase) > index && isPlaced(p),
  )
}

/**
 * Moves a placement by whole days (in date order) and minutes, keeping it within the day.
 * Returns null if the target day does not exist.
 */
export function shiftPlacement(
  days: PlannerDay[],
  placement: Placement,
  duration: number,
  dayOffset: number,
  minutes: number,
): Placement | null {
  const ordered = sortedDays(days)
  const index = ordered.findIndex((d) => d.id === placement.day)
  const target = ordered[index + dayOffset]
  const start = toMinutes(placement.starts_at)
  if (index < 0 || !target || start === null) return null
  return { day: target.id, starts_at: formatTime(clampStart(start + minutes, duration)) }
}

export function dayOffset(days: PlannerDay[], from: string, to: string): number {
  const ordered = sortedDays(days)
  return ordered.findIndex((d) => d.id === to) - ordered.findIndex((d) => d.id === from)
}

// --- Grid geometry ------------------------------------------------------------

/**
 * The shared time axis (M4-14-05): earliest start to latest end of all day windows, widened
 * to whole hours and to any placed item outside the windows.
 */
export function axisRange(
  days: PlannerDay[],
  items: { start: number; end: number }[] = [],
): { start: number; end: number } {
  const starts = days.map((d) => toMinutes(d.starts_at) ?? 8 * 60)
  const ends = days.map((d) => toMinutes(d.ends_at) ?? 18 * 60)
  for (const item of items) {
    starts.push(item.start)
    ends.push(item.end)
  }
  const start = starts.length ? Math.min(...starts) : 8 * 60
  const end = ends.length ? Math.max(...ends) : 18 * 60
  return {
    start: Math.max(0, Math.floor(start / 60) * 60),
    end: Math.min(
      DAY_MINUTES,
      Math.max(Math.ceil(end / 60) * 60, Math.floor(start / 60) * 60 + 60),
    ),
  }
}

/** Placed items of the data (minutes), for the axis range. */
export function placedRanges(data: Pick<PlannerData, 'days' | 'phases' | 'blocks'>) {
  return [...data.phases, ...data.blocks]
    .filter((item) => isPlaced(item, data.days))
    .map((item) => {
      const start = toMinutes(item.starts_at)!
      return { start, end: start + item.duration_minutes }
    })
}

export interface LayoutItem {
  /** Unique per rendered element. */
  key: string
  ref: ItemRef
  /** Index of the first covered column among the visible categories. */
  col: number
  span: number
  /** Side-by-side position among overlapping items (M4-14-08). */
  lane: number
  lanes: number
  start: number
  end: number
}

interface Entry {
  ref: ItemRef
  col: number
  start: number
  end: number
  lane: number
  lanes: number
}

function assignLanes(entries: Entry[]) {
  entries.sort(
    (a, b) => a.start - b.start || b.end - a.end || refKey(a.ref).localeCompare(refKey(b.ref)),
  )
  let cluster: Entry[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []
  const close = () => {
    const lanes = laneEnds.length
    for (const e of cluster) e.lanes = lanes
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }
  for (const entry of entries) {
    if (cluster.length && entry.start >= clusterEnd) close()
    let lane = laneEnds.findIndex((end) => end <= entry.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = entry.end
    entry.lane = lane
    cluster.push(entry)
    clusterEnd = Math.max(clusterEnd, entry.end)
  }
  if (cluster.length) close()
}

/**
 * Positions the items of one day in the visible category columns. Phases sit in their round's
 * category; blocks cover their categories (all for none). A block covering adjacent columns
 * without overlaps is one element across them; otherwise it is one segment per column (M4-14-07).
 */
export function layoutDay(
  dayId: string,
  columns: string[],
  data: Pick<PlannerData, 'phases' | 'blocks' | 'rounds'>,
): LayoutItem[] {
  const rounds = new Map<string, PlannerRound>(data.rounds.map((r) => [r.id, r]))
  const perColumn: Entry[][] = columns.map(() => [])
  const blockEntries = new Map<string, Entry[]>()

  for (const phase of data.phases) {
    if (phase.day !== dayId) continue
    const start = toMinutes(phase.starts_at)
    const round = rounds.get(phase.round)
    const col = round ? columns.indexOf(round.category) : -1
    if (start === null || col < 0) continue
    perColumn[col]!.push({
      ref: { kind: 'phase', id: phase.id },
      col,
      start,
      end: start + phase.duration_minutes,
      lane: 0,
      lanes: 1,
    })
  }
  for (const block of data.blocks) {
    if (block.day !== dayId) continue
    const start = toMinutes(block.starts_at)
    if (start === null) continue
    const covered = [...block.categories, ...(block.columns ?? [])]
    const cols = covered.length
      ? covered.map((c) => columns.indexOf(c)).filter((c) => c >= 0)
      : columns.map((_, i) => i)
    const entries = cols
      .sort((a, b) => a - b)
      .map((col) => ({
        ref: { kind: 'block' as const, id: block.id },
        col,
        start,
        end: start + block.duration_minutes,
        lane: 0,
        lanes: 1,
      }))
    entries.forEach((e) => perColumn[e.col]!.push(e))
    if (entries.length) blockEntries.set(block.id, entries)
  }
  perColumn.forEach(assignLanes)

  const items: LayoutItem[] = []
  const toItem = (e: Entry, span = 1, suffix = ''): LayoutItem => ({
    key: refKey(e.ref) + suffix,
    ref: e.ref,
    col: e.col,
    span,
    lane: span > 1 ? 0 : e.lane,
    lanes: span > 1 ? 1 : e.lanes,
    start: e.start,
    end: e.end,
  })
  for (const column of perColumn) {
    for (const e of column) if (e.ref.kind === 'phase') items.push(toItem(e))
  }
  for (const entries of blockEntries.values()) {
    // Split into runs of adjacent columns; a run without overlaps renders as one element.
    let run: Entry[] = []
    const flush = () => {
      if (!run.length) return
      if (run.length > 1 && run.every((e) => e.lanes === 1)) {
        items.push(toItem(run[0]!, run.length, `:${run[0]!.col}`))
      } else {
        for (const e of run) items.push(toItem(e, 1, `:${e.col}`))
      }
      run = []
    }
    for (const e of entries) {
      if (run.length && e.col !== run[run.length - 1]!.col + 1) flush()
      run.push(e)
    }
    flush()
  }
  return items
}

/**
 * Columns of the grid: the categories (by name), then the custom columns in their order
 * (M4-14-33). `visible` limits them to the given ids (all if empty).
 */
export function gridColumns(
  data: Pick<PlannerData, 'categories' | 'columns'>,
  visible: string[] = [],
): GridColumn[] {
  const all: GridColumn[] = [
    ...data.categories.map((c) => ({ id: c.id, name: c.name, custom: false })),
    ...[...(data.columns ?? [])]
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, custom: true })),
  ]
  const shown = visible.length ? all.filter((c) => visible.includes(c.id)) : all
  return shown.length ? shown : all
}

/** Number of columns a block covers explicitly (0 = all). */
export function coverageCount(block: Pick<PlannerBlock, 'categories' | 'columns'>): number {
  return block.categories.length + (block.columns?.length ?? 0)
}

// --- Colors ---------------------------------------------------------------------

/** Tailwind classes per block color; readable in light and dark mode. */
export const COLOR_CLASSES: Record<BlockColor, string> = {
  slate:
    'bg-slate-100 border-slate-400 text-slate-950 dark:bg-slate-800 dark:border-slate-500 dark:text-slate-50',
  red: 'bg-red-100 border-red-400 text-red-950 dark:bg-red-950 dark:border-red-700 dark:text-red-50',
  orange:
    'bg-orange-100 border-orange-400 text-orange-950 dark:bg-orange-950 dark:border-orange-700 dark:text-orange-50',
  amber:
    'bg-amber-100 border-amber-400 text-amber-950 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-50',
  green:
    'bg-green-100 border-green-500 text-green-950 dark:bg-green-950 dark:border-green-700 dark:text-green-50',
  teal: 'bg-teal-100 border-teal-500 text-teal-950 dark:bg-teal-950 dark:border-teal-700 dark:text-teal-50',
  blue: 'bg-blue-100 border-blue-400 text-blue-950 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-50',
  violet:
    'bg-violet-100 border-violet-400 text-violet-950 dark:bg-violet-950 dark:border-violet-700 dark:text-violet-50',
  pink: 'bg-pink-100 border-pink-400 text-pink-950 dark:bg-pink-950 dark:border-pink-700 dark:text-pink-50',
}

export const SWATCH_CLASSES: Record<BlockColor, string> = {
  slate: 'bg-slate-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
}

export const PHASE_CLASSES: Record<PhaseKind, string> = {
  maintenance: 'bg-muted border-muted-foreground/40 text-foreground border-dashed',
  check:
    'bg-yellow-50 border-yellow-500 text-yellow-950 dark:bg-yellow-950 dark:border-yellow-600 dark:text-yellow-50',
  scoring: 'bg-primary text-primary-foreground border-primary',
}

export function blockClasses(color: BlockColor | '' | undefined): string {
  return COLOR_CLASSES[color || 'slate']
}

/** A planner warning in the current language (codes from apps/backend/hooks/lib/planner.js). */
export function issueText(issue: { code: string; message: string }): string {
  const key = `planner.issues.${issue.code}`
  return te(key) ? t(key) : issue.message
}
