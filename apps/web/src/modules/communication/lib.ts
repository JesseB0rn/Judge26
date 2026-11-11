// Client-side helpers for email templates and notifications (M7-01 – M7-04). Rendering mirrors
// apps/backend/hooks/lib/mail.js so the preview matches what is sent.
import { i18n, t, te, translatedLabels, type Locale, type MessageKey } from '@/i18n'
import type { MailStatus, MailTemplateRecord } from '@/shared/types/records'

export interface ScheduleItem {
  round: string
  attempt: number
  day: { date: string; label: string } | null
  starts_at: string
  table: string
  sequence: number
  check?: { day: { date: string; label: string }; starts_at: string } | null
  /** English; shown translated with describeItem. */
  text: string
}

export interface ScheduleNotice {
  team: { id: string; name: string; category: string }
  coach_email: string
  changed: boolean
  notified_at: string
  items: ScheduleItem[]
}

export interface ScheduleNotices {
  teams: ScheduleNotice[]
  changed: number
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
/** Variables the server renders as HTML itself (never escaped). */
const RAW = ['schedule']

export const STATUS_LABELS = translatedLabels<MailStatus>(['pending', 'sent', 'failed'], (s) =>
  t(`communication.status.${s}`),
)

/** Account emails sent by PocketBase itself: always sent, so they cannot be turned off. */
export const ACCOUNT_TEMPLATES = ['auth_verification', 'auth_password_reset']

/** Name of a notification in the current language (the stored name is English). */
export function templateName(template: Pick<MailTemplateRecord, 'key' | 'name'>): string {
  const key = `communication.templates.${template.key}`
  return te(key) ? t(key) : template.name
}

/**
 * One game of a coach's schedule as a line of text, in `language`. Mirrors describeItem in
 * apps/backend/hooks/lib/mail.js (emails use the recipient's language).
 */
export function describeItem(item: ScheduleItem, language: Locale): string {
  const tr = (key: MessageKey, params: Record<string, unknown> = {}) =>
    i18n.global.t(key, params, { locale: language })
  const parts = [
    item.attempt > 1
      ? tr('communication.schedule.attempt', { round: item.round, attempt: item.attempt })
      : item.round,
  ]
  if (item.day) parts.push(item.day.label || item.day.date)
  if (item.starts_at) parts.push(tr('communication.schedule.from', { time: item.starts_at }))
  parts.push(
    item.table
      ? tr('communication.schedule.table', { table: item.table, position: item.sequence })
      : tr('communication.schedule.noTable'),
  )
  if (item.check) {
    const day = item.check.day.label || item.check.day.date
    parts.push(
      tr('communication.schedule.check', { day: `${day} ${item.check.starts_at ?? ''}`.trim() }),
    )
  }
  return parts.join(' · ')
}

/** Example values for the template preview, in the template's language. */
export function sampleValues(language: Locale): Record<string, string> {
  const tr = (key: MessageKey) => i18n.global.t(key, {}, { locale: language })
  const items: ScheduleItem[] = [
    { ...SAMPLE_ITEM, round: tr('communication.sample.round1') },
    {
      ...SAMPLE_ITEM,
      round: tr('communication.sample.round2'),
      starts_at: '13:30',
      table: 'B',
      sequence: 1,
    },
  ].map((i) => ({ ...i, day: { date: '', label: tr('communication.sample.day') } }))
  const lines = items.map((i) => describeItem(i, language))
  return {
    coach_name: 'Grace Hopper',
    team_name: 'Byte Busters',
    category_name: 'RoboMission Junior',
    event_name: 'WRO National Final',
    team_url: 'https://example.org/teams/abc123',
    review_note: tr('communication.sample.reviewNote'),
    schedule: `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    schedule_text: lines.map((l) => `- ${l}`).join('\n'),
    message: tr('communication.sample.message'),
    schedule_url: 'https://example.org/live/xyz789',
    name: 'Grace Hopper',
    action_url: 'https://example.org/auth/verify-email?token=…',
    app_name: 'Judge26',
  }
}

const SAMPLE_ITEM: ScheduleItem = {
  round: '',
  attempt: 1,
  day: null,
  starts_at: '10:00',
  table: 'A',
  sequence: 3,
  text: '',
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Replaces {{name}} placeholders; `html` escapes values except server-rendered ones. */
export function renderTemplate(text: string, values: Record<string, string>, html: boolean) {
  return text.replace(PLACEHOLDER, (_, name: string) => {
    const value = values[name] ?? ''
    return html && !RAW.includes(name) ? escapeHtml(value) : value
  })
}

/** Placeholders in `text` that are not in `allowed`, in order of appearance. */
export function unknownVariables(text: string, allowed: string[]): string[] {
  const unknown: string[] = []
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1]!
    if (!allowed.includes(name) && !unknown.includes(name)) unknown.push(name)
  }
  return unknown
}

/** Full HTML document for previewing a body in a sandboxed iframe. */
export function previewDocument(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;margin:16px;color:#111}a{color:#2563eb}</style></head><body>${body}</body></html>`
}
