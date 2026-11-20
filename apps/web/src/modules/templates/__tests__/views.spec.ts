import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { flushPromises } from '@vue/test-utils'
import { buttonByText, click, fill, makeEvent, makeRole, mountView } from '@/test/utils'
import type { EventTemplateRecord } from '@/shared/types/records'
import * as api from '../api'
import * as lib from '../lib'
import EventSetupChecklist from '../components/EventSetupChecklist.vue'
import NewEventFromTemplateDialog from '../components/NewEventFromTemplateDialog.vue'
import SaveTemplateDialog from '../components/SaveTemplateDialog.vue'
import TemplateLibraryView from '../views/TemplateLibraryView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const file = {
  format: 'judge26.event-template',
  version: 1,
  name: 'Swiss final',
  description: '',
  days: [
    { offset: 0, label: 'Sat' },
    { offset: 1, label: 'Sun' },
  ],
  categories: [
    { code: 'RMJ', name: 'Junior' },
    { code: 'RME', name: 'Elementary' },
  ],
  tables: [{ name: 'Table 1' }],
}

const stored: EventTemplateRecord = {
  id: 'tpl1',
  collectionId: 'event_templates',
  collectionName: 'event_templates',
  created: '',
  updated: '',
  name: 'Swiss final',
  description: 'Two days',
  data: file,
  format_version: 1,
  origin: 'upload',
  created_by: '',
}

const admin = { roles: [makeRole('admin')] }

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listEventTemplates.mockResolvedValue([stored])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => document.body.replaceChildren())

describe('template library (M8-24)', () => {
  it('lists templates with their contents', async () => {
    const { wrapper } = await mountView(TemplateLibraryView, { session: admin })
    const row = wrapper.get('[data-template="Swiss final"]').text()
    expect(row).toContain('Two days')
    expect(row).toContain('2 days')
    expect(row).toContain('RMJ, RME')
    expect(row).toContain('1 table')
    expect(row).toContain('Uploaded file')
  })

  it('M8-22: uploads a file and shows why the server rejected it', async () => {
    mocked.uploadEventTemplate.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: {
          message: 'newer',
          data: {
            _error: {
              code: 'template_too_new',
              message: 'newer',
              params: { version: 3, supported: 1 },
            },
          },
        },
      }),
    )
    const { wrapper } = await mountView(TemplateLibraryView, { session: admin })
    const input = wrapper.get('[data-testid=template-upload]').element as HTMLInputElement
    const upload = new File(['{"format":"judge26.event-template","version":3}'], 't.json')
    Object.defineProperty(input, 'files', { value: [upload] })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    await flushPromises()
    expect(mocked.uploadEventTemplate).toHaveBeenCalledWith(
      '{"format":"judge26.event-template","version":3}',
    )
    expect(wrapper.text()).toContain(
      'This template was made with a newer version of Judge26 (format 3); this installation reads format 1.',
    )
  })

  it('downloads, renames and deletes templates', async () => {
    const download = vi.spyOn(lib, 'downloadTemplate').mockImplementation(() => {})
    mocked.renameEventTemplate.mockResolvedValue(stored)
    mocked.deleteEventTemplate.mockResolvedValue(true)
    const { wrapper } = await mountView(TemplateLibraryView, { session: admin })
    await wrapper.get('[aria-label="Download Swiss final"]').trigger('click')
    expect(download).toHaveBeenCalledWith(file, 'Swiss final')

    await wrapper.get('[aria-label="Edit Swiss final"]').trigger('click')
    await flushPromises()
    await fill('[role=dialog] input[required]', 'Regional')
    await click(buttonByText('Save'))
    expect(mocked.renameEventTemplate).toHaveBeenCalledWith('tpl1', {
      name: 'Regional',
      description: 'Two days',
    })

    await wrapper.get('[aria-label="Delete Swiss final"]').trigger('click')
    await flushPromises()
    expect(mocked.deleteEventTemplate).toHaveBeenCalledWith('tpl1')
  })
})

