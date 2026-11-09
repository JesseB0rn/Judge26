import { describe, expect, it } from 'vitest'
import { MAX_ROWS, parseTeamCsv, TEMPLATE_CSV, type ImportContext } from '../import/csv'

const context = (overrides: Partial<ImportContext> = {}): ImportContext => ({
  categories: [
    { id: 'cat-rm', code: 'RM-J', min_team_size: 2, max_team_size: 3, min_age: 11, max_age: 15 },
    { id: 'cat-fi', code: 'FI', min_team_size: 0, max_team_size: 0, min_age: 0, max_age: 0 },
  ],
  existingNames: new Map([['cat-rm', new Set(['existing team'])]]),
  season: 2026,
  status: 'submitted',
  ...overrides,
})

const HEADER =
  'team_name,category_code,coach_email,organization,member1_first_name,member1_last_name,member1_birth_year,member2_first_name,member2_last_name,member2_birth_year'
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')

describe('parseTeamCsv (M1-12)', () => {
  it('parses valid rows into team data', () => {
    const result = parseTeamCsv(
      csv('Robo Rangers,RM-J,jane@example.com,School,Ada,Lovelace,2013,Alan,Turing,2012'),
      context(),
    )
    expect(result.fileErrors).toEqual([])
    expect(result.rows).toEqual([
      {
        line: 2,
        name: 'Robo Rangers',
        errors: [],
        team: {
          name: 'Robo Rangers',
          category: 'cat-rm',
          organization: 'School',
          country: '',
          coach_name: '',
          coach_email: 'jane@example.com',
          members: [
            { first_name: 'Ada', last_name: 'Lovelace', birth_year: 2013 },
            { first_name: 'Alan', last_name: 'Turing', birth_year: 2012 },
          ],
        },
      },
    ])
  })

  it('M1-T10: reports invalid rows with line numbers and keeps valid rows', () => {
    const result = parseTeamCsv(
      csv(
        'Valid,RM-J,a@example.com,,Ada,L,2013,Alan,T,2012',
        ',XX,not-an-email,,,,,,,',
        'Too Small,RM-J,b@example.com,,Ada,L,2013,,,',
        'Bad Year,FI,c@example.com,,Ada,L,20x3,,,',
      ),
      context(),
    )
    const byLine = Object.fromEntries(result.rows.map((r) => [r.line, r]))
    expect(byLine[2]!.team).toBeDefined()
    expect(byLine[3]!.team).toBeUndefined()
    expect(byLine[3]!.errors).toEqual([
      'Team name is required.',
      'Unknown category code "XX".',
      'Invalid coach email "not-an-email".',
      'A team needs at least one member.',
    ])
    expect(byLine[4]!.errors).toEqual(['The category requires at least 2 members.'])
    expect(byLine[5]!.errors).toEqual([
      'Member 1: birth year must be a whole number between 1900 and 2100.',
    ])
  })

  it('detects duplicates within the file and against existing teams (case-insensitive)', () => {
    const result = parseTeamCsv(
      csv(
        'Dup,RM-J,a@example.com,,Ada,L,2013,Alan,T,2012',
        'dup,RM-J,a@example.com,,Ada,L,2013,Alan,T,2012',
        'Existing Team,RM-J,a@example.com,,Ada,L,2013,Alan,T,2012',
        'Dup,FI,a@example.com,,Ada,L,2013,,,',
      ),
      context(),
    )
    expect(result.rows.map((r) => r.errors)).toEqual([
      [],
      ['Duplicate team name "dup" in this file.'],
      ['A team named "Existing Team" already exists in RM-J.'],
      [],
    ])
  })

  it('only checks completeness when importing as submitted or approved', () => {
    const row = 'Small,RM-J,a@example.com,,Ada,L,2013,,,'
    expect(parseTeamCsv(csv(row), context({ status: 'draft' })).rows[0]!.errors).toEqual([])
    expect(parseTeamCsv(csv(row), context({ status: 'approved' })).rows[0]!.errors).not.toEqual([])
  })

  it('accepts headers in any case and order, and category codes in any case', () => {
    const text = 'Coach_Email,TEAM_NAME,Category_Code\nx@example.com,Lowercase,fi'
    const result = parseTeamCsv(text, context({ status: 'draft' }))
    expect(result.rows[0]!.team?.category).toBe('cat-fi')
  })

  it('reports file-level problems', () => {
    expect(parseTeamCsv('name,code\nA,B', context()).fileErrors).toEqual([
      'Missing required column(s): team_name, category_code, coach_email.',
    ])
    expect(parseTeamCsv(HEADER, context()).fileErrors).toEqual(['The file contains no data rows.'])
    const many = csv(...Array.from({ length: MAX_ROWS + 1 }, (_, i) => `T${i},FI,a@example.com`))
    expect(parseTeamCsv(many, context()).fileErrors).toEqual([
      `At most ${MAX_ROWS} rows can be imported at once.`,
    ])
  })

  it('reports rows with the wrong number of fields', () => {
    const result = parseTeamCsv(csv('Short,RM-J'), context({ status: 'draft' }))
    expect(result.rows[0]!.team).toBeUndefined()
    expect(result.rows[0]!.errors.join(' ')).toMatch(/fields/i)
  })

  it('accepts the downloadable example file', () => {
    const result = parseTeamCsv(TEMPLATE_CSV, context({ existingNames: new Map() }))
    expect(result.fileErrors).toEqual([])
    expect(result.rows[0]!.errors).toEqual([])
  })
})
