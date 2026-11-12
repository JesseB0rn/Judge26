import { pb } from '@/shared/api/pocketbase'
import type { Role } from '@/shared/types/records'

// Event staff and judge invitations (M8-B, apps/backend/hooks/invitations.pb.js).

export type StaffStatus = 'active' | 'invited' | 'expired' | 'revoked'
export type InvitationStatus = 'invited' | 'expired' | 'accepted' | 'revoked'

export interface StaffMember {
  /** Role assignment id; empty for revoked invitations. */
  id: string
  role: Role
  status: StaffStatus
  user: { id: string; name: string; email: string; verified: boolean }
  invitation: {
    id: string
    status: InvitationStatus
    sent_at: string
    expires_at: string
    accepted_at: string
  } | null
}

export interface InviteInput {
  line?: number
  name: string
  email: string
  role?: Role
}

/** invite: new account and invitation email; add: existing account gets the role. */
export type InviteRowStatus = 'invite' | 'add' | 'already' | 'duplicate' | 'invalid'
export type InviteRowError =
  'name_required' | 'name_too_long' | 'email_required' | 'invalid_email' | 'invalid_role'

export interface InviteRow {
  line: number
  name: string
  email: string
  role: Role
  status: InviteRowStatus
  errors: InviteRowError[]
}

export interface InviteResult {
  rows: InviteRow[]
  counts: Record<InviteRowStatus, number>
}

export function listStaff(eventId: string) {
  return pb.send<StaffMember[]>(`/api/events/${eventId}/staff`, {})
}

export function removeStaff(eventId: string, assignmentId: string) {
  return pb.send(`/api/events/${eventId}/staff/${assignmentId}`, { method: 'DELETE' })
}

/** What inviting these rows would do; changes nothing. */
export function previewInvitations(eventId: string, rows: InviteInput[]) {
  return pb.send<InviteResult>(`/api/events/${eventId}/invitations/preview`, {
    method: 'POST',
    body: { rows },
  })
}

export function invite(eventId: string, rows: InviteInput[]) {
  return pb.send<InviteResult>(`/api/events/${eventId}/invitations`, {
    method: 'POST',
    body: { rows },
  })
}

export function resendInvitation(id: string) {
  return pb.send<{ id: string; status: InvitationStatus; expires_at: string }>(
    `/api/invitations/${id}/resend`,
    { method: 'POST' },
  )
}

export function revokeInvitation(id: string) {
  return pb.send(`/api/invitations/${id}/revoke`, { method: 'POST' })
}

export type InvitationLookup =
  | {
      status: 'invited'
      name: string
      email: string
      role: Role
      event: { id: string; name: string }
      expires_at: string
    }
  | { status: 'invalid' | 'expired' | 'revoked' | 'accepted' }

/** Public: what an invitation link is for (the accept page). */
export function lookupInvitation(token: string) {
  return pb.send<InvitationLookup>('/api/invitations/lookup', { query: { token } })
}

export function acceptInvitation(token: string, password: string, passwordConfirm: string) {
  return pb.send<{ email: string; role: Role; event: string }>('/api/invitations/accept', {
    method: 'POST',
    body: { token, password, passwordConfirm },
  })
}
