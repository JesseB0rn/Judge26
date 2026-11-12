import { pb } from '@/shared/api/pocketbase'
import type { EventRecord, EventTemplateFile, EventTemplateRecord } from '@/shared/types/records'

/**
 * Event templates (M8-21 – M8-24) and the setup checklist (M8-20).
 * See docs/specifications/M8-event-setup.md and apps/backend/hooks/templates.pb.js.
 */

const templates = () => pb.collection<EventTemplateRecord>('event_templates')

/** The template library (admins). */
export function listEventTemplates() {
  return templates().getFullList({ sort: 'name' })
}

export function getEventTemplate(id: string) {
  return templates().getOne(id)
}

export function renameEventTemplate(id: string, data: { name: string; description: string }) {
  return templates().update(id, data)
}

export function deleteEventTemplate(id: string) {
  return templates().delete(id)
}

/** Uploads a template file's text into the library; the server validates it (M8-22). */
export function uploadEventTemplate(content: string, name = '') {
  return pb.send<EventTemplateRecord>('/api/event-templates', {
    method: 'POST',
    body: { content, name },
  })
}

/** The event's setup as a template file (event managers and admins). */
export function exportEventTemplate(eventId: string) {
  return pb.send<EventTemplateFile>(`/api/events/${eventId}/template`, { method: 'GET' })
}

/** Saves the event's setup into the library (admins). */
export function saveEventAsTemplate(eventId: string, data: { name: string; description: string }) {
  return pb.send<EventTemplateRecord>(`/api/events/${eventId}/template`, {
    method: 'POST',
    body: data,
  })
}

export interface NewEventInput {
  name: string
  /** YYYY-MM-DD; the template's first day moves here. */
  first_day: string
  season?: number
  venue?: string
}

export function createEventFromTemplate(templateId: string, input: NewEventInput) {
  return pb.send<EventRecord>(`/api/event-templates/${templateId}/events`, {
    method: 'POST',
    body: input,
  })
}

export type SetupStepKey =
  'days' | 'categories' | 'rounds' | 'tables' | 'teams' | 'judges' | 'schedule' | 'publish'

export interface SetupStep {
  key: SetupStepKey
  done: boolean
  /** Steps whose data this one builds on. */
  needs: SetupStepKey[]
  count?: number
  /** Category codes still missing this step. */
  missing?: string[]
  tables_without_judges?: number
  placed?: number
  expected?: number
  timed?: number
  rounds?: number
  status?: string
}

export interface SetupStatus {
  steps: SetupStep[]
  complete: boolean
}

export function getSetupStatus(eventId: string) {
  return pb.send<SetupStatus>(`/api/events/${eventId}/setup`, { method: 'GET' })
}
