import type { RouteLocationRaw } from 'vue-router'
import type { AuthRecord } from 'pocketbase'
import { pb } from '@/shared/api/pocketbase'
import type { Role } from '@/shared/types/records'

/**
 * Admin "view as" (M8-C): the admin's requests are made with a token of another account, so the
 * API applies that role's permissions. The admin's own sign-in is kept aside until they exit.
 * See docs/specifications/M8-view-as.md.
 */

export type ViewAsRole = Exclude<Role, 'admin'>
export const VIEW_AS_ROLES: ViewAsRole[] = ['event_manager', 'head_judge', 'judge']

export interface ViewSession {
  id: string
  role: ViewAsRole
  event: { id: string; name: string }
  /** The person viewed as (M8-16); null for "anyone with the role". */
  persona: { id: string; name: string; email: string } | null
  read_only: boolean
  admin: { id: string; name: string; email: string }
  expires_at: string
}

interface Started {
  token: string
  record: AuthRecord
  session: ViewSession
}

interface Stored {
  admin: { token: string; record: AuthRecord }
  session: ViewSession
}

const KEY = 'judge26_view_as'

export function storedViewAs(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Stored) : null
    return parsed?.admin?.token && parsed.session?.id ? parsed : null
  } catch {
    return null
  }
}

export function storeViewAs(value: Stored | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the switch then lasts until the page is reloaded.
  }
}

export function startViewAs(input: { event: string; role: ViewAsRole; user?: string }) {
  return pb.send<Started>('/api/view-as', { method: 'POST', body: input })
}

export async function currentViewAs() {
  return (await pb.send<{ session: ViewSession }>('/api/view-as', {})).session
}

export function endViewAs() {
  return pb.send('/api/view-as/end', { method: 'POST' })
}

/** Where each role starts (as on the dashboard's role chips). */
export function roleHome(role: Role, event: string): RouteLocationRaw {
  if (role === 'judge') return { name: 'judging' }
  if (role === 'head_judge') return { name: 'review', query: { event } }
  return { name: 'event', params: { id: event } }
}

/** Alt+Shift+V switches and, while switched, returns to admin (M8-13, M8-15). */
export function isViewAsHotkey(e: KeyboardEvent) {
  return e.code === 'KeyV' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey
}
