import type { useSessionStore } from '@/shared/auth/session'
import type { EventStatus } from '@/shared/types/records'

/** The places of an event (M11-17): tabs of the event page plus the planner and print center. */
export const EVENT_TABS = [
  'overview',
  'setup',
  'categories',
  'teams',
  'staff',
  'assignments',
  'publication',
  'messages',
  'activity',
] as const
export type EventTab = (typeof EVENT_TABS)[number]
export type EventSection = EventTab | 'planner' | 'print'

export interface EventAccess {
  canManage: boolean
  isStaff: boolean
  canReview: boolean
  status: EventStatus | string
}

/** What the signed-in user may do in an event, as the navigation needs it. */
export function eventAccess(
  session: ReturnType<typeof useSessionStore>,
  eventId: string,
  status: EventStatus | string,
): EventAccess {
  const canManage = session.canManageEvent(eventId)
  return {
    canManage,
    isStaff: session.isEventStaff(eventId),
    canReview: canManage || session.rolesFor(eventId).includes('head_judge'),
    status,
  }
}

/** Whether a user may open a section; the same rules the tabs and header buttons had. */
export function canSee(section: EventSection, a: EventAccess): boolean {
  switch (section) {
    case 'overview':
    case 'categories':
      return true
    case 'teams':
    case 'assignments':
      return a.isStaff
    case 'planner':
      return a.isStaff || a.status !== 'draft'
    case 'print':
      return a.canReview
    default:
      return a.canManage
  }
}

/**
 * The navigation in four groups (M11-17): getting started, what takes part, where and when,
 * and what goes out. Empty groups are dropped so no divider stands alone.
 */
export function eventSections(a: EventAccess): EventSection[][] {
  const groups: EventSection[][] = [
    ['overview', 'setup'],
    ['categories', 'teams', 'staff'],
    ['assignments', 'planner', 'print'],
    ['publication', 'messages', 'activity'],
  ]
  return groups.map((g) => g.filter((s) => canSee(s, a))).filter((g) => g.length)
}

/**
 * M11-21: without `?tab=`, an event manager lands on Setup while the event is a draft;
 * everyone else, and every published or archived event, on Overview.
 */
export function defaultTab(a: EventAccess): EventTab {
  return a.canManage && a.status === 'draft' ? 'setup' : 'overview'
}