describe('new event from template (M8-23)', () => {
  it('asks for name and first day and creates the event', async () => {
    mocked.createEventFromTemplate.mockResolvedValue(makeEvent({ id: 'new' }))
    const { wrapper } = await mountView(NewEventFromTemplateDialog, {
      props: { open: false },
      session: admin,
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    // The only template is preselected.
    expect(document.querySelector('[data-testid=template-summary]')?.textContent).toContain(
      'RMJ, RME',
    )
    await fill('[role=dialog] input[maxlength="200"][required]', 'Final 2027')
    await fill('[role=dialog] input[type=date]', '2027-05-15')
    await click(buttonByText('Create event'))
    expect(mocked.createEventFromTemplate).toHaveBeenCalledWith('tpl1', {
      name: 'Final 2027',
      first_day: '2027-05-15',
    })
    expect(wrapper.emitted('created')?.[0]).toEqual([makeEvent({ id: 'new' })])
  })
})

describe('save as template (M8-21)', () => {
  it('admins save to the library; everyone with access can download the file', async () => {
    mocked.saveEventAsTemplate.mockResolvedValue(stored)
    const { wrapper } = await mountView(SaveTemplateDialog, {
      props: { open: false, event: makeEvent({ name: 'Final 2026' }) },
      session: admin,
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    await click(buttonByText('Save to library'))
    expect(mocked.saveEventAsTemplate).toHaveBeenCalledWith('event1', {
      name: 'Final 2026',
      description: '',
    })
  })

  it('event managers only download, and are told why', async () => {
    const download = vi.spyOn(lib, 'downloadTemplate').mockImplementation(() => {})
    mocked.exportEventTemplate.mockResolvedValue(file)
    const { wrapper } = await mountView(SaveTemplateDialog, {
      props: { open: false, event: makeEvent() },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(document.body.textContent).toContain('Only admins keep templates in the library.')
    expect(() => buttonByText('Save to library')).toThrow('No button "Save to library"')
    await click(buttonByText('Download file'))
    expect(mocked.exportEventTemplate).toHaveBeenCalledWith('event1')
    expect(download).toHaveBeenCalled()
  })
})

describe('setup checklist (M8-20)', () => {
  it('shows what is done, what is missing and what a step waits for', async () => {
    mocked.getSetupStatus.mockResolvedValue({
      complete: false,
      steps: [
        { key: 'days', done: true, needs: [], count: 2 },
        { key: 'categories', done: false, needs: [], count: 2, missing: ['RME'] },
        {
          key: 'rounds',
          done: false,
          needs: ['days', 'categories'],
          count: 0,
          missing: ['RMJ', 'RME'],
        },
        { key: 'teams', done: true, needs: ['categories'], count: 12 },
        { key: 'judges', done: true, needs: [], count: 3 },
        {
          key: 'tables',
          done: false,
          needs: ['categories', 'judges'],
          count: 2,
          tables_without_judges: 1,
          tables_without_judges_names: ['Table 2'],
        },
        {
          key: 'schedule',
          done: false,
          needs: ['days', 'rounds', 'tables', 'teams'],
          placed: 4,
          expected: 36,
          timed: 0,
          rounds: 3,
        },
        { key: 'publish', done: false, needs: ['schedule'], status: 'draft' },
      ],
    })
    const { wrapper } = await mountView(EventSetupChecklist, {
      props: { event: makeEvent() },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    const step = (key: string) => wrapper.get(`[data-step=${key}]`)
    expect(wrapper.get('[data-testid=setup-progress]').text()).toBe('3 of 8 steps done')
    // M9-C: tables come after teams and judges.
    expect(wrapper.findAll('[data-step]').map((s) => s.attributes('data-step'))).toEqual([
      'days',
      'categories',
      'rounds',
      'teams',
      'judges',
      'tables',
      'schedule',
      'publish',
    ])
    expect(step('days').attributes('data-done')).toBe('true')
    expect(step('days').text()).toContain('2 days')
    expect(step('categories').text()).toContain('Without a published ruleset: RME')
    expect(step('rounds').text()).toContain('Needs Categories and rulesets first.')
    expect(step('teams').text()).not.toContain('Needs')
    // M11-09: the tables without a judge are named.
    expect(step('tables').text()).toContain('Table 2 has no judge')
    expect(step('tables').text()).toContain('Needs Categories and rulesets first.')
    expect(step('judges').text()).toContain('3 judges')
    // M11-06 / M11-T08: placing and timing are separate lines with their own links.
    const line = (key: string) => step('schedule').get(`[data-line=${key}]`)
    expect(line('placed').text()).toContain('4 of 36 games placed')
    expect(line('placed').get('a').attributes('href')).toContain('tab=assignments')
    expect(line('timed').text()).toContain('0 of 3 rounds timed')
    expect(line('timed').get('a').text()).toContain('Planner')
    // Rounds and categories open the Categories tab, where both are visible.
    expect(step('rounds').find('a').attributes('href')).toContain('tab=categories')
    expect(step('categories').find('a').attributes('href')).toContain('tab=categories')
    // Days and teams are done, so the schedule only waits for rounds and tables.
    expect(step('schedule').text()).toContain('Needs Rounds, Tables and judges first.')
    expect(step('tables').find('a').attributes('href')).toContain('tab=assignments')
    expect(step('publish').find('a').exists()).toBe(false)
    // M11-08: the planner returns to the checklist.
    const planner = step('schedule')
      .findAll('a')
      .find((a) => a.attributes('href')?.includes('__event-planner'))!
    expect(decodeURIComponent(planner.attributes('href')!)).toContain(
      'from=/events/event1?tab=setup',
    )
  })

  it('M10-30 / M10-T45: the publish row publishes like the header button', async () => {
    mocked.getSetupStatus.mockResolvedValue({
      complete: false,
      steps: [{ key: 'publish', done: false, needs: ['schedule'], status: 'draft' }],
    })
    const { wrapper } = await mountView(EventSetupChecklist, {
      props: { event: makeEvent({ status: 'draft' }) },
      session: { roles: [makeRole('event_manager', 'event1')] },
    })
    await click(wrapper.get('[data-testid=setup-publish]').element as HTMLElement)
    expect(wrapper.emitted('publish')).toHaveLength(1)
    // Once published (here or in the header) the button is gone and the checklist reloads.
    await wrapper.setProps({ event: makeEvent({ status: 'published' }) })
    await flushPromises()
    expect(wrapper.find('[data-testid=setup-publish]').exists()).toBe(false)
    expect(mocked.getSetupStatus).toHaveBeenCalledTimes(2)
  })
})
