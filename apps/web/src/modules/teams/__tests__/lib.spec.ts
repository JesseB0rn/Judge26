import { describe, expect, it } from 'vitest'
import { canCoachEdit, validateMembers } from '../lib'

const category = { min_team_size: 2, max_team_size: 3, min_age: 11, max_age: 15 }
const member = (birth_year = 2013) => ({ first_name: 'A', last_name: 'B', birth_year })
const openEvent = {
  status: 'published' as const,
  registration_opens_at: '',
  registration_closes_at: '',
}

describe('validateMembers', () => {
  it('accepts a valid complete team', () => {
    expect(
      validateMembers([member(), member()], { category, season: 2026, complete: true }),
    ).toEqual([])
  })

  it('validates member fields', () => {
    expect(validateMembers([{ first_name: ' ', last_name: '', birth_year: 2013.5 }])).toEqual([
      'Member 1: first name is required.',
      'Member 1: last name is required.',
      'Member 1: birth year must be a whole number between 1900 and 2100.',
    ])
  })

  it('allows incomplete drafts', () => {
    expect(validateMembers([member()], { category, season: 2026 })).toEqual([])
  })

  it('checks team size and age for complete teams', () => {
    expect(validateMembers([], { category, complete: true })).toContain(
      'A team needs at least one member.',
    )
    expect(validateMembers([member()], { category, season: 2026, complete: true })).toEqual([
      'The category requires at least 2 members.',
    ])
    expect(
      validateMembers([member(), member(), member(), member()], {
        category,
        season: 2026,
        complete: true,
      }),
    ).toEqual(['The category allows at most 3 members.'])
    expect(
      validateMembers([member(2020), member(2005)], { category, season: 2026, complete: true }),
    ).toEqual([
      'Member 1 is 6 in 2026; minimum age is 11.',
      'Member 2 is 21 in 2026; maximum age is 15.',
    ])
  })
})

describe('canCoachEdit', () => {
  it('allows new, draft and rejected registrations while registration is open', () => {
    expect(canCoachEdit(undefined, openEvent)).toBe(true)
    expect(canCoachEdit({ status: 'draft' }, openEvent)).toBe(true)
    expect(canCoachEdit({ status: 'rejected' }, openEvent)).toBe(true)
    expect(canCoachEdit({ status: 'submitted' }, openEvent)).toBe(false)
    expect(canCoachEdit({ status: 'approved' }, openEvent)).toBe(false)
  })

  it('locks registrations when registration is closed', () => {
    expect(canCoachEdit({ status: 'draft' }, { ...openEvent, status: 'archived' })).toBe(false)
  })
})
