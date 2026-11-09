import { describe, expect, it } from 'vitest'
import { compileRuleset, evaluate, EXAMPLE_RULESET, evaluateDefinition } from '../src'
import { bool, codes, group, num, ruleset } from './helpers'

describe('value validation', () => {
  const r = ruleset([
    num('positive', 1, { min: 0, max: 10, integer: true }),
    num('decimal', 0.5, { min: 0 }),
    {
      id: 'choice',
      label: 'Choice',
      type: 'select',
      options: [
        { id: 'a', label: 'A', points: 1 },
        { id: 'b', label: 'B', points: 2 },
      ],
    },
    bool('flag', 1),
  ])

  it('M2-T01: rejects negative values for positive-only criteria', () => {
    expect(codes(evaluate(r, { positive: -1 }).issues)).toEqual(['below_minimum'])
  })

  it('M2-T02: rejects values above the maximum', () => {
    expect(codes(evaluate(r, { positive: 11 }).issues)).toEqual(['above_maximum'])
  })

  it('M2-T03: rejects decimals for integer criteria', () => {
    expect(codes(evaluate(r, { positive: 2.5 }).issues)).toEqual(['not_integer'])
    expect(evaluate(r, { decimal: 2.5 }).valid).toBe(true)
  })

  it('rejects wrong types, unknown options and unknown criteria', () => {
    const result = evaluate(r, {
      positive: '3' as never,
      choice: 'c',
      flag: 1 as never,
      decimal: Number.NaN,
      nope: true,
      root: 1,
    })
    expect(codes(result.issues).sort()).toEqual(
      [
        'invalid_type',
        'invalid_type',
        'invalid_type',
        'unknown_option',
        'unknown_criterion',
        'not_a_criterion',
      ].sort(),
    )
    // Invalid values never contribute points.
    expect(result.total).toBe(0)
  })

  it('treats null as no value', () => {
    expect(evaluate(r, { positive: null }).valid).toBe(true)
  })
})

