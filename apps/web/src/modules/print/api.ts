import { pb } from '@/shared/api/pocketbase'
import type { PrintData } from './types'

/** Everything the printouts of an event need (event managers, head judges, admins). */
export function getPrintData(eventId: string) {
  return pb.send<PrintData>(`/api/events/${eventId}/print`, { method: 'GET' })
}
