import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeEvent, makeRole, mountView } from '@/test/utils'
import type { MailOutboxRecord, MailTemplateRecord } from '@/shared/types/records'
import EventDetailView from '@/modules/events/views/EventDetailView.vue'
import * as eventsApi from '@/modules/events/api'
import * as api from '../api'
import EmailsView from '../views/EmailsView.vue'
import OutboxTable from '../components/OutboxTable.vue'
import ScheduleNotifyCard from '../components/ScheduleNotifyCard.vue'
import TemplateEditor from '../components/TemplateEditor.vue'

vi.mock('../api')
vi.mock('@/modules/events/api')
const mocked = vi.mocked(api)

const base = {
  collectionId: 'c',
  collectionName: 'x',
  created: '2026-06-01 08:00:00.000Z',
  updated: '',
}

function template(overrides: Partial<MailTemplateRecord> = {}): MailTemplateRecord {
  return {
    ...base,
    id: 't1',
    key: 'registration_submitted',
    language: 'en',
    name: 'Registration received',
    enabled: true,
    subject: 'Received: {{team_name}}',
    body: '<p>Hello {{coach_name}}</p>',
    ...overrides,
  }
}

function message(overrides: Partial<MailOutboxRecord> = {}): MailOutboxRecord {
  return {
    ...base,
    id: 'm1',
    template: 'registration_submitted',
    to: 'coach@example.com',
    subject: 'Received: Bots',
    html: '',
    status: 'failed',
    attempts: 5,
    next_attempt_at: '',
    last_error: 'dial tcp: connection refused',
    sent_at: '',
    immediate: true,
    event: 'event1',
    team: 'team1',
    ...overrides,
  }
}

const VARIABLES = ['coach_name', 'team_name', 'category_name', 'event_name', 'team_url']

