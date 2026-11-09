import { pb } from '@/shared/api/pocketbase'
import type { TeamRecord, TeamStatus } from '@/shared/types/records'
import type { TeamImportData } from './import/csv'

export type TeamInput = Pick<
  TeamRecord,
  'category' | 'name' | 'organization' | 'country' | 'coach_name' | 'coach_email' | 'members'
>

const teams = () => pb.collection<TeamRecord>('teams')

export function listEventTeams(eventId: string) {
  return teams().getFullList({
    filter: pb.filter('event = {:event}', { event: eventId }),
    sort: 'name',
    expand: 'category',
  })
}

export function listOwnTeams(userId: string) {
  return teams().getFullList({
    filter: pb.filter('coach = {:user}', { user: userId }),
    sort: '-created',
    expand: 'event,category',
  })
}

export function getTeam(id: string) {
  return teams().getOne(id, { expand: 'event,category' })
}

export function createTeam(eventId: string, coachId: string, data: TeamInput, status: TeamStatus) {
  return teams().create({ ...data, event: eventId, coach: coachId, status })
}

export function updateTeam(
  id: string,
  data: Partial<TeamInput> & { status?: TeamStatus; review_note?: string },
) {
  return teams().update(id, data)
}

export function deleteTeam(id: string) {
  return teams().delete(id)
}

/** Imports teams in a single transactional batch (all or nothing). */
export async function importTeams(eventId: string, rows: TeamImportData[], status: TeamStatus) {
  const batch = pb.createBatch()
  for (const row of rows) batch.collection('teams').create({ ...row, event: eventId, status })
  return batch.send()
}
