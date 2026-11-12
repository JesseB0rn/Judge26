import { config } from '@/shared/config/env'

// M8-11: in development and test, the backend captures every email instead of sending it
// (apps/backend/hooks/mail.pb.js, GET /api/dev/mails). Production builds have no mailbox.

export interface CapturedMail {
  to: string[]
  subject: string
  html: string
  sentAt: string
}

/** The mailbox exists in development and test builds only. */
export const devMailboxEnabled = import.meta.env.VITE_APP_ENV !== 'production'

export async function listCapturedMails(): Promise<CapturedMail[]> {
  const base = config.pocketbaseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/api/dev/mails`)
  if (!res.ok) throw new Error(`Mailbox unavailable (${res.status})`)
  return ((await res.json()) as CapturedMail[]).slice().reverse()
}

/**
 * The email as a standalone document for a sandboxed frame: links open in a new tab, so the
 * links in invitations and resets work from the mailbox.
 */
export function mailDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;margin:16px;color:#111}a{color:#2563eb}</style></head><body>${html}</body></html>`
}
