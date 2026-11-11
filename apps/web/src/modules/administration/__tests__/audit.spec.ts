import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { click, makeEvent, makeRole, mountView } from '@/test/utils'
import * as eventsApi from '@/modules/events/api'
import EventDetailView from '@/modules/events/views/EventDetailView.vue'
import type { AuditLogRecord } from '@/shared/types/records'
import * as api from '../api'
import AuditLogTable from '../components/AuditLogTable.vue'
import AuditLogView from '../views/AuditLogView.vue'

vi.mock('../api')
vi.mock('@/modules/events/api')
const mocked = vi.mocked(api)

function entry(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: 'a1',
    collectionId: 'audit',
    collectionName: 'audit_log',
    created: '2026-06-01 08:00:00.000Z',
    updated: '',
    actor: 'u1',
    actor_label: 'manager@example.com',
    action: 'update',
    collection: 'teams',
    record: 't1',
    event: 'event1',
    summary: 'Updated team “Robo Rangers”: status submitted → approved',
    changes: { status: ['submitted', 'approved'], members: ['[changed]', '[changed]'] },
    ip: '10.0.0.7',
    ...overrides,
  }
}

const page = (items: AuditLogRecord[], totalItems = items.length) => ({
  page: 1,
  perPage: 50,
  totalItems,
  totalPages: 1,
  items,
})

describe('audit log (M7-08)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listAuditLog.mockResolvedValue(page([entry()]))
  })
  afterEach(() => document.body.replaceChildren())

  it('lists who did what, with the changed fields on demand', async () => {
    const { wrapper } = await mountView(AuditLogView, { session: { roles: [makeRole('admin')] } })
    expect(mocked.listAuditLog).toHaveBeenCalledWith({
      event: undefined,
      collection: '',
      search: '',
      page: 1,
    })
    const row = wrapper.get('[data-action=update]').text()
    expect(row).toContain('manager@example.com')
    expect(row).toContain('10.0.0.7')
    expect(row).toContain('status submitted → approved')
    expect(row).toContain('Teams · update')

    await click(wrapper.get('button[aria-label^="Details of"]').element as HTMLElement)
    const details = wrapper.get('[data-testid=changes-a1]').text()
    expect(details).toContain('status')
    expect(details).toContain('→ approved')
    expect(details).toContain('[changed]')
  })

  it('filters by area and search, and loads more', async () => {
    mocked.listAuditLog.mockResolvedValue(page([entry()], 2))
    const { wrapper } = await mountView(AuditLogTable, { props: { eventId: 'event1' } })
    vi.useFakeTimers()
    await wrapper.get('select').setValue('games')
    await wrapper.get('input[type=search]').setValue('correct')
    await vi.advanceTimersByTimeAsync(400)
    vi.useRealTimers()
    await flushPromises()
    expect(mocked.listAuditLog).toHaveBeenLastCalledWith({
      event: 'event1',
      collection: 'games',
      search: 'correct',
      page: 1,
    })

    mocked.listAuditLog.mockResolvedValue(page([entry({ id: 'a2', summary: 'Older' })], 2))
    await click(wrapper.findAll('button').find((b) => b.text() === 'Load more')!.element)
    expect(mocked.listAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(wrapper.findAll('[data-action=update]')).toHaveLength(2)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Load more')).toBe(false)
  })

  it('event managers see the Activity tab of their event; judges do not', async () => {
    vi.mocked(eventsApi.getEvent).mockResolvedValue(makeEvent())
    const manager = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(manager.wrapper.findAll('[role=tab]').map((t) => t.text())).toContain('Activity')
    manager.wrapper.unmount()
    document.body.replaceChildren()
    const judge = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('judge', 'event1')] },
    })
    expect(judge.wrapper.findAll('[role=tab]').map((t) => t.text())).not.toContain('Activity')
  })
})
