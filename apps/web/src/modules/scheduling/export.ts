import { t, translatedLabels } from '@/i18n'
import type { ExportTable } from '@/shared/export/table'
import type {
  CategoryRecord,
  CompetitionDayRecord,
  GameRecord,
  GameStatus,
} from '@/shared/types/records'

// Games export (M7-05, M7-06): the schedule with each game's result, in playing order.

const STATUS = translatedLabels<GameStatus>(
  ['scheduled', 'completed', 'disqualified', 'absent'],
  (status) => t(`scheduling.gameStatus.${status}`),
)

/** Games need `expand: round,team,table` (as listed by the schedule). */
export function gamesTable(
  games: GameRecord[],
  categories: CategoryRecord[],
  days: CompetitionDayRecord[] = [],
): ExportTable {
  const category = new Map(categories.map((c) => [c.id, c.name]))
  const day = new Map(days.map((d) => [d.id, d.label || d.date.slice(0, 10)]))
  const sorted = [...games].sort((a, b) => {
    const ra = a.expand?.round
    const rb = b.expand?.round
    return (
      (category.get(ra?.category ?? '') ?? '').localeCompare(
        category.get(rb?.category ?? '') ?? '',
      ) ||
      (ra?.position ?? 0) - (rb?.position ?? 0) ||
      (ra?.key ?? '').localeCompare(rb?.key ?? '') ||
      (a.expand?.table?.position ?? 1e9) - (b.expand?.table?.position ?? 1e9) ||
      (a.sequence || 1e9) - (b.sequence || 1e9) ||
      (a.expand?.team?.name ?? '').localeCompare(b.expand?.team?.name ?? '') ||
      (a.attempt || 1) - (b.attempt || 1)
    )
  })
  return {
    name: t('scheduling.export.sheet'),
    columns: [
      { header: t('teams.category') },
      { header: t('teams.mine.round') },
      { header: t('scheduling.export.attempt'), type: 'number', decimals: 0 },
      { header: t('scheduling.export.day') },
      { header: t('teams.mine.table') },
      { header: t('scheduling.export.position'), type: 'number', decimals: 0 },
      { header: t('teams.team') },
      { header: t('common.status') },
      { header: t('scheduling.export.points'), type: 'number' },
      { header: t('scheduling.export.time'), type: 'duration' },
    ],
    rows: sorted.map((g) => {
      const round = g.expand?.round
      const played = g.status === 'completed'
      return [
        category.get(round?.category ?? '') ?? '',
        round?.name ?? '',
        g.attempt || 1,
        round?.day ? (day.get(round.day) ?? '') : '',
        g.expand?.table?.name ?? '',
        g.table ? g.sequence : null,
        g.expand?.team?.name ?? '',
        STATUS[g.status],
        played ? g.points : null,
        played && g.time_ms > 0 ? g.time_ms : null,
      ]
    }),
  }
}