describe('communication views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listOutbox.mockResolvedValue({
      page: 1,
      perPage: 50,
      totalItems: 1,
      totalPages: 1,
      items: [message()],
    })
  })
  afterEach(() => document.body.replaceChildren())

  describe('template editor (M7-02)', () => {
    it('previews the email with example values, escaped', async () => {
      const { wrapper } = await mountView(TemplateEditor, {
        props: { template: template(), variables: VARIABLES },
      })
      expect(wrapper.get('[data-testid=preview-subject]').text()).toBe('Received: Byte Busters')
      const frame = wrapper.get('[data-testid=preview-body]')
      expect(frame.attributes('sandbox')).toBe('')
      expect(frame.attributes('srcdoc')).toContain('<p>Hello Grace Hopper</p>')
    })

    it('saves subject, body and enabled', async () => {
      mocked.updateTemplate.mockImplementation(async (id, data) => template({ id, ...data }))
      const { wrapper } = await mountView(TemplateEditor, {
        props: { template: template(), variables: VARIABLES },
      })
      expect(buttonByText('Save').disabled).toBe(true) // nothing changed
      await fill('input[name=subject]', 'Thanks {{coach_name}}')
      await wrapper.get('input[name=enabled]').setValue(false)
      await click(buttonByText('Save'))
      expect(mocked.updateTemplate).toHaveBeenCalledWith('t1', {
        subject: 'Thanks {{coach_name}}',
        body: '<p>Hello {{coach_name}}</p>',
        enabled: false,
      })
      expect(wrapper.emitted('saved')).toHaveLength(1)
    })

    it('flags unknown variables and blocks saving', async () => {
      const { wrapper } = await mountView(TemplateEditor, {
        props: { template: template(), variables: VARIABLES },
      })
      await fill('textarea[name=body]', 'Your password: {{password}}')
      expect(wrapper.get('[data-testid=unknown-variables]').text()).toContain('password')
      expect(buttonByText('Save').disabled).toBe(true)
    })

    it('inserts a variable into the body', async () => {
      const { wrapper } = await mountView(TemplateEditor, {
        props: { template: template({ body: 'Hi ' }), variables: VARIABLES },
      })
      await click(buttonByText('{{team_url}}'))
      expect((wrapper.get('textarea[name=body]').element as HTMLTextAreaElement).value).toContain(
        '{{team_url}}',
      )
    })

    it('shows server validation errors on the field', async () => {
      mocked.updateTemplate.mockRejectedValue(
        new ClientResponseError({
          status: 400,
          response: {
            message: 'x',
            data: { body: { code: 'unknown_variable', message: 'Unknown variable: x.' } },
          },
        }),
      )
      const { wrapper } = await mountView(TemplateEditor, {
        props: { template: template(), variables: VARIABLES },
      })
      await fill('input[name=subject]', 'Changed')
      await click(buttonByText('Save'))
      expect(wrapper.text()).toContain('Unknown variable: x.')
    })
  })

  it('the emails page lists templates and switches between them', async () => {
    mocked.listTemplates.mockResolvedValue([
      template(),
      template({
        id: 't2',
        key: 'schedule_changed',
        name: 'Schedule update',
        enabled: false,
        subject: 'Schedule {{team_name}}',
      }),
    ])
    mocked.templateVariables.mockResolvedValue({
      registration_submitted: VARIABLES,
      schedule_changed: ['team_name', 'schedule'],
    })
    const { wrapper } = await mountView(EmailsView, {
      session: { roles: [makeRole('admin')] },
    })
    expect(wrapper.text()).toContain('off')
    expect((wrapper.get('input[name=subject]').element as HTMLInputElement).value).toBe(
      'Received: {{team_name}}',
    )
    await click(buttonByText('Schedule update'))
    expect((wrapper.get('input[name=subject]').element as HTMLInputElement).value).toBe(
      'Schedule {{team_name}}',
    )
    expect(buttonByText('{{schedule}}')).toBeTruthy()
  })

  it('edits each language of a notification separately', async () => {
    mocked.listTemplates.mockResolvedValue([
      template(),
      template({ id: 't2', language: 'de', subject: 'Erhalten: {{team_name}}' }),
    ])
    mocked.templateVariables.mockResolvedValue({ registration_submitted: VARIABLES })
    const { wrapper } = await mountView(EmailsView, {
      session: { roles: [makeRole('admin')] },
    })
    // One entry per notification, not per language.
    expect(wrapper.findAll('nav button')).toHaveLength(1)
    expect((wrapper.get('input[name=subject]').element as HTMLInputElement).value).toBe(
      'Received: {{team_name}}',
    )
    await click(buttonByText('Deutsch'))
    expect((wrapper.get('input[name=subject]').element as HTMLInputElement).value).toBe(
      'Erhalten: {{team_name}}',
    )
    expect(wrapper.get('[data-testid=preview-subject]').text()).toBe('Erhalten: Byte Busters')
  })

  describe('delivery log (M7-01, M7-T12)', () => {
    it('shows failures with their error and retries them', async () => {
      mocked.retryMessage.mockResolvedValue(
        message({
          status: 'sent',
          attempts: 1,
          last_error: '',
          sent_at: '2026-06-01 08:01:00.000Z',
        }),
      )
      const { wrapper } = await mountView(OutboxTable, {
        props: { eventId: 'event1', canRetry: true },
      })
      expect(mocked.listOutbox).toHaveBeenCalledWith({ event: 'event1', status: '' })
      const row = wrapper.get('[data-status=failed]')
      expect(row.text()).toContain('5 attempts')
      expect(row.text()).toContain('connection refused')
      await click(buttonByText('Retry'))
      expect(mocked.retryMessage).toHaveBeenCalledWith('m1')
      expect(wrapper.find('[data-status=failed]').exists()).toBe(false)
      expect(wrapper.get('[data-status=sent]').text()).toContain('Sent')
    })

    it('filters by status; read-only users cannot retry', async () => {
      const { wrapper } = await mountView(OutboxTable, { props: { canRetry: false } })
      expect(() => buttonByText('Retry')).toThrow('No button')
      await wrapper.get('select').setValue('failed')
      await flushPromises()
      expect(mocked.listOutbox).toHaveBeenLastCalledWith({ event: undefined, status: 'failed' })
    })
  })

  describe('schedule notifications (M7-04)', () => {
    const notices = {
      changed: 1,
      teams: [
        {
          team: { id: 'a', name: 'Team A', category: 'c1' },
          coach_email: 'a@example.com',
          changed: true,
          notified_at: '',
          items: [
            {
              round: 'Round 1',
              attempt: 1,
              day: { date: '2026-06-01', label: 'Saturday' },
              starts_at: '10:00',
              table: 'B',
              sequence: 1,
              text: 'Round 1 · Saturday · from 10:00 · table B, position 1',
            },
          ],
        },
        {
          team: { id: 'b', name: 'Team B', category: 'c1' },
          coach_email: 'b@example.com',
          changed: false,
          notified_at: '2026-06-01 07:00:00.000Z',
          items: [],
        },
      ],
    }

    it('M7-T03: shows affected teams and notifies them with a message', async () => {
      mocked.scheduleNotices.mockResolvedValue(notices)
      mocked.notifySchedule.mockResolvedValue({ queued: 1 })
      const { wrapper } = await mountView(ScheduleNotifyCard, {
        props: { eventId: 'event1', editable: true },
      })
      expect(wrapper.get('[data-testid=affected-count]').text()).toBe('1 affected')
      expect(wrapper.get('[data-changed=true]').text()).toContain('table B, position 1')
      expect(wrapper.get('[data-changed=false]').text()).toContain('No games')

      await fill('textarea', ' Table B replaces table A. ')
      await click(buttonByText('Notify affected teams'))
      expect(mocked.notifySchedule).toHaveBeenCalledWith(
        'event1',
        'changed',
        'Table B replaces table A.',
      )
      expect(mocked.scheduleNotices).toHaveBeenCalledTimes(2)
      expect(wrapper.emitted('sent')).toHaveLength(1)
    })

    it('nothing to send when no team is affected; read-only without permission', async () => {
      mocked.scheduleNotices.mockResolvedValue({ ...notices, changed: 0 })
      await mountView(ScheduleNotifyCard, { props: { eventId: 'event1', editable: true } })
      expect(buttonByText('Notify affected teams').disabled).toBe(true)
      await click(buttonByText('Send to all teams'))
      expect(mocked.notifySchedule).toHaveBeenCalledWith('event1', 'all', '')
      document.body.replaceChildren()

      await mountView(ScheduleNotifyCard, { props: { eventId: 'event1', editable: false } })
      expect(() => buttonByText('Notify affected teams')).toThrow('No button')
    })
  })

  it('the Messages tab is only shown to event managers', async () => {
    vi.mocked(eventsApi.getEvent).mockResolvedValue(makeEvent())
    mocked.scheduleNotices.mockResolvedValue({ changed: 0, teams: [] })
    const manager = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    expect(manager.wrapper.text()).toContain('Messages')
    manager.wrapper.unmount()
    document.body.replaceChildren()

    const judge = await mountView(EventDetailView, {
      props: { id: 'event1' },
      session: { roles: [makeRole('judge', 'event1')] },
    })
    expect(judge.wrapper.text()).not.toContain('Messages')
  })
})
