import { describe, expect, it } from 'vitest'
import {
  compileRuleset,
  EXAMPLE_RULESET,
  RulesetValidationError,
  validateRuleset,
  evaluate,
} from '../src'
import { bool, group, num } from './helpers'

const withRoot = (children: unknown[], extra: object = {}) => ({
  schemaVersion: 1,
  root: { id: 'root', label: 'Total', type: 'group', aggregate: 'sum', children, ...extra },
})

function issuesOf(definition: unknown) {
  const result = validateRuleset(definition)
  return result.ok ? [] : result.issues.map((i) => `${i.code} @ ${i.path}`)
}

describe('validateRuleset (M2-12)', () => {
  it('accepts the example ruleset', () => {
    expect(validateRuleset(EXAMPLE_RULESET).ok).toBe(true)
  })

  it('M2-T08: rejects references to nonexistent criteria', () => {
    expect(
      issuesOf(withRoot([bool('a', 1, { condition: { ref: 'missing', op: 'eq', value: true } })])),
    ).toEqual(['unknown_reference @ $.root.children[0].condition.ref'])
  })

  it('M2-T09: rejects circular condition references', () => {
    const result = validateRuleset(
      withRoot([
        bool('a', 1, { condition: { ref: 'b', op: 'eq', value: true } }),
        bool('b', 1, { condition: { ref: 'a', op: 'eq', value: true } }),
      ]),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.issues[0]).toMatchObject({
      code: 'circular_reference',
      message: 'Circular dependency: a → b → a.',
    })
  })

  it('M2-T09: rejects a group whose condition depends on its own descendants', () => {
    const result = validateRuleset(
      withRoot([
        group('g', 'sum', [bool('inner', 1)], {
          condition: { ref: 'inner', op: 'eq', value: true },
        }),
      ]),
    )
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(['circular_reference'])
  })

  it('rejects self references and longer cycles', () => {
    expect(issuesOf(withRoot([bool('a', 1, { condition: { ref: 'a', op: 'set' } })]))[0]).toMatch(
      /^circular_reference/,
    )
    expect(
      issuesOf(
        withRoot([
          num('a', 1, { condition: { ref: 'c', op: 'gt', value: 0 } }),
          num('b', 1, { condition: { ref: 'a', op: 'gt', value: 0 } }),
          num('c', 1, { condition: { ref: 'b', op: 'gt', value: 0 } }),
        ]),
      )[0],
    ).toMatch(/^circular_reference/)
  })

  it('validates the document structure', () => {
    expect(issuesOf(null)).toEqual(['invalid_type @ $'])
    expect(
      issuesOf({ schemaVersion: 2, precision: 7, root: { type: 'boolean' }, extra: 1 }),
    ).toEqual([
      'unknown_property @ $.extra',
      'unsupported_schema @ $.schemaVersion',
      'invalid_precision @ $.precision',
      'invalid_root @ $.root',
    ])
    expect(issuesOf(withRoot([], { condition: { ref: 'x', op: 'set' }, deduction: true }))).toEqual(
      [
        'not_allowed @ $.root.condition',
        'not_allowed @ $.root.deduction',
        'required @ $.root.children',
        'unknown_reference @ $.root.condition.ref',
      ],
    )
  })

  it('validates nodes', () => {
    expect(
      issuesOf(
        withRoot([
          'not a node',
          { type: 'nope' },
          { id: '1bad', label: '', type: 'boolean', points: 'x', color: 'red', required: 'yes' },
          bool('dup', 1),
          bool('dup', 1),
          num('n', 1, { min: 5, max: 1, integer: true }),
          num('m', 1, { min: 0.5, integer: true, unit: 3 }),
          bool('ded', -1, { deduction: true }),
          bool('decimals', 1.234),
          { id: 'noPoints', label: 'x', type: 'number', description: 4, deduction: 'no' },
        ]),
      ),
    ).toEqual([
      'invalid_type @ $.root.children[0]',
      'invalid_type @ $.root.children[1].type',
      'unknown_property @ $.root.children[2].color',
      'invalid_id @ $.root.children[2].id',
      'invalid_type @ $.root.children[2].label',
      'invalid_type @ $.root.children[2].required',
      'invalid_type @ $.root.children[2].points',
      'duplicate_id @ $.root.children[4].id',
      'invalid_range @ $.root.children[5].max',
      'not_integer @ $.root.children[6].min',
      'invalid_type @ $.root.children[6].unit',
      'negative_value @ $.root.children[7].points',
      'too_many_decimals @ $.root.children[8].points',
      'invalid_type @ $.root.children[9].description',
      'invalid_type @ $.root.children[9].deduction',
      'required @ $.root.children[9].pointsPerUnit',
    ])
  })

  it('validates select options', () => {
    expect(
      issuesOf(
        withRoot([
          { id: 's1', label: 'S', type: 'select', options: [] },
          {
            id: 's2',
            label: 'S',
            type: 'select',
            options: [
              5,
              { id: 'a', label: 'A', points: 1 },
              { id: 'a', label: 'A', points: 1 },
              { id: '', label: '', x: 1 },
            ],
          },
        ]),
      ),
    ).toEqual([
      'required @ $.root.children[0].options',
      'invalid_type @ $.root.children[1].options[0]',
      'duplicate_id @ $.root.children[1].options[2].id',
      'unknown_property @ $.root.children[1].options[3].x',
      'invalid_id @ $.root.children[1].options[3].id',
      'invalid_type @ $.root.children[1].options[3].label',
      'required @ $.root.children[1].options[3].points',
    ])
  })

  it('validates groups', () => {
    expect(
      issuesOf(
        withRoot([
          group('g1', 'avg' as never, [bool('a', 1)], { selection: { min: 3, max: 0 } }),
          group('g2', 'sum', [bool('b', 1)], { selection: 'one' as never, clamp: 'x' as never }),
          group('g3', 'sum', [bool('c', 1)], {
            clamp: { min: 5, max: 1.111 },
            empty: 'none' as never,
          }),
        ]),
      ),
    ).toEqual([
      'invalid_type @ $.root.children[0].aggregate',
      'invalid_range @ $.root.children[0].selection.max',
      'invalid_range @ $.root.children[0].selection.min',
      'invalid_range @ $.root.children[0].selection.max',
      'invalid_type @ $.root.children[1].selection',
      'invalid_type @ $.root.children[1].clamp',
      'too_many_decimals @ $.root.children[2].clamp.max',
      'invalid_range @ $.root.children[2].clamp.max',
      'invalid_type @ $.root.children[2].empty',
    ])
  })

  it('validates conditions', () => {
    const select = {
      id: 's',
      label: 'S',
      type: 'select',
      options: [{ id: 'x', label: 'X', points: 1 }],
    }
    const cond = (condition: unknown) => bool('t', 1, { condition })
    const check = (condition: unknown) =>
      issuesOf(withRoot([bool('b', 1), num('n', 1), select, cond(condition)]))
    expect(check('x')).toEqual(['invalid_condition @ $.root.children[3].condition'])
    expect(check({ ref: 'b', all: [] })).toEqual([
      'invalid_condition @ $.root.children[3].condition',
    ])
    expect(check({ all: [] })).toEqual(['invalid_condition @ $.root.children[3].condition.all'])
    expect(check({ any: [{ ref: 'b', op: 'gt', value: 1 }] })).toEqual([
      'invalid_condition @ $.root.children[3].condition.any[0]',
    ])
    expect(check({ not: { ref: 'n', op: 'eq', value: 'x' } })).toEqual([
      'invalid_condition @ $.root.children[3].condition.not',
    ])
    expect(check({ ref: 's', op: 'eq', value: 'y' })).toEqual([
      'invalid_condition @ $.root.children[3].condition',
    ])
    expect(check({ ref: 's', op: 'in', value: [] })).toEqual([
      'invalid_condition @ $.root.children[3].condition',
    ])
    expect(check({ ref: 'n', op: 'set', value: 1 })).toEqual([
      'invalid_condition @ $.root.children[3].condition',
    ])
    expect(check({ ref: 'n', op: 'gt', value: 1, extra: true })).toEqual([
      'unknown_property @ $.root.children[3].condition.extra',
    ])
    expect(check({ ref: 's', op: 'in', value: ['x'] })).toEqual([])
  })

  it('compileRuleset throws with all issues', () => {
    expect(() => compileRuleset({})).toThrow(RulesetValidationError)
    try {
      compileRuleset(withRoot([bool('a', 1, { condition: { ref: 'zzz', op: 'set' } })]))
    } catch (e) {
      expect((e as RulesetValidationError).issues[0]!.code).toBe('unknown_reference')
      expect((e as Error).message).toContain('Unknown node "zzz"')
    }
  })

  it('M2-14: compiled rulesets are isolated from later changes to the input', () => {
    const definition = withRoot([bool('a', 10)])
    const compiled = compileRuleset(definition)
    ;(definition.root.children[0] as { points: number }).points = 99
    expect(evaluate(compiled, { a: true }).total).toBe(10)
    expect(Object.isFrozen(compiled.definition.root)).toBe(true)
  })
})
