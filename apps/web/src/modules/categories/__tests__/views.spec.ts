import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buttonByText,
  click,
  fill,
  makeCategory,
  makeEvent,
  makeRole,
  mountView,
} from '@/test/utils'
import * as api from '../api'
import * as eventsApi from '@/modules/events/api'
import EventCategoriesTab from '../components/EventCategoriesTab.vue'
import CategoryLibraryView from '../views/CategoryLibraryView.vue'

vi.mock('../api')
vi.mock('@/modules/events/api')
const mocked = vi.mocked(api)

const template = makeCategory({ id: 'tpl', event: '', code: 'FI-TPL', name: 'Future Innovators' })

describe('category views', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.listEventCategories.mockResolvedValue([makeCategory()])
    mocked.listTemplates.mockResolvedValue([template])
    vi.mocked(eventsApi.listEvents).mockResolvedValue([
      makeEvent(),
      makeEvent({ id: 'old', status: 'archived' }),
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => document.body.replaceChildren())

  it('lists event categories with limits', async () => {
    const { wrapper } = await mountView(EventCategoriesTab, {
      props: { event: makeEvent(), editable: false },
    })
    expect(wrapper.text()).toContain('RM-J')
    expect(wrapper.text()).toContain('2–3')
    expect(wrapper.text()).toContain('11–15')
    expect(wrapper.text()).not.toContain('New category')
  })

  it('creates a category in the event (M1-08)', async () => {
    mocked.createCategory.mockResolvedValue(makeCategory())
    await mountView(EventCategoriesTab, { props: { event: makeEvent(), editable: true } })
    await click(buttonByText('New category'))
    await fill('[role=dialog] input[required]:not([pattern])', 'RoboMission Senior')
    await fill('[role=dialog] input[pattern]', 'RM-S')
    await click(buttonByText('Save'))
    expect(mocked.createCategory).toHaveBeenCalledWith(
      'event1',
      expect.objectContaining({ name: 'RoboMission Senior', code: 'RM-S', min_team_size: 2 }),
    )
  })

  it('adds a category from a template (M1-09)', async () => {
    mocked.copyCategory.mockResolvedValue(makeCategory())
    await mountView(EventCategoriesTab, { props: { event: makeEvent(), editable: true } })
    await click(buttonByText('Add from template'))
    await fill('[role=dialog] input[pattern]', 'FI')
    await click(buttonByText('Copy'))
    expect(mocked.copyCategory).toHaveBeenCalledWith('tpl', { event: 'event1', code: 'FI' })
  })

  it('admins save event categories as templates', async () => {
    mocked.copyCategory.mockResolvedValue(template)
    const { wrapper } = await mountView(EventCategoriesTab, {
      props: { event: makeEvent(), editable: true },
      session: { roles: [makeRole('admin')] },
    })
    await click(wrapper.get('button[aria-label="Save RM-J as template"]').element as HTMLElement)
    await click(buttonByText('Copy'))
    expect(mocked.copyCategory).toHaveBeenCalledWith('cat1', { event: '', code: undefined })
  })

  it('deletes categories after confirmation', async () => {
    mocked.deleteCategory.mockResolvedValue(true)
    const { wrapper } = await mountView(EventCategoriesTab, {
      props: { event: makeEvent(), editable: true },
    })
    await click(wrapper.get('button[aria-label="Delete RM-J"]').element as HTMLElement)
    expect(mocked.deleteCategory).toHaveBeenCalledWith('cat1')
  })

  it('library copies templates into non-archived events (M1-T07)', async () => {
    mocked.copyCategory.mockResolvedValue(makeCategory())
    const { wrapper } = await mountView(CategoryLibraryView, {
      session: { roles: [makeRole('admin')] },
    })
    expect(wrapper.text()).toContain('FI-TPL')
    await click(wrapper.get('button[aria-label="Copy FI-TPL to event"]').element as HTMLElement)
    const options = [...document.querySelectorAll('[role=dialog] select option')].map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['WRO Final (2026)'])
    await click(buttonByText('Copy'))
    expect(mocked.copyCategory).toHaveBeenCalledWith('tpl', { event: 'event1', code: undefined })
  })

  it('library edits templates', async () => {
    mocked.updateCategory.mockResolvedValue(template)
    const { wrapper } = await mountView(CategoryLibraryView)
    await click(wrapper.get('button[aria-label="Edit FI-TPL"]').element as HTMLElement)
    await click(buttonByText('Save'))
    expect(mocked.updateCategory).toHaveBeenCalledWith(
      'tpl',
      expect.objectContaining({ code: 'FI-TPL' }),
    )
  })
})
