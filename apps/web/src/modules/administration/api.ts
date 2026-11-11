import { pb } from '@/shared/api/pocketbase'
import type { AuditLogRecord, Role, RoleAssignmentRecord } from '@/shared/types/records'

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

export interface AuditQuery {
  event?: string
  collection?: string
  search?: string
  page?: number
}

/** Newest first (M7-08); admins see all entries, event managers those of their events. */
export function listAuditLog(query: AuditQuery = {}) {
  const filter = [
    query.event ? pb.filter('event = {:e}', { e: query.event }) : '',
    query.collection ? pb.filter('collection = {:c}', { c: query.collection }) : '',
    query.search
      ? pb.filter('(summary ~ {:q} || actor_label ~ {:q} || action ~ {:q})', { q: query.search })
      : '',
  ]
    .filter(Boolean)
    .join(' && ')
  return pb
    .collection<AuditLogRecord>('audit_log')
    .getList(query.page ?? 1, 50, { filter, sort: '-created,-id' })
}

export type CheckStatus = 'ok' | 'warn' | 'down'
export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthCheck {
  id: 'database' | 'errors' | 'mail' | 'backups'
  label: string
  status: CheckStatus
  detail: string
}

export interface RecentError {
  id: string
  created: string
  source: 'server' | 'browser'
  message: string
  detail: string
  url: string
  status: number | null
}

export interface Monitoring {
  status: HealthStatus
  checked_at: string
  started_at: string
  version: string
  commit: string
  /** Whether MONITORING_ALERT_EMAIL is set. */
  alerts: boolean
  checks: HealthCheck[]
  recent_errors: RecentError[]
}

/** Health checks and recent errors (M7-13, admins; apps/backend/hooks/monitoring.pb.js). */
export function fetchMonitoring() {
  return pb.send<Monitoring>('/api/app/monitoring', { requestKey: 'monitoring' })
}
