import { t, translatedLabels } from '@/i18n'
import type { EventRecord, EventStatus } from '@/shared/types/records'

export const EVENT_STATUS_LABELS = translatedLabels<EventStatus>(
  ['draft', 'published', 'archived'],
  (status) => t(`events.status.${status}`),
)

function parse(value: string): Date | null {
  if (!value) return null
  const date = new Date(value.replace(' ', 'T'))
  return isNaN(date.getTime()) ? null : date
}

/** Mirrors the backend rule for coach registrations (M1-10). */
export function isRegistrationOpen(
  event: Pick<EventRecord, 'status' | 'registration_opens_at' | 'registration_closes_at'>,
  now: Date = new Date(),
): boolean {
  if (event.status !== 'published') return false
  const opens = parse(event.registration_opens_at)
  const closes = parse(event.registration_closes_at)
  if (opens && opens > now) return false
  if (closes && closes <= now) return false
  return true
}

export function registrationSummary(
  event: Pick<EventRecord, 'status' | 'registration_opens_at' | 'registration_closes_at'>,
  now: Date = new Date(),
): string {
  if (event.status === 'archived') return t('events.registration.archived')
  if (event.status === 'draft') return t('events.registration.unpublished')
  const opens = parse(event.registration_opens_at)
  if (opens && opens > now) return t('events.registration.notYetOpen')
  return isRegistrationOpen(event, now)
    ? t('events.registration.open')
    : t('events.registration.closed')
}
