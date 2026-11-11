import { t, te } from '@/i18n'
import type { GameRecord } from '@/shared/types/records'

/** Why a game cannot be placed (codes from apps/backend/hooks/lib/schedule.js). */
export function reasonLabel(reason: string): string {
  const key = `scheduling.reasons.${reason}`
  return te(key) ? t(key) : reason
}

/** A schedule issue in the current language; the server's English text for unknown codes. */
export function issueMessage(issue: { code: string; message: string }): string {
  const key = `scheduling.issues.${issue.code}`
  return te(key) ? t(key) : issue.message
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
  const team = game.expand?.team?.name ?? t('scheduling.unknownTeam')
  const round = game.expand?.round?.name
  return round ? `${team} (${round})` : team
}
