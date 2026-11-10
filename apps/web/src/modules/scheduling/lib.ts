import type { GameRecord } from '@/shared/types/records'

export const REASON_LABELS: Record<string, string> = {
  no_compatible_table: 'No active, assigned-judge table accepts this category.',
  no_active_table: 'No active table is available.',
  missing_table_judge: 'Assign a judge to the table before scheduling games there.',
  table_inactive: 'The assigned table is deactivated.',
  incompatible_category: 'The table is not available for this category.',
  sequence_in_use: 'That sequence number is already used on this table in this round.',
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

/** Assigned games first, ordered by round, table and per-table sequence. */
export function sortForSchedule(games: GameRecord[]): GameRecord[] {
  return [...games].sort((a, b) => {
    const roundOrder = (a.expand?.round?.position ?? 0) - (b.expand?.round?.position ?? 0)
    if (roundOrder !== 0) return roundOrder
    if (!a.table && b.table) return 1
    if (a.table && !b.table) return -1
    return a.table.localeCompare(b.table) || a.sequence - b.sequence
  })
}

export function isPlaced(game: GameRecord): boolean {
  return !!game.table && game.sequence > 0
}

/** "Alpha (Round 1)" style label used in lists and messages. */
export function gameLabel(game: GameRecord): string {
  const team = game.expand?.team?.name ?? 'Unknown team'
  const round = game.expand?.round?.name
  return round ? `${team} (${round})` : team
}
