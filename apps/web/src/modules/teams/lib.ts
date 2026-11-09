import { isRegistrationOpen } from '@/modules/events/lib'
import type {
  CategoryRecord,
  EventRecord,
  TeamMember,
  TeamRecord,
  TeamStatus,
} from '@/shared/types/records'

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/** Statuses that require a complete team (mirrors the backend). */
export const COMPLETE_STATUSES: TeamStatus[] = ['submitted', 'approved']

/** Coaches may edit drafts and rejected registrations while registration is open. */
export function canCoachEdit(
  team: Pick<TeamRecord, 'status'> | undefined,
  event: Pick<EventRecord, 'status' | 'registration_opens_at' | 'registration_closes_at'>,
): boolean {
  if (!isRegistrationOpen(event)) return false
  return !team || team.status === 'draft' || team.status === 'rejected'
}

export type CategoryLimits = Pick<
  CategoryRecord,
  'min_team_size' | 'max_team_size' | 'min_age' | 'max_age'
>

/**
 * Validates team members. With `complete`, also checks team size and ages against
 * the category (age = season − birth year). Mirrors apps/backend/hooks/lib/teams.js.
 */
export function validateMembers(
  members: TeamMember[],
  options: { category?: CategoryLimits; season?: number; complete?: boolean } = {},
): string[] {
  const errors: string[] = []
  members.forEach((m, i) => {
    const n = i + 1
    if (!m.first_name?.trim()) errors.push(`Member ${n}: first name is required.`)
    if (!m.last_name?.trim()) errors.push(`Member ${n}: last name is required.`)
    if (!Number.isInteger(m.birth_year) || m.birth_year < 1900 || m.birth_year > 2100) {
      errors.push(`Member ${n}: birth year must be a whole number between 1900 and 2100.`)
    }
  })

  const { category, season, complete } = options
  if (!complete) return errors
  if (members.length === 0) errors.push('A team needs at least one member.')
  if (!category) return errors
  const { min_team_size: min, max_team_size: max, min_age: minAge, max_age: maxAge } = category
  if (min > 0 && members.length < min) errors.push(`The category requires at least ${min} members.`)
  if (max > 0 && members.length > max) errors.push(`The category allows at most ${max} members.`)
  if (season) {
    members.forEach((m, i) => {
      if (!Number.isInteger(m.birth_year)) return
      const age = season - m.birth_year
      if (minAge > 0 && age < minAge) {
        errors.push(`Member ${i + 1} is ${age} in ${season}; minimum age is ${minAge}.`)
      }
      if (maxAge > 0 && age > maxAge) {
        errors.push(`Member ${i + 1} is ${age} in ${season}; maximum age is ${maxAge}.`)
      }
    })
  }
  return errors
}
