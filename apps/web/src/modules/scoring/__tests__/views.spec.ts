import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { EXAMPLE_RULESET } from '@judge26/scoring-engine'
import { buttonByText, click, makeCategory, makeEvent, makeRole, mountView } from '@/test/utils'
import type { RulesetRecord } from '@/shared/types/records'
import * as api from '../api'
import RulesetsView from '../views/RulesetsView.vue'
import BlockDiagram from '@/shared/diagram/BlockDiagram.vue'

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
/** The Definition tab in JSON mode (the visual builder is the default). */
async function openJson(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  await openTab(wrapper, 'Definition')
  const json = wrapper.findAll('[role=radio]').find((r) => r.text() === 'JSON')
  if (json && json.attributes('aria-checked') !== 'true') await json.trigger('click')
  await flushPromises()
}

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
    await openJson(wrapper)
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
    await openJson(wrapper)

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
    await openJson(wrapper)
    await wrapper.get('textarea').setValue('{"schemaVersion": 1}')
    expect(buttonByText('Publish').disabled).toBe(true)
    await openTab(wrapper, 'Preview')
    expect(wrapper.text()).toContain('Fix the definition to preview')
    await openJson(wrapper)

    await wrapper.get('textarea').setValue(JSON.stringify(simple(5)))
    await click(buttonByText('Publish'))
    expect(wrapper.text()).toContain('cannot be published')
  })

  it('M2-15: the visual builder edits the draft without writing JSON', async () => {
    mocked.saveDraft.mockImplementation(async (id, data) =>
      version({ id, version: 2, status: 'draft', definition: data.definition }),
    )
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await wrapper.get('select[aria-label=Version]').setValue('rs2')
    await flushPromises()
    await openTab(wrapper, 'Definition')
    const builder = wrapper.get('[data-testid=ruleset-builder]')
    expect(builder.findAll('[data-block]').map((b) => b.attributes('data-block'))).toEqual([
      '',
      '0',
    ])

    // Palette: a count block goes into the root group.
    await click(buttonByText('Count', builder.element as HTMLElement))
    expect(builder.findAll('[data-block]')).toHaveLength(3)
    // Inspector: the new block is selected; give it 3 points per unit.
    const inspector = wrapper.get('[data-testid=inspector]')
    const field = inspector.findAll('label').find((l) => l.text() === 'Points per unit')!
    const input = inspector.get(`#${field.attributes('for')}`)
    await input.setValue('3')
    await input.trigger('change')

    await click(buttonByText('Save draft'))
    const saved = mocked.saveDraft.mock.calls[0]![1].definition as typeof EXAMPLE_RULESET
    expect(saved.root.children[1]).toMatchObject({ type: 'number', pointsPerUnit: 3 })
  })

  it('M2-T15: a circular condition drawn in the builder is shown and blocks publishing', async () => {
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    await wrapper.get('select[aria-label=Version]').setValue('rs2')
    await flushPromises()
    await openJson(wrapper)
    await wrapper.get('textarea').setValue(JSON.stringify(EXAMPLE_RULESET))
    await openTab(wrapper, 'Definition')
    await wrapper
      .findAll('[role=radio]')
      .find((r) => r.text() === 'Visual')!
      .trigger('click')
    await flushPromises()
    expect(buttonByText('Publish').disabled).toBe(false)

    // Wire bonus (0.4) into the enable terminal of tower (0.3): tower ↔ bonus.
    wrapper.getComponent(BlockDiagram).vm.$emit('connect', '0.4', '0.3', 'enable')
    await flushPromises()
    expect(wrapper.get('[data-testid=builder-status]').text()).toContain('1 error')
    expect(wrapper.get('[data-block="0.3"]').attributes('aria-label')).toContain('Circular')
    expect(buttonByText('Publish').disabled).toBe(true)
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

  it('a slow earlier list load does not hide a just-created draft', async () => {
    let releaseFirst: (v: RulesetRecord[]) => void = () => {}
    mocked.listRulesets
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise((r) => (releaseFirst = r)))
      .mockResolvedValueOnce([version({ status: 'draft' })])
    mocked.createDraft.mockResolvedValue(version({ status: 'draft' }))
    const { wrapper } = await mountView(RulesetsView, { props: { id: 'cat1' }, session: manager })
    // A second (slow) load starts, e.g. a reload, then the draft is created.
    const vm = wrapper.vm as unknown as { $: { setupState: { load: () => Promise<void> } } }
    const slow = vm.$.setupState.load()
    await click(buttonByText('Create first draft'))
    expect(wrapper.get('[data-testid=ruleset-status]').text()).toBe('Draft')
    releaseFirst([])
    await slow
    await flushPromises()
    expect(wrapper.get('[data-testid=ruleset-status]').text()).toBe('Draft')
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
