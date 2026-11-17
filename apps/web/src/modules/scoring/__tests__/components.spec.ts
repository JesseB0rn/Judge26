import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import {
  compileRuleset,
  evaluate,
  EXAMPLE_RULESET,
  type ScoreValues,
} from '@judge26/scoring-engine'
import ScoreSheet from '../components/ScoreSheet.vue'
import RulesetEditor from '../components/RulesetEditor.vue'
import ScoringInspector from '../components/ScoringInspector.vue'
import { parseRuleset } from '../lib'

const ruleset = compileRuleset(EXAMPLE_RULESET)

/** Hosts the sheet like a parent view does: evaluates values on every change. */
function mountSheet(initial: ScoreValues = {}, compiled = ruleset) {
  const values = ref<ScoreValues>(initial)
  const Host = defineComponent(
    () => () =>
      h(ScoreSheet, {
        ruleset: compiled,
        result: evaluate(compiled, values.value, { mode: 'final' }),
        modelValue: values.value,
        'onUpdate:modelValue': (v: ScoreValues) => (values.value = v),
      }),
  )
  return { wrapper: mount(Host, { attachTo: document.body }), values }
}

const node = (wrapper: ReturnType<typeof mount>, id: string) => wrapper.get(`[data-node="${id}"]`)
const button = (wrapper: ReturnType<typeof mount>, id: string, text: string) =>
  node(wrapper, id)
    .findAll('button')
    .find((b) => b.text().startsWith(text))!