describe('evaluation', () => {
  it('M2-02: boolean criteria', () => {
    const r = ruleset([bool('a', 10)])
    expect(evaluate(r, { a: true }).total).toBe(10)
    expect(evaluate(r, { a: false }).total).toBe(0)
    expect(evaluate(r, {}).total).toBe(0)
  })

  it('M2-03: numeric criteria multiply by points per unit with exact decimals', () => {
    const r = ruleset([num('a', 0.1), num('b', 0.2)])
    expect(evaluate(r, { a: 1, b: 1 }).total).toBe(0.3)
    expect(evaluate(ruleset([num('x', 2.5)]), { x: 3 }).explanation.children![0]!.formula).toBe(
      '3 × 2.5 = 7.5',
    )
  })

  it('rounds each criterion half away from zero at the configured precision', () => {
    const r = ruleset([num('a', 1)], {}, 0)
    expect(evaluate(r, { a: 2.5 }).total).toBe(3)
    expect(evaluate(r, { a: 2.4 }).total).toBe(2)
    const d = ruleset([num('a', 1, { deduction: true })], {}, 0)
    expect(evaluate(d, { a: 2.5 }).total).toBe(-3)
    expect(evaluate(ruleset([num('a', 1)], {}, 2), { a: 1.005 }).total).toBe(1.01)
  })

  it('M2-04: selection criteria use the option points', () => {
    const r = ruleset([
      {
        id: 's',
        label: 'S',
        type: 'select',
        options: [
          { id: 'low', label: 'Low', points: 5 },
          { id: 'high', label: 'High', points: 20 },
        ],
      },
    ])
    const result = evaluate(r, { s: 'high' })
    expect(result.total).toBe(20)
    expect(result.explanation.children![0]!.formula).toBe('High → 20')
  })

  it('M2-08 / M2-09: MAX and MIN pick the highest/lowest answered child', () => {
    const children = [num('a', 1), num('b', 1), num('c', 1)]
    expect(evaluate(ruleset([group('g', 'max', children)]), { a: 5, b: 9, c: 1 }).total).toBe(9)
    expect(evaluate(ruleset([group('g', 'min', children)]), { a: 5, b: 9, c: 1 }).total).toBe(1)
    // Unanswered children are not eligible.
    expect(evaluate(ruleset([group('g', 'min', children)]), { a: 5 }).total).toBe(5)
    // Ties resolve to the first child.
    const tie = evaluate(ruleset([group('g', 'max', children)]), { a: 4, b: 4 })
    expect(tie.explanation.children![0]!.selectedChild).toBe('a')
  })

  it('M2-T05: evaluates nested expressions', () => {
    const r = ruleset([
      group('outer', 'max', [
        group('left', 'sum', [num('a', 1), num('b', 1)]),
        group('right', 'min', [num('c', 1), group('deep', 'sum', [num('d', 1), num('e', 1)])]),
      ]),
    ])
    // left = 3 + 4 = 7; deep = 10 + 1 = 11; right = MIN(20, 11) = 11; outer = MAX(7, 11) = 11
    expect(evaluate(r, { a: 3, b: 4, c: 20, d: 10, e: 1 }).total).toBe(11)
  })

  it('M2-T06: empty optional groups use the configured value', () => {
    expect(evaluate(ruleset([group('g', 'max', [num('a', 1)])]), {}).total).toBe(0)
    expect(evaluate(ruleset([group('g', 'min', [num('a', 1)], { empty: 7 })]), {}).total).toBe(7)
    const result = evaluate(ruleset([group('g', 'sum', [num('a', 1)], { empty: 2 })]), {})
    expect(result.explanation.children![0]!.formula).toBe('no answered criteria → 2')
  })

  it('M2-T07: negative totals follow the configured clamp', () => {
    const children = [num('base', 1), num('penalty', 1, { deduction: true })]
    expect(evaluate(ruleset(children), { base: 5, penalty: 20 }).total).toBe(-15)
    const clamped = evaluate(ruleset(children, { clamp: { min: 0 } }), { base: 5, penalty: 20 })
    expect(clamped.total).toBe(0)
    expect(clamped.explanation.formula).toBe('SUM(5, -20) = -15, limited to 0')
    expect(evaluate(ruleset([num('a', 1)], { clamp: { max: 10 } }), { a: 50 }).total).toBe(10)
  })

  it('M2-07: deduction groups subtract their aggregated score', () => {
    const r = ruleset([
      num('base', 1),
      group('penalties', 'sum', [bool('p1', 5), bool('p2', 3)], { deduction: true }),
    ])
    const result = evaluate(r, { base: 20, p1: true, p2: true })
    expect(result.total).toBe(12)
    expect(result.explanation.children![1]!.formula).toBe('SUM(5, 3) = 8 → deduction −8')
  })

  it('M2-T12: identical input produces identical results', () => {
    const r = compileRuleset(EXAMPLE_RULESET)
    const values = {
      flag: true,
      blocks: 4,
      parkFull: true,
      tower: 'three',
      bonus: true,
      runA: 7,
      touches: 1,
    }
    expect(evaluate(r, values)).toEqual(evaluate(r, { ...values }))
    expect(JSON.stringify(evaluate(r, values))).toBe(
      JSON.stringify(evaluate(compileRuleset(EXAMPLE_RULESET), values)),
    )
  })

  it('reports missing required values only in final mode', () => {
    const r = ruleset([bool('a', 1, { required: true })])
    expect(codes(evaluate(r, {}).issues)).toEqual(['required'])
    expect(evaluate(r, {}, { mode: 'draft' }).valid).toBe(true)
  })

  it('evaluates the example ruleset with a full explanation (M2-13)', () => {
    const result = evaluateDefinition(EXAMPLE_RULESET, {
      flag: true,
      blocks: 4,
      parkFull: true,
      parkPartial: false,
      tower: 'three',
      bonus: true,
      runA: 7,
      runB: 12,
      touches: 1,
    })
    // missions = 10 + 20 + 15 + 20 + 15 = 80; best run = 12; penalties = 5 → 87
    expect(result.valid).toBe(true)
    expect(result.total).toBe(87)
    const [missions, best, penalties] = result.explanation.children!
    expect(missions!.points).toBe(80)
    expect(best).toMatchObject({ points: 12, selectedChild: 'runB', formula: 'MAX(7, 12) = 12' })
    expect(penalties!.points).toBe(-5)
  })
})

