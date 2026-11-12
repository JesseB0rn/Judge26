import { t } from '@/i18n'
import Papa from 'papaparse'
import type { CategoryRecord, TeamMember } from '@/shared/types/records'
import { validateMembers } from '../lib'

/**
 * Team CSV import (M1-12, M8-03). Imported teams are active, so every row must be a complete
 * team for its category.
 *
 * Columns (header row required, order free, case-insensitive):
 *   team_name*, category_code*, organization, country, contact_name, contact_email,
 *   member<N>_first_name, member<N>_last_name, member<N>_birth_year  (N = 1, 2, …)
 *
 * The optional contact is stored in the team's coach_name / coach_email fields and receives
 * schedule emails.
 *
 * Import policy: every row is validated independently. Invalid rows are reported
 * with their line number and skipped. All valid rows are imported in one atomic
 * batch; if the server rejects any of them, nothing is imported.
 */

export const REQUIRED_COLUMNS = ['team_name', 'category_code'] as const
export const MAX_ROWS = 500

export interface TeamImportData {
  name: string
  category: string
  organization: string
  country: string
  coach_name: string
  coach_email: string
  members: TeamMember[]
}

export interface ImportRow {
  /** 1-based line number in the file (header = line 1). */
  line: number
  name: string
  team?: TeamImportData
  errors: string[]
}

export interface ImportResult {
  /** Problems with the file as a whole; no row is importable if present. */
  fileErrors: string[]
  rows: ImportRow[]
}

export interface ImportContext {
  categories: Pick<
    CategoryRecord,
    'id' | 'code' | 'min_team_size' | 'max_team_size' | 'min_age' | 'max_age'
  >[]
  /** Existing team names per category id (any case). */
  existingNames: Map<string, Set<string>>
  season: number
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MEMBER_COLUMN = /^member(\d+)_(first_name|last_name|birth_year)$/

export function parseTeamCsv(text: string, context: ImportContext): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => v.trim(),
  })

  const columns = parsed.meta.fields ?? []
  const fileErrors: string[] = []
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c))
  if (missing.length) {
    fileErrors.push(t('teams.import.missingColumns', { columns: missing.join(', ') }))
  }
  if (parsed.data.length === 0) fileErrors.push(t('teams.import.noRows'))
  if (parsed.data.length > MAX_ROWS) {
    fileErrors.push(t('teams.import.tooManyRows', { max: MAX_ROWS }))
  }
  if (fileErrors.length) return { fileErrors, rows: [] }

  const memberNumbers = [
    ...new Set(
      columns
        .map((c) => MEMBER_COLUMN.exec(c)?.[1])
        .filter(Boolean)
        .map(Number),
    ),
  ].sort((a, b) => a - b)
  const byCode = new Map(context.categories.map((c) => [c.code.toLowerCase(), c]))
  const seen = new Map<string, Set<string>>()

  // Papaparse reports structural problems (e.g. wrong field count) per row.
  const structural = new Map<number, string[]>()
  for (const err of parsed.errors) {
    if (err.row === undefined) continue
    structural.set(err.row, [...(structural.get(err.row) ?? []), t('teams.import.malformedRow')])
  }

  const rows = parsed.data.map((record, index): ImportRow => {
    const line = index + 2
    const errors = [...(structural.get(index) ?? [])]
    const get = (column: string) => record[column] ?? ''
    const name = get('team_name')

    if (!name) errors.push(t('teams.import.nameRequired'))
    else if (name.length > 100) errors.push(t('teams.import.nameTooLong', { max: 100 }))

    const code = get('category_code')
    const category = byCode.get(code.toLowerCase())
    if (!code) errors.push(t('teams.import.categoryRequired'))
    else if (!category) errors.push(t('teams.import.unknownCategory', { code }))

    const contactEmail = get('contact_email')
    if (contactEmail && !EMAIL.test(contactEmail)) {
      errors.push(t('teams.import.invalidContactEmail', { email: contactEmail }))
    }

    const members: TeamMember[] = []
    for (const n of memberNumbers) {
      const first = get(`member${n}_first_name`)
      const last = get(`member${n}_last_name`)
      const year = get(`member${n}_birth_year`)
      if (!first && !last && !year) continue
      members.push({
        first_name: first,
        last_name: last,
        birth_year: /^\d{4}$/.test(year) ? Number(year) : NaN,
      })
    }
    errors.push(...validateMembers(members, { category, season: context.season, complete: true }))

    if (category && name) {
      const key = name.toLowerCase()
      const inFile = seen.get(category.id) ?? new Set()
      if (inFile.has(key)) errors.push(t('teams.import.duplicateInFile', { name }))
      else if (context.existingNames.get(category.id)?.has(key)) {
        errors.push(t('teams.import.alreadyExists', { name, code: category.code }))
      }
      inFile.add(key)
      seen.set(category.id, inFile)
    }

    if (errors.length || !category) return { line, name, errors }
    return {
      line,
      name,
      errors,
      team: {
        name,
        category: category.id,
        organization: get('organization'),
        country: get('country'),
        coach_name: get('contact_name'),
        coach_email: contactEmail,
        members,
      },
    }
  })

  return { fileErrors, rows }
}

/** Example file offered for download in the import dialog. */
export const TEMPLATE_CSV = [
  'team_name,category_code,organization,country,contact_name,contact_email,member1_first_name,member1_last_name,member1_birth_year,member2_first_name,member2_last_name,member2_birth_year',
  'Robo Rangers,RM-J,Example School,CH,Jane Doe,jane@example.com,Ada,Lovelace,2013,Alan,Turing,2012',
].join('\n')
