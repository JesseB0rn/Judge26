import { localeTag } from '@/i18n'

/** Formats a PocketBase datetime ("2026-05-01 08:00:00.000Z") for display. */
export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '–'
  const date = new Date(value.replace(' ', 'T'))
  if (isNaN(date.getTime())) return '–'
  return date.toLocaleString(localeTag(), { dateStyle: 'medium', timeStyle: 'short' })
}

/** Formats a calendar date (YYYY-MM-DD) without time zone conversion. */
export function formatDay(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeTag(), {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Formats a time of day ("14:05") in the current language. */
export function formatTime(date: Date, seconds = false): string {
  return date.toLocaleTimeString(localeTag(), {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}

/** Formats a number in the current language (de-CH: 1’234.5). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(localeTag(), options)
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
