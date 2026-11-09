import type { GameRecord, TableRecord, TimeSlotKind } from '@/shared/types/records'

export const REASON_LABELS: Record<string, string> = {
  no_compatible_table: 'No active table accepts this category.',
  no_availability_long_enough: 'No play period is long enough for this game.',
  blocked_by_locked_games_or_breaks: 'Locked games or breaks leave no free slot.',
  no_conflict_free_slot: 'No conflict-free slot is left after the other games.',
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

export const KIND_LABELS: Record<TimeSlotKind, string> = {
  play: 'Available',
  break: 'Break',
}

/** Scheduled games first in time order (then table), unscheduled games last. */
export function sortForSchedule(games: GameRecord[]): GameRecord[] {
  const key = (g: GameRecord) => (g.starts_at ? Date.parse(g.starts_at.replace(' ', 'T')) : null)
  return [...games].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === null && kb === null) return 0
    if (ka === null) return 1
    if (kb === null) return -1
    return ka - kb || a.table.localeCompare(b.table)
  })
}

export function isPlaced(game: GameRecord): boolean {
  return !!game.starts_at || !!game.table
}

export function tableName(tables: TableRecord[], id: string): string {
  return tables.find((t) => t.id === id)?.name ?? '–'
}

export function judgeNames(ids: string[], judges: { id: string; name: string }[]): string {
  if (ids.length === 0) return '–'
  return ids.map((id) => judges.find((j) => j.id === id)?.name ?? 'Unknown judge').join(', ')
}

/** "Round 1 · Alpha" style label used in lists and messages. */
export function gameLabel(game: GameRecord): string {
  const team = game.expand?.team?.name ?? 'Unknown team'
  const round = game.expand?.round?.name
  return round ? `${team} (${round})` : team
}

/** Parses an ISO/PocketBase time into epoch ms, or null for "". */
export function toEpoch(value: string): number | null {
  if (!value) return null
  const ms = Date.parse(value.replace(' ', 'T'))
  return Number.isNaN(ms) ? null : ms
}

/** Whether a time slot ends after it starts (matches the server rule). */
export function isValidPeriod(startsAt: string, endsAt: string): boolean {
  const start = toEpoch(startsAt)
  const end = toEpoch(endsAt)
  return start !== null && end !== null && end > start
}