describe('ScoreSheet', () => {
  afterEach(() => document.body.replaceChildren())

  it('M5-04 groundwork: renders every criterion from the ruleset with the live total', () => {
    const { wrapper } = mountSheet()
    for (const id of [
      'flag',
      'blocks',
      'parking',
      'parkFull',
      'tower',
      'bonus',
      'runA',
      'touches',
    ]) {
      expect(wrapper.find(`[data-node="${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.get('[data-testid=score-total]').text()).toBe('0')
    expect(node(wrapper, 'parking').text()).toContain('Choose exactly 1')
    expect(node(wrapper, 'penalties').text()).toContain('deduction')
  })

  it('updates the total immediately when values change (M5-06)', async () => {
    const { wrapper, values } = mountSheet()
    await button(wrapper, 'flag', 'Yes').trigger('click')
    await node(wrapper, 'blocks').get('input').setValue('3')
    await button(wrapper, 'blocks', '').trigger('click') // decrease
    await flushPromises()
    expect(values.value).toMatchObject({ flag: true, blocks: 2 })
    expect(wrapper.get('[data-testid=score-total]').text()).toBe('20')
    await node(wrapper, 'blocks').findAll('button')[1]!.trigger('click') // increase
    expect(values.value.blocks).toBe(3)
  })

  it('M5-T05 groundwork: selecting an exclusive option deselects the previous one', async () => {
    const { wrapper, values } = mountSheet()
    await button(wrapper, 'parkFull', 'Yes').trigger('click')
    await button(wrapper, 'parkPartial', 'Yes').trigger('click')
    expect(values.value).toMatchObject({ parkFull: false, parkPartial: true })
    expect(button(wrapper, 'parkPartial', 'Yes').attributes('aria-pressed')).toBe('true')
  })

  it('M2-10: conditional criteria are disabled until their condition is met and cleared afterwards', async () => {
    const { wrapper, values } = mountSheet()
    expect(button(wrapper, 'bonus', 'Yes').attributes('disabled')).toBeDefined()
    expect(node(wrapper, 'bonus').text()).toContain('Not available')

    await button(wrapper, 'tower', 'Three levels').trigger('click')
    expect(button(wrapper, 'bonus', 'Yes').attributes('disabled')).toBeUndefined()
    await button(wrapper, 'bonus', 'Yes').trigger('click')
    expect(values.value).toMatchObject({ tower: 'three', bonus: true })

    await button(wrapper, 'tower', 'Two levels').trigger('click')
    expect(values.value).toEqual({ tower: 'two' })
  })

  it('shows validation issues next to the criterion', () => {
    const { wrapper } = mountSheet({ blocks: 9 })
    expect(node(wrapper, 'blocks').get('[role=alert]').text()).toContain('at most 6')
    expect(node(wrapper, 'flag').get('[role=alert]').text()).toContain('required')
  })

  it('toggles values off when the selected button is pressed again', async () => {
    const { wrapper, values } = mountSheet({ flag: true, tower: 'two', wallDamage: false })
    await button(wrapper, 'flag', 'Yes').trigger('click')
    await button(wrapper, 'tower', 'Two levels').trigger('click')
    await button(wrapper, 'wallDamage', 'No').trigger('click')
    await node(wrapper, 'runA').get('input').setValue('')
    expect(values.value).toEqual({})
  })

  it('M2-16: a distribution shows counts, the remainder and caps at the number of objects', async () => {
    const count = (id: string, pointsPerUnit: number) => ({
      id,
      label: id,
      type: 'number' as const,
      integer: true,
      min: 0,
      pointsPerUnit,
    })
    const distribution = compileRuleset({
      schemaVersion: 1,
      root: {
        id: 'root',
        label: 'Total',
        type: 'group',
        aggregate: 'sum',
        children: [
          {
            id: 'objects',
            label: 'Objects',
            type: 'group',
            aggregate: 'sum',
            distribute: { objects: 6, remainder: 'None' },
            children: [count('partial', 5), count('full', 10)],
          },
        ],
      },
    })
    const { wrapper, values } = mountSheet({ partial: 4 }, distribution)
    const remainder = () => wrapper.get('[data-testid=distribution-remainder]').text()
    expect(node(wrapper, 'objects').text()).toContain('6 objects')
    expect(remainder()).toBe('None2')

    const increase = () => node(wrapper, 'full').findAll('button')[1]!
    await increase().trigger('click')
    await increase().trigger('click')
    expect(values.value).toEqual({ partial: 4, full: 2 })
    expect(wrapper.find('[data-testid=distribution-remainder]').exists()).toBe(false)
    expect(increase().attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid=score-total]').text()).toBe('40')

    await node(wrapper, 'partial').get('input').setValue('5')
    expect(node(wrapper, 'objects').get('[role=alert]').text()).toContain('only 6 objects')
  })
})

describe('RulesetEditor', () => {
  it('reports JSON syntax errors, validation issues and valid rulesets', async () => {
    const text = ref('{')
    const wrapper = mount(RulesetEditor, {
      props: {
        modelValue: text.value,
        'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v }),
      },
    })
    expect(wrapper.get('[data-testid=ruleset-issues]').text()).toContain('Invalid JSON')
    await wrapper
      .get('textarea')
      .setValue(
        '{"schemaVersion": 1, "root": {"id": "r", "label": "R", "type": "group", "aggregate": "sum", "children": []}}',
      )
    expect(wrapper.get('[data-testid=ruleset-issues]').text()).toContain('$.root.children')
    await wrapper.get('textarea').setValue(JSON.stringify(EXAMPLE_RULESET))
    expect(wrapper.find('[data-testid=ruleset-valid]').exists()).toBe(true)
  })

  it('parseRuleset returns the compiled ruleset when valid', () => {
    expect(parseRuleset(JSON.stringify(EXAMPLE_RULESET)).ruleset).toBeDefined()
    expect(parseRuleset('[]').issues[0]!.code).toBe('invalid_type')
  })
})

describe('ScoringInspector (M10-18)', () => {
  const def = {
    schemaVersion: 1,
    root: {
      id: 'root',
      label: 'Total',
      type: 'group' as const,
      aggregate: 'sum' as const,
      children: [{ id: 'flag', label: 'Flag', type: 'boolean' as const, points: 10 }],
    },
  }

  it('turns the zero-point time on (120 s), changes it and turns it off', async () => {
    const wrapper = mount(ScoringInspector, { props: { def, nodeKey: '' } })
    const toggle = wrapper.get('[data-testid=zero-points-toggle] input')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    await toggle.setValue(true)
    const on = wrapper.emitted('apply')![0]![0] as { zeroPointsTimeMs?: number }
    expect(on.zeroPointsTimeMs).toBe(120_000)

    await wrapper.setProps({ def: { ...def, zeroPointsTimeMs: 120_000 } })
    const seconds = wrapper.get('[data-testid=zero-points-seconds] input')
    expect((seconds.element as HTMLInputElement).value).toBe('120')
    await seconds.setValue('90')
    await seconds.trigger('change')
    expect(
      (wrapper.emitted('apply')!.at(-1)![0] as { zeroPointsTimeMs?: number }).zeroPointsTimeMs,
    ).toBe(90_000)

    await wrapper.get('[data-testid=zero-points-toggle] input').setValue(false)
    expect('zeroPointsTimeMs' in (wrapper.emitted('apply')!.at(-1)![0] as object)).toBe(false)
    wrapper.unmount()
  })
})
