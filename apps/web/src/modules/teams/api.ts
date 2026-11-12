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

export function getTeam(id: string) {
  return teams().getOne(id, { expand: 'event,category' })
}

/** New teams are active (M8-03). */
export function createTeam(eventId: string, data: TeamInput) {
  return teams().create({ ...data, event: eventId, status: 'approved' })
}

export function updateTeam(id: string, data: Partial<TeamInput> & { status?: TeamStatus }) {
  return teams().update(id, data)
}

export function deleteTeam(id: string) {
  return teams().delete(id)
}

/** Imports active teams in a single transactional batch (all or nothing). */
export async function importTeams(eventId: string, rows: TeamImportData[]) {
  const batch = pb.createBatch()
  for (const row of rows) {
    batch.collection('teams').create({ ...row, event: eventId, status: 'approved' })
  }
  return batch.send()
}
