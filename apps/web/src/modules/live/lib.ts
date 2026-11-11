import { t } from '@/i18n'
import type {
  PublicCategory,
  PublicDay,
  PublicEvent,
  PublicGame,
  PublicRanking,
  PublicRound,
  PublishedRanking,
  RankingSource,
} from './types'

// Pure logic of the public pages and TV mode (M6). No Vue, no API.

export interface LiveFilters {
  /** Category id or "" (all). */
  category?: string
  /** Competition day id or "" (all). */
  day?: string
}

/** Local calendar date as YYYY-MM-DD (competition days are calendar dates, not instants). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function roundIndex(event: Pick<PublicEvent, 'rounds'>) {
  return new Map(event.rounds.map((r) => [r.id, r]))
}

/** Games matching the category and day filters (a round's day decides a game's day, M6-07). */
export function filterGames(
  event: Pick<PublicEvent, 'games' | 'rounds'>,
  filters: LiveFilters,
): PublicGame[] {
  const rounds = roundIndex(event)
  return event.games.filter((g) => {
    if (filters.category && g.category !== filters.category) return false
    if (filters.day && rounds.get(g.round)?.day !== filters.day) return false
    return true
  })
}

export interface Progress {
  total: number
  done: number
  inReview: number
  /** Not played or still being scored. */
  remaining: number
  /** 0–100, rounded down so 100 % means every game is final. */
  percent: number
}

/** Completed and remaining games (M6-08). Only finalized results count as done. */
export function progressOf(games: Pick<PublicGame, 'state'>[]): Progress {
  const done = games.filter((g) => g.state === 'done').length
  const inReview = games.filter((g) => g.state === 'in_review').length
  const total = games.length
  return {
    total,
    done,
    inReview,
    remaining: total - done - inReview,
    percent: total ? Math.floor((done / total) * 100) : 0,
  }
}

/** Progress from the counts of the public ranking endpoint. */
export function progressFromCounts(p: PublicRanking['progress']): Progress {
  return {
    total: p.total,
    done: p.done,
    inReview: p.in_review,
    remaining: p.total - p.done - p.in_review,
    percent: p.total ? Math.floor((p.done / p.total) * 100) : 0,
  }
}

/**
 * The day to show first (M6-07, M6-09): today if it is a competition day; otherwise the first day
 * that still has open games (the competition resumes there); otherwise the last day.
 */
export function currentDay(
  event: Pick<PublicEvent, 'days' | 'games' | 'rounds'>,
  today: string,
): string {
  const days = [...event.days].sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) return ''
  const todays = days.find((d) => d.date === today)
  if (todays) return todays.id
  const open = days.find((d) => filterGames(event, { day: d.id }).some((g) => g.state !== 'done'))
  return (open ?? days[days.length - 1]!).id
}

export function dayLabel(day: PublicDay | undefined): string {
  if (!day) return t('judging.noDay')
  if (day.label) return day.label
  return day.date
}

/** Playing order: day, round position, category, table, sequence, attempt, team. */
export function compareGames(event: Pick<PublicEvent, 'rounds' | 'days' | 'tables'>) {
  const rounds = roundIndex(event)
  const dayDate = new Map(event.days.map((d) => [d.id, d.date]))
  const tableName = new Map(event.tables.map((t) => [t.id, t.name]))
  return (a: PublicGame, b: PublicGame) => {
    const ra = rounds.get(a.round)
    const rb = rounds.get(b.round)
    return (
      (dayDate.get(ra?.day ?? '') ?? '9999').localeCompare(dayDate.get(rb?.day ?? '') ?? '9999') ||
      (ra?.position ?? 0) - (rb?.position ?? 0) ||
      a.category.localeCompare(b.category) ||
      (tableName.get(a.table) ?? '￿').localeCompare(tableName.get(b.table) ?? '￿') ||
      a.sequence - b.sequence ||
      a.attempt - b.attempt ||
      a.team.name.localeCompare(b.team.name)
    )
  }
}

export interface ScheduleGroup {
  round: PublicRound
  category: PublicCategory | undefined
  day: PublicDay | undefined
  games: PublicGame[]
  progress: Progress
}

