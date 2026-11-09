/** Formats a PocketBase datetime ("2026-05-01 08:00:00.000Z") for display. */
export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '–'
  const date = new Date(value.replace(' ', 'T'))
  if (isNaN(date.getTime())) return '–'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Formats a calendar date (YYYY-MM-DD) without time zone conversion. */
export function formatDay(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Converts a PocketBase datetime to a `datetime-local` input value (local time). */
export function toDateTimeLocal(value: string | undefined | null): string {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Converts a `datetime-local` input value to an ISO string for PocketBase ("" stays ""). */
export function fromDateTimeLocal(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return isNaN(date.getTime()) ? '' : date.toISOString()
}
