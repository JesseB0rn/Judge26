import { t, translatedLabels } from '@/i18n'
import type { CategoryRecord, TeamMember, TeamStatus } from '@/shared/types/records'

export const TEAM_STATUS_LABELS = translatedLabels<TeamStatus>(
  ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'],
  (status) => t(`teams.status.${status}`),
)

/** Teams are active or withdrawn (M8-A); other statuses remain on teams registered earlier. */
export const CURRENT_STATUSES: TeamStatus[] = ['approved', 'withdrawn']

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
    if (!m.first_name?.trim()) errors.push(t('teams.validation.firstNameRequired', { n }))
    if (!m.last_name?.trim()) errors.push(t('teams.validation.lastNameRequired', { n }))
    if (!Number.isInteger(m.birth_year) || m.birth_year < 1900 || m.birth_year > 2100) {
      errors.push(t('teams.validation.birthYear', { n }))
    }
  })

  const { category, season, complete } = options
  if (!complete) return errors
  if (members.length === 0) errors.push(t('teams.validation.noMembers'))
  if (!category) return errors
  const { min_team_size: min, max_team_size: max, min_age: minAge, max_age: maxAge } = category
  if (min > 0 && members.length < min) errors.push(t('teams.validation.tooFew', { min }))
  if (max > 0 && members.length > max) errors.push(t('teams.validation.tooMany', { max }))
  if (season) {
    members.forEach((m, i) => {
      if (!Number.isInteger(m.birth_year)) return
      const age = season - m.birth_year
      if (minAge > 0 && age < minAge) {
        errors.push(t('teams.validation.tooYoung', { n: i + 1, age, season, minAge }))
      }
      if (maxAge > 0 && age > maxAge) {
        errors.push(t('teams.validation.tooOld', { n: i + 1, age, season, maxAge }))
      }
    })
  }
  return errors
}
