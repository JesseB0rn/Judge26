import { t } from '@/i18n'
import type { ExportTable } from '@/shared/export/table'
import type { CategoryRecord, TeamRecord } from '@/shared/types/records'
import { TEAM_STATUS_LABELS } from './lib'

// Team exports (M7-05, M7-06): one row per team, and a sheet with one row per member.

function categoryName(categories: CategoryRecord[], team: TeamRecord) {
  return team.expand?.category?.name ?? categories.find((c) => c.id === team.category)?.name ?? ''
}

export function teamsTable(teams: TeamRecord[], categories: CategoryRecord[]): ExportTable {
  return {
    name: t('teams.export.teamsSheet'),
    columns: [
      { header: t('teams.team') },
      { header: t('teams.category') },
      { header: t('common.status') },
      { header: t('teams.organization') },
      { header: t('teams.country') },
      { header: t('teams.contact') },
      { header: t('teams.contactEmail') },
      { header: t('teams.members'), type: 'number', decimals: 0 },
    ],
    rows: teams.map((team) => [
      team.name,
      categoryName(categories, team),
      TEAM_STATUS_LABELS[team.status],
      team.organization,
      team.country,
      team.coach_name,
      team.coach_email,
      team.members?.length ?? 0,
    ]),
  }
}

/** Ages as in registration checks: season − birth year (WRO convention). */
export function membersTable(
  teams: TeamRecord[],
  categories: CategoryRecord[],
  season: number,
): ExportTable {
  return {
    name: t('teams.members'),
    columns: [
      { header: t('teams.team') },
      { header: t('teams.category') },
      { header: t('teams.firstName') },
      { header: t('teams.lastName') },
      { header: t('teams.birthYear'), type: 'number', decimals: 0 },
      { header: t('teams.export.ageIn', { season }), type: 'number', decimals: 0 },
    ],
    rows: teams.flatMap((team) =>
      (team.members ?? []).map((m) => [
        team.name,
        categoryName(categories, team),
        m.first_name,
        m.last_name,
        m.birth_year,
        season - m.birth_year,
      ]),
    ),
  }
}
