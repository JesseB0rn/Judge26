import { pb } from '@/shared/api/pocketbase'
import type { CategoryRecord, RankingSnapshotRecord } from '@/shared/types/records'
import type { PublicEvent, PublicEventSummary, PublicRanking } from './types'

// --- Public API (no sign-in required) ---

export function listPublicEvents() {
  return pb.send<PublicEventSummary[]>('/api/public/events', { method: 'GET' })
}

export function getPublicEvent(id: string) {
  return pb.send<PublicEvent>(`/api/public/events/${id}`, { method: 'GET' })
}

export function getPublicRanking(categoryId: string) {
  return pb.send<PublicRanking>(`/api/public/categories/${categoryId}/ranking`, { method: 'GET' })
}

/** Current revision of an event's public data (0 if nothing was recorded yet). */
export async function getRevision(eventId: string): Promise<number> {
  const page = await pb.collection('live_revisions').getList(1, 1, {
    filter: pb.filter('event = {:event}', { event: eventId }),
  })
  return (page.items[0]?.revision as number | undefined) ?? 0
}

/** Realtime notification whenever the event's revision changes. Resolves to an unsubscribe. */
export async function subscribeRevision(eventId: string, callback: (revision: number) => void) {
  // Without server-sent events the caller falls back to polling.
  if (typeof EventSource === 'undefined') throw new Error('Realtime is not supported.')
  return pb.collection('live_revisions').subscribe(
    '*',
    (e) => {
      if (e.record.event === eventId) callback(e.record.revision as number)
    },
    { filter: pb.filter('event = {:event}', { event: eventId }) },
  )
}

// --- Publication (event managers, M6-10) ---

export function listEventSnapshots(eventId: string) {
  return pb.collection<RankingSnapshotRecord>('ranking_snapshots').getFullList({
    filter: pb.filter('category.event = {:event}', { event: eventId }),
    sort: '-created',
    fields: 'id,category,title,created,fingerprint',
  })
}

export function updatePublication(
  categoryId: string,
  data: { public_live?: boolean; published_snapshot?: string },
) {
  return pb.collection<CategoryRecord>('categories').update(categoryId, data)
}