describe('conditions', () => {
  const select = {
    id: 'level',
    label: 'Level',
    type: 'select' as const,
    options: [
      { id: 'one', label: 'One', points: 1 },
      { id: 'two', label: 'Two', points: 2 },
      { id: 'three', label: 'Three', points: 3 },
    ],
  }

  const active = (r: ReturnType<typeof ruleset>, values: object, id: string) => {
    const find = (e: { id: string; active: boolean; children?: unknown[] }): boolean | undefined =>
      e.id === id
        ? e.active
        : (e.children as (typeof e)[] | undefined)?.map(find).find((x) => x !== undefined)
    return find(evaluate(r, values as never).explanation)
  }

  it('supports comparisons on numbers, selects and group scores', () => {
    const r = ruleset([
      num('n', 1),
      select,
      group('g', 'sum', [num('gx', 1)]),
      bool('gt', 1, { condition: { ref: 'n', op: 'gt', value: 2 } }),
      bool('gte', 1, { condition: { ref: 'n', op: 'gte', value: 3 } }),
      bool('lt', 1, { condition: { ref: 'n', op: 'lt', value: 3 } }),
      bool('lte', 1, { condition: { ref: 'n', op: 'lte', value: 3 } }),
      bool('neq', 1, { condition: { ref: 'level', op: 'neq', value: 'one' } }),
      bool('in', 1, { condition: { ref: 'level', op: 'in', value: ['two', 'three'] } }),
      bool('score', 1, { condition: { ref: 'g', op: 'gte', value: 10 } }),
      bool('set', 1, { condition: { ref: 'n', op: 'set' } }),
      bool('unset', 1, { condition: { ref: 'n', op: 'unset' } }),
    ])
    const values = { n: 3, level: 'two', gx: 10 }
    expect(
      ['gt', 'gte', 'lt', 'lte', 'neq', 'in', 'score', 'set', 'unset'].map((id) =>
        active(r, values, id),
      ),
    ).toEqual([true, true, false, true, true, true, true, true, false])
    // Missing values make comparisons false, including neq.
    expect(['gt', 'neq', 'score', 'set', 'unset'].map((id) => active(r, {}, id))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
  })

  it('supports all, any and not', () => {
    const r = ruleset([
      bool('a', 0),
      bool('b', 0),
      bool('all', 1, {
        condition: {
          all: [
            { ref: 'a', op: 'eq', value: true },
            { ref: 'b', op: 'eq', value: true },
          ],
        },
      }),
      bool('any', 1, {
        condition: {
          any: [
            { ref: 'a', op: 'eq', value: true },
            { ref: 'b', op: 'eq', value: true },
          ],
        },
      }),
      bool('not', 1, { condition: { not: { ref: 'a', op: 'eq', value: true } } }),
    ])
    expect(['all', 'any', 'not'].map((id) => active(r, { a: true, b: false }, id))).toEqual([
      false,
      true,
      false,
    ])
  })

  it('M2-10: inactive groups deactivate their children', () => {
    const r = ruleset([
      bool('unlock', 0),
      group('extra', 'sum', [bool('x', 5)], {
        condition: { ref: 'unlock', op: 'eq', value: true },
      }),
    ])
    const result = evaluate(r, { unlock: false, x: true })
    expect(result.total).toBe(0)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'not_eligible',
        nodeId: 'x',
        message: '"x" is not eligible: its group is inactive.',
      }),
    ])
    expect(result.explanation.children![1]!.children![0]).toMatchObject({
      active: false,
      inactiveReason: 'parent',
    })
    expect(evaluate(r, { unlock: true, x: true }).total).toBe(5)
  })

  it('references to inactive criteria count as missing', () => {
    const r = ruleset([
      bool('a', 0),
      bool('b', 0, { condition: { ref: 'a', op: 'eq', value: true } }),
      bool('c', 1, { condition: { ref: 'b', op: 'eq', value: true } }),
    ])
    expect(evaluate(r, { a: false, b: true }).explanation.children![2]!.active).toBe(false)
  })
})
