import { pb } from '@/shared/api/pocketbase'
import type { CompetitionDayRecord, EventRecord } from '@/shared/types/records'

export type EventInput = Pick<
  EventRecord,
  | 'name'
  | 'season'
  | 'venue'
  | 'description'
  | 'status'
  | 'registration_opens_at'
  | 'registration_closes_at'
>

const events = () => pb.collection<EventRecord>('events')
const days = () => pb.collection<CompetitionDayRecord>('competition_days')

export function listEvents() {
  return events().getFullList({ sort: '-season,name' })
}

export function getEvent(id: string) {
  return events().getOne(id)
}

export function createEvent(data: EventInput) {
  return events().create(data)
}

export function updateEvent(id: string, data: Partial<EventInput>) {
  return events().update(id, data)
}

export function listDays(eventId: string) {
  return days().getFullList({
    filter: pb.filter('event = {:event}', { event: eventId }),
    sort: 'date',
  })
}

export function createDay(eventId: string, date: string, label: string) {
  return days().create({ event: eventId, date, label })
}

export function deleteDay(id: string) {
  return days().delete(id)
}
