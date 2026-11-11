import { t, te } from '@/i18n'
import type { Ranking, RankingConfig, TeamInput } from '@judge26/ranking-engine'
import type { ExportColumn, ExportTable } from '@/shared/export/table'
import type { RoundRecord, TeamRecord } from '@/shared/types/records'

// Ranking and results exports (M7-05, M7-06, M7-T04, M7-T05). Values are exactly those of the
// ranking engine; times are written in seconds.

export interface RankingExport {
  ranking: Ranking
  config: RankingConfig
  /** Engine inputs the ranking was computed from (live: from games; snapshot: stored inputs). */
  inputs: TeamInput[]
  /** For organization and country; teams missing here are exported without them. */
  teams: TeamRecord[]
  rounds: RoundRecord[]
}

const gameStatus = (status: string) => {
  const key = `scheduling.gameStatus.${status}`
  return te(key) ? t(key) : status
}

/** Engine status of a round result (missing, absent, disqualified), as in the ranking table. */
const resultStatus = (status: string) => {
  const key = `rankings.resultStatus.${status}`
  return te(key) ? t(key) : status
}

function decidedBy(ranking: Ranking, d: number | 'name' | null) {
  if (d === null) return ''
  return d === 'name' ? t('common.name') : (ranking.keys[d]?.label ?? '')
}

function roundLabel(data: RankingExport, key: string) {
  return (
    data.config.rounds.find((r) => r.key === key)?.label ??
    data.rounds.find((r) => r.key === key)?.name ??
    key
  )
}

/** One row per ranked team: rank, keys, every round's result, provisional and tie-break. */
export function rankingTable(data: RankingExport): ExportTable {
  const { ranking, config } = data
  const decimals = config.precision ?? 2
  const teams = new Map(data.teams.map((t) => [t.id, t]))
  const rounds = config.rounds.map((r) => r.key)

  const columns: ExportColumn[] = [
    { header: t('live.tv.rank'), type: 'number', decimals: 0, width: 6 },
    { header: t('rankings.export.shared'), width: 7 },
    { header: t('teams.team') },
    { header: t('teams.organization') },
    { header: t('teams.country') },
    ...ranking.keys.map((k): ExportColumn =>
      k.field === 'time'
        ? { header: `${k.label} (s)`, type: 'duration' }
        : { header: k.label, type: 'number', decimals },
    ),
    ...rounds.flatMap((key): ExportColumn[] => {
      const label = roundLabel(data, key)
      return [
        { header: t('rankings.export.roundPoints', { round: label }), type: 'number', decimals },
        { header: t('rankings.export.roundTime', { round: label }), type: 'duration' },
        { header: t('rankings.export.roundStatus', { round: label }) },
      ]
    }),
    { header: t('rankings.export.provisional'), width: 11 },
    { header: t('rankings.export.decidedBy') },
  ]

  const rows = ranking.entries.map((entry) => {
    const team = teams.get(entry.team)
    return [
      entry.rank,
      entry.shared ? t('common.yes') : '',
      entry.name,
      team?.organization ?? '',
      team?.country ?? '',
      ...entry.values,
      ...rounds.flatMap((key) => {
        const result = entry.results[key]
        if (!result) return [null, null, '']
        return [
          result.points,
          result.timeMs,
          result.status === 'ok' ? '' : resultStatus(result.status),
        ]
      }),
      entry.provisional ? t('common.yes') : '',
      decidedBy(ranking, entry.decidedBy),
    ]
  })
  return { name: t('categories.ranking'), columns, rows }
}

/** One row per recorded game (attempt) that entered the ranking. */
export function resultsTable(data: RankingExport): ExportTable {
  const decimals = data.config.precision ?? 2
  const order = new Map(data.config.rounds.map((r, i) => [r.key, i]))
  const rows = data.inputs
    .flatMap((team) =>
      team.games.map((g) => ({
        team: team.name,
        round: g.round,
        attempt: g.attempt ?? 1,
        status: g.status,
        points: g.points ?? null,
        time: g.timeMs ?? null,
      })),
    )
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team) ||
        (order.get(a.round) ?? 99) - (order.get(b.round) ?? 99) ||
        a.attempt - b.attempt,
    )
    .map((g) => [
      g.team,
      roundLabel(data, g.round),
      g.attempt,
      gameStatus(g.status),
      g.points,
      g.time,
    ])
  return {
    name: t('rankings.view.results'),
    columns: [
      { header: t('teams.team') },
      { header: t('teams.mine.round') },
      { header: t('scheduling.export.attempt'), type: 'number', decimals: 0 },
      { header: t('common.status') },
      { header: t('scheduling.export.points'), type: 'number', decimals },
      { header: t('scheduling.export.time'), type: 'duration' },
    ],
    rows,
  }
}