/** Games grouped by round in playing order, for the schedule display (M6-04). */
export function scheduleGroups(event: PublicEvent, filters: LiveFilters): ScheduleGroup[] {
  const categories = new Map(event.categories.map((c) => [c.id, c]))
  const days = new Map(event.days.map((d) => [d.id, d]))
  const rounds = roundIndex(event)
  const groups = new Map<string, ScheduleGroup>()
  for (const game of [...filterGames(event, filters)].sort(compareGames(event))) {
    const round = rounds.get(game.round)
    if (!round) continue
    let group = groups.get(round.id)
    if (!group) {
      group = {
        round,
        category: categories.get(round.category),
        day: days.get(round.day),
        games: [],
        progress: progressOf([]),
      }
      groups.set(round.id, group)
    }
    group.games.push(game)
  }
  for (const group of groups.values()) group.progress = progressOf(group.games)
  return [...groups.values()]
}

export interface TableQueue {
  table: { id: string; name: string }
  /** The game at the table now (being scored or the next to play), or null when finished. */
  current: PublicGame | null
  /** The games after it. */
  next: PublicGame[]
  remaining: number
}

/**
 * Now/next per table (M6-04). Games waiting for review are already played, so the table has moved
 * on to the following game.
 */
export function tableQueues(event: PublicEvent, filters: LiveFilters, upcoming = 2): TableQueue[] {
  const games = filterGames(event, filters).sort(compareGames(event))
  return event.tables.map((table) => {
    const queue = games.filter(
      (g) => g.table === table.id && (g.state === 'upcoming' || g.state === 'scoring'),
    )
    return {
      table,
      current: queue[0] ?? null,
      next: queue.slice(1, 1 + upcoming),
      remaining: queue.length,
    }
  })
}

/** Categories with a ranking the public may see. */
export function publishedCategories(categories: PublicCategory[]): PublicCategory[] {
  return categories.filter((c) => c.live || c.official)
}

/** The ranking to show: the requested source if available, else official, else live. */
export function pickRanking(
  ranking: PublicRanking | undefined,
  preferred?: RankingSource,
): { source: RankingSource; ranking: PublishedRanking } | null {
  if (!ranking) return null
  if (preferred === 'live' && ranking.live) return { source: 'live', ranking: ranking.live }
  if (ranking.official) return { source: 'official', ranking: ranking.official }
  if (ranking.live) return { source: 'live', ranking: ranking.live }
  return null
}

/** Results are provisional while games are open or teams miss rounds (M6-02). */
export function isProvisional(ranking: PublicRanking, source: RankingSource): boolean {
  if (source === 'official') return false
  const open = ranking.progress.total - ranking.progress.done
  return open > 0 || !!ranking.live?.result.entries.some((e) => e.provisional)
}

// ---------------------------------------------------------------------------
// TV mode (M6-05)
// ---------------------------------------------------------------------------

export type TvView = 'auto' | 'ranking' | 'tables' | 'timetable' | 'progress'

export type TvSlide =
  | { kind: 'ranking'; category: string; page: number; pages: number }
  | { kind: 'tables' }
  | { kind: 'timetable' }
  | { kind: 'progress' }

export function pageCount(items: number, perPage: number): number {
  return Math.max(1, Math.ceil(items / Math.max(1, perPage)))
}

export function pageOf<T>(items: T[], page: number, perPage: number): T[] {
  const size = Math.max(1, perPage)
  return items.slice(page * size, page * size + size)
}

/**
 * The rotation of a TV display: every page of every shown ranking, then the tables, then the
 * progress. A pinned view shows only that kind.
 */
export function tvSlides(options: {
  view: TvView
  /** Categories with a public ranking and their number of ranking rows. */
  rankings: { category: string; rows: number }[]
  rowsPerPage: number
  hasTables: boolean
  /** The shown day has a timetable (placed phases or public blocks, M4-14-26). */
  hasTimetable?: boolean
}): TvSlide[] {
  const slides: TvSlide[] = []
  const show = (kind: TvView) => options.view === 'auto' || options.view === kind
  if (show('ranking')) {
    for (const { category, rows } of options.rankings) {
      const pages = pageCount(rows, options.rowsPerPage)
      for (let page = 0; page < pages; page++)
        slides.push({ kind: 'ranking', category, page, pages })
    }
  }
  if (show('tables') && options.hasTables) slides.push({ kind: 'tables' })
  if (show('timetable') && options.hasTimetable) slides.push({ kind: 'timetable' })
  if (show('progress')) slides.push({ kind: 'progress' })
  return slides
}

export function parseTvView(value: unknown): TvView {
  return value === 'ranking' || value === 'tables' || value === 'timetable' || value === 'progress'
    ? value
    : 'auto'
}

/** Rotation interval in seconds from the URL (5–300, default 15). */
export function parseRotate(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 15
  return Math.min(300, Math.max(5, Math.round(n)))
}
