import { pb } from '@/shared/api/pocketbase'
import type { TeamDocumentRecord } from '@/shared/types/records'

// Team documents (M1-13). Managers upload; the coach and event staff read. Files are protected,
// so links need a short-lived file token (see useFileToken).

const documents = () => pb.collection<TeamDocumentRecord>('team_documents')

/** Allowed uploads (mirrors the migration). */
export const DOCUMENT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

/** Documents of the given teams, oldest first. */
export function listTeamDocuments(teamIds: string[]) {
  if (!teamIds.length) return Promise.resolve([] as TeamDocumentRecord[])
  const filter = teamIds.map((_, i) => `team = {:t${i}}`).join(' || ')
  const params = Object.fromEntries(teamIds.map((id, i) => [`t${i}`, id]))
  return documents().getFullList({ filter: pb.filter(filter, params), sort: 'created' })
}

/** Documents of all teams of an event (staff overview). */
export function listEventTeamDocuments(eventId: string) {
  return documents().getFullList({
    filter: pb.filter('team.event = {:event}', { event: eventId }),
    fields: 'id,team',
  })
}

export function uploadTeamDocument(teamId: string, title: string, file: File) {
  const data = new FormData()
  data.append('team', teamId)
  data.append('title', title)
  data.append('file', file)
  return documents().create(data)
}

export function deleteTeamDocument(id: string) {
  return documents().delete(id)
}

/** Download URL of a document's file; `token` from `pb.files.getToken()`. */
export function documentUrl(doc: TeamDocumentRecord, token: string, download = false) {
  return pb.files.getURL(doc, doc.file, { token, ...(download ? { download: true } : {}) })
}

export type DocumentKind = 'image' | 'pdf' | 'other'

export function documentKind(file: string): DocumentKind {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

/** Title for an uploaded file: its name without extension. */
export function defaultTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 100)
}
