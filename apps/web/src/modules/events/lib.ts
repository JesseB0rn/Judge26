import type { EventRecord, EventStatus } from '@/shared/types/records'

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

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
  if (event.status === 'archived') return 'Event archived'
  if (event.status === 'draft') return 'Not yet published'
  const opens = parse(event.registration_opens_at)
  if (opens && opens > now) return 'Registration not yet open'
  return isRegistrationOpen(event, now) ? 'Registration open' : 'Registration closed'
}
