import { pb } from '@/shared/api/pocketbase'
import type { MailOutboxRecord, MailStatus, MailTemplateRecord } from '@/shared/types/records'
import type { ScheduleNotices } from './lib'

const templates = () => pb.collection<MailTemplateRecord>('mail_templates')
const outbox = () => pb.collection<MailOutboxRecord>('mail_outbox')

export function listTemplates() {
  return templates().getFullList({ sort: 'name' })
}

export function updateTemplate(
  id: string,
  data: Pick<MailTemplateRecord, 'subject' | 'body' | 'enabled'>,
) {
  return templates().update(id, data)
}

/** Variables each template may use, by template key. */
export function templateVariables() {
  return pb.send<Record<string, string[]>>('/api/mail/templates/variables', {})
}

export function listOutbox(options: { event?: string; status?: MailStatus | ''; page?: number }) {
  const filter = [
    options.event ? pb.filter('event = {:e}', { e: options.event }) : '',
    options.status ? pb.filter('status = {:s}', { s: options.status }) : '',
  ]
    .filter(Boolean)
    .join(' && ')
  return outbox().getList(options.page ?? 1, 50, { filter, sort: '-created', expand: 'team' })
}

export function retryMessage(id: string) {
  return pb.send<MailOutboxRecord>(`/api/mail/outbox/${id}/retry`, { method: 'POST' })
}

export function scheduleNotices(eventId: string) {
  return pb.send<ScheduleNotices>(`/api/events/${eventId}/notifications/schedule`, {})
}

export function notifySchedule(eventId: string, scope: 'changed' | 'all', message: string) {
  return pb.send<{ queued: number }>(`/api/events/${eventId}/notifications/schedule`, {
    method: 'POST',
    body: { scope, message },
  })
}
