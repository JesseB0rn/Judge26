import { describe, expect, it } from 'vitest'
import { toCsv } from '@/shared/export/csv'
import { makeCategory, makeTeam } from '@/test/utils'
import { membersTable, teamsTable } from '../export'

const categories = [makeCategory({ id: 'cat1', name: 'RoboMission Junior' })]
const teams = [
  makeTeam({
    name: 'Alpha',
    category: 'cat1',
    status: 'approved',
    organization: 'School A',
    country: 'CH',
    coach_name: 'Grace Hopper',
    coach_email: 'grace@example.com',
    members: [
      { first_name: 'Ada', last_name: 'Lovelace', birth_year: 2013 },
      { first_name: 'Alan', last_name: 'Turing', birth_year: 2012 },
    ],
    submitted_at: '',
    reviewed_at: '',
    review_note: '',
  }),
  makeTeam({
    name: 'Bravo',
    category: 'cat1',
    status: 'rejected',
    members: null,
    review_note: 'Too old',
  }),
]

describe('team export (M7-05)', () => {
  it('one row per team with category, status and coach', () => {
    const lines = toCsv(teamsTable(teams, categories)).trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'Team,Category,Status,Organization,Country,Coach,Coach email,Members,Submitted,Reviewed,Review note',
    )
    expect(lines[1]).toBe(
      'Alpha,RoboMission Junior,Approved,School A,CH,Grace Hopper,grace@example.com,2,,,',
    )
    expect(lines[2]).toMatch(/^Bravo,RoboMission Junior,Rejected,.*,0,.*,Too old$/)
  })

  it('members with their age in the season', () => {
    const lines = toCsv(membersTable(teams, categories, 2026))
      .trimEnd()
      .split('\r\n')
    expect(lines).toEqual([
      'Team,Category,First name,Last name,Birth year,Age in 2026',
      'Alpha,RoboMission Junior,Ada,Lovelace,2013,13',
      'Alpha,RoboMission Junior,Alan,Turing,2012,14',
    ])
  })
})
