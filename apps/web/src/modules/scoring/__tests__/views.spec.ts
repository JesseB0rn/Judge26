import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { EXAMPLE_RULESET } from '@judge26/scoring-engine'
import { buttonByText, click, makeCategory, makeEvent, makeRole, mountView } from '@/test/utils'
import type { RulesetRecord } from '@/shared/types/records'
import * as api from '../api'
import RulesetsView from '../views/RulesetsView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const simple = (points: number) => ({
  schemaVersion: 1,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'task', label: 'Task', type: 'boolean', points }],
  },
})

const version = (overrides: Partial<RulesetRecord>): RulesetRecord => ({
  id: 'rs1',
  collectionId: 'rulesets',
  collectionName: 'rulesets',
  created: '',
  updated: '',
  category: 'cat1',
  version: 1,
  status: 'published',
  definition: simple(10),
  notes: '',
  fingerprint: 'abcdef0123456789',
  published_at: '2026-05-01 10:00:00.000Z',
  published_by: '',
  source: '',
  ...overrides,
})

const manager = { roles: [makeRole('event_manager', 'event1')] }

/** Reka tabs activate on mousedown. */
async function openTab(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], name: string) {
  const tab = wrapper.findAll('[role=tab]').find((t) => t.text() === name)!
  await tab.trigger('mousedown', { button: 0 })
  await flushPromises()
}

const buttonTexts = (wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) =>
  wrapper.findAll('button').map((b) => b.text())

describe('RulesetsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocked.getCategory.mockResolvedValue(makeCategory({ expand: { event: makeEvent() } }))
    mocked.listRulesets.mockResolvedValue([
      version({
        id: 'rs2',
        version: 2,
        status: 'draft',
        definition: simple(20),
        fingerprint: '',
        published_at: '',
      }),
      version({}),
    ])
  })
  afterEach(() => document.body.replaceChildren())

  it('selects the active version and previews its score sheet', async () => {
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' } })
    expect(wrapper.get('select[aria-label=Version]').element).toHaveProperty('value', 'rs1')
    expect(wrapper.get('[data-testid=ruleset-status]').text()).toBe('Published')
    await click(buttonByText('Yes (+10)'))
    expect(wrapper.get('[data-testid=score-total]').text()).toBe('10')
    expect(wrapper.get('[data-testid=explanation]').text()).toContain('SUM(10) = 10')
  })

  it('coaches see rules but no management actions', async () => {
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' } })
    expect(buttonTexts(wrapper).join('|')).not.toMatch(/New draft|Publish|Save draft/)
  })

  it('M2-T10: published versions are read-only; a new draft starts from the selected version', async () => {
    mocked.createDraft.mockResolvedValue(version({ id: 'rs3', version: 3, status: 'draft' }))
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await openTab(wrapper, 'Definition')
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.text()).not.toContain('Save draft')

    await click(buttonByText('New draft from selected'))
    expect(mocked.createDraft).toHaveBeenCalledWith('cat1', simple(10), 'rs1')
  })

  it('saves and publishes drafts', async () => {
    mocked.saveDraft.mockImplementation(async (id, data) =>
      version({ id, version: 2, status: 'draft', definition: data.definition }),
    )
    mocked.publish.mockResolvedValue(version({ id: 'rs2', version: 2 }))
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await wrapper.get('select[aria-label=Version]').setValue('rs2')
    await flushPromises()
    await openTab(wrapper, 'Definition')

    await wrapper.get('textarea').setValue(JSON.stringify(simple(30)))
    await click(buttonByText('Save draft'))
    expect(mocked.saveDraft).toHaveBeenCalledWith('rs2', { definition: simple(30) })

    await click(buttonByText('Publish'))
    expect(window.confirm).toHaveBeenCalled()
    expect(mocked.publish).toHaveBeenCalledWith('rs2', simple(30))
  })

  it('blocks publishing invalid definitions and shows server errors', async () => {
    mocked.publish.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: { message: 'The ruleset is invalid and cannot be published.', data: {} },
      }),
    )
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await wrapper.get('select[aria-label=Version]').setValue('rs2')
    await flushPromises()
    await openTab(wrapper, 'Definition')
    await wrapper.get('textarea').setValue('{"schemaVersion": 1}')
    expect(buttonByText('Publish').disabled).toBe(true)
    await openTab(wrapper, 'Preview')
    expect(wrapper.text()).toContain('Fix the definition to preview')
    await openTab(wrapper, 'Definition')

    await wrapper.get('textarea').setValue(JSON.stringify(simple(5)))
    await click(buttonByText('Publish'))
    expect(wrapper.text()).toContain('cannot be published')
  })

  it('deletes drafts', async () => {
    mocked.deleteDraft.mockResolvedValue(true)
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await wrapper.get('select[aria-label=Version]').setValue('rs2')
    await flushPromises()
    await click(wrapper.get('button[aria-label="Delete draft"]').element as HTMLElement)
    expect(mocked.deleteDraft).toHaveBeenCalledWith('rs2')
  })

  it('offers an example-based first draft when no ruleset exists', async () => {
    mocked.listRulesets.mockResolvedValue([])
    mocked.createDraft.mockResolvedValue(version({ status: 'draft' }))
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    expect(wrapper.text()).toContain('No scoring ruleset yet')
    await click(buttonByText('Create first draft'))
    expect(mocked.createDraft).toHaveBeenCalledWith('cat1', EXAMPLE_RULESET, '')
  })

  it('archived events are read-only even for managers', async () => {
    mocked.getCategory.mockResolvedValue(
      makeCategory({ expand: { event: makeEvent({ status: 'archived' }) } }),
    )
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    expect(buttonTexts(wrapper).join('|')).not.toContain('New draft')
  })

  it('shows the version history', async () => {
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' } })
    await openTab(wrapper, 'History')
    const history = wrapper.get('[data-testid=ruleset-history]')
    expect(history.text()).toContain('published (active)')
    expect(history.text()).toContain('abcdef0123456789')
  })
})
