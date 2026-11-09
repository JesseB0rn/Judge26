import { pb } from '@/shared/api/pocketbase'
import type { Role, RoleAssignmentRecord } from '@/shared/types/records'

export interface AdminUser {
  id: string
  name: string
  email: string
  verified: boolean
}

const assignments = () => pb.collection<RoleAssignmentRecord>('role_assignments')

/** Admin-only search by name or email (see apps/backend/hooks/roles.pb.js). */
export function listUsers(search: string) {
  return pb.send<{ total: number; items: AdminUser[] }>('/api/admin/users', {
    query: { q: search, limit: 50 },
  })
}

export function listRoleAssignments(filter: { event?: string; users?: string[] } = {}) {
  const parts: string[] = []
  if (filter.event !== undefined) parts.push(pb.filter('event = {:event}', { event: filter.event }))
  if (filter.users?.length) {
    parts.push(`(${filter.users.map((u) => pb.filter('user = {:u}', { u })).join(' || ')})`)
  }
  return assignments().getFullList({ filter: parts.join(' && '), expand: 'user', sort: 'role' })
}

export function assignRoleByEmail(email: string, role: Role, event: string) {
  return pb.send<RoleAssignmentRecord>('/api/role-assignments/by-email', {
    method: 'POST',
    body: { email, role, event },
  })
}

export function assignRole(user: string, role: Role, event = '') {
  return assignments().create({ user, role, event })
}

export function removeRole(id: string) {
  return assignments().delete(id)
}
