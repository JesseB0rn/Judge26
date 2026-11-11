// Client-side helpers for email templates and notifications (M7-01 – M7-04). Rendering mirrors
// apps/backend/hooks/lib/mail.js so the preview matches what is sent.
import type { MailStatus } from '@/shared/types/records'

export interface ScheduleItem {
  round: string
  attempt: number
  day: { date: string; label: string } | null
  starts_at: string
  table: string
  sequence: number
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

export const STATUS_LABELS: Record<MailStatus, string> = {
  pending: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
}

/** Example values for the template preview. */
export const SAMPLE_VALUES: Record<string, string> = {
  coach_name: 'Grace Hopper',
  team_name: 'Byte Busters',
  category_name: 'RoboMission Junior',
  event_name: 'WRO National Final',
  team_url: 'https://example.org/teams/abc123',
  review_note: 'Please add the birth year of every member.',
  schedule:
    '<ul><li>Round 1 · Saturday · from 10:00 · table A, position 3</li><li>Round 2 · Saturday · from 13:30 · table B, position 1</li></ul>',
  schedule_text:
    '- Round 1 · Saturday · from 10:00 · table A, position 3\n- Round 2 · Saturday · from 13:30 · table B, position 1',
  message: 'Doors open at 8:00.',
  schedule_url: 'https://example.org/live/xyz789',
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
