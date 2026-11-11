import type { ExportTable } from '@/shared/export/table'
import type { CategoryRecord, TeamRecord } from '@/shared/types/records'
import { TEAM_STATUS_LABELS } from './lib'

// Team exports (M7-05, M7-06): one row per team, and a sheet with one row per member.

function categoryName(categories: CategoryRecord[], team: TeamRecord) {
  return team.expand?.category?.name ?? categories.find((c) => c.id === team.category)?.name ?? ''
}

export function teamsTable(teams: TeamRecord[], categories: CategoryRecord[]): ExportTable {
  return {
    name: 'Teams',
    columns: [
      { header: 'Team' },
      { header: 'Category' },
      { header: 'Status' },
      { header: 'Organization' },
      { header: 'Country' },
      { header: 'Coach' },
      { header: 'Coach email' },
      { header: 'Members', type: 'number', decimals: 0 },
      { header: 'Submitted', type: 'datetime' },
      { header: 'Reviewed', type: 'datetime' },
      { header: 'Review note' },
    ],
    rows: teams.map((t) => [
      t.name,
      categoryName(categories, t),
      TEAM_STATUS_LABELS[t.status],
      t.organization,
      t.country,
      t.coach_name,
      t.coach_email,
      t.members?.length ?? 0,
      t.submitted_at,
      t.reviewed_at,
      t.review_note,
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
    name: 'Members',
    columns: [
      { header: 'Team' },
      { header: 'Category' },
      { header: 'First name' },
      { header: 'Last name' },
      { header: 'Birth year', type: 'number', decimals: 0 },
      { header: `Age in ${season}`, type: 'number', decimals: 0 },
    ],
    rows: teams.flatMap((t) =>
      (t.members ?? []).map((m) => [
        t.name,
        categoryName(categories, t),
        m.first_name,
        m.last_name,
        m.birth_year,
        season - m.birth_year,
      ]),
    ),
  }
}
