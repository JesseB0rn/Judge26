import { describe, expect, it } from 'vitest'
import { evaluate, validateRuleset } from '../src'
import { codes, group, num, ruleset } from './helpers'

const count = (id: string, pointsPerUnit: number, extra: object = {}) =>
  num(id, pointsPerUnit, { integer: true, min: 0, ...extra })

describe('distribution (M2-16)', () => {
  const r = ruleset([
    group('blocks', 'sum', [count('partial', 5), count('full', 10)], {
      distribute: { objects: 6, remainder: 'none' },
    }),
  ])

  it('scores 6 objects → 4 partial, 1 full, 1 none', () => {
    const result = evaluate(r, { partial: 4, full: 1 })
    expect(result.valid).toBe(true)
    expect(result.total).toBe(30)
    expect(result.explanation.children![0]!.formula).toBe('SUM(20, 10) = 30; 1 of 6 none')
  })

  it('accepts all objects counted', () => {
    const result = evaluate(r, { partial: 0, full: 6 })
    expect(result.valid).toBe(true)
    expect(result.explanation.children![0]!.formula).toBe('SUM(0, 60) = 60')
  })

  it('rejects more counted objects than there are', () => {
    const result = evaluate(r, { partial: 4, full: 3 })
    expect(codes(result.issues)).toEqual(['too_many_objects'])
    expect(result.issues[0]!.nodeId).toBe('blocks')
  })

  it('ignores inactive outcomes', () => {
    const conditional = ruleset([
      group(
        'blocks',
        'sum',
        [
          count('partial', 5),
          count('full', 10, { condition: { ref: 'partial', op: 'lt', value: 3 } }),
        ],
        { distribute: { objects: 6 } },
      ),
    ])
    // `full` is inactive, so its value is not eligible but does not count towards the objects.
    expect(codes(evaluate(conditional, { partial: 5, full: 3 }).issues)).toEqual(['not_eligible'])
  })

  it('validates the definition', () => {
    const check = (blocks: object) =>
      validateRuleset({
        schemaVersion: 1,
        root: { id: 'root', label: 'Total', type: 'group', aggregate: 'sum', children: [blocks] },
      }).issues.map((i) => `${i.code} @ ${i.path}`)
    const base = { id: 'b', label: 'B', type: 'group', aggregate: 'sum' }
    const ok = [count('p', 1)]
    expect(check({ ...base, children: ok, distribute: { objects: 6 } })).toEqual([])
    expect(check({ ...base, children: ok, distribute: { objects: 0 } })).toEqual([
      'invalid_range @ $.root.children[0].distribute.objects',
    ])
    expect(check({ ...base, children: ok, distribute: { objects: 2.5, x: 1 } })).toEqual([
      'unknown_property @ $.root.children[0].distribute.x',
      'not_integer @ $.root.children[0].distribute.objects',
    ])
    expect(check({ ...base, children: ok, distribute: {} })).toEqual([
      'required @ $.root.children[0].distribute.objects',
    ])
    expect(check({ ...base, children: ok, distribute: 6 })).toEqual([
      'invalid_type @ $.root.children[0].distribute',
    ])
    expect(check({ ...base, aggregate: 'max', children: ok, distribute: { objects: 6 } })).toEqual([
      'invalid_distribution @ $.root.children[0].aggregate',
    ])
    expect(
      check({
        ...base,
        children: [
          num('a', 1),
          count('c', 1, { min: -1 }),
          { id: 't', label: 't', type: 'boolean', points: 1 },
        ],
        distribute: { objects: 6 },
      }),
    ).toEqual([
      'invalid_distribution @ $.root.children[0].children[0]',
      'invalid_distribution @ $.root.children[0].children[1]',
      'invalid_distribution @ $.root.children[0].children[2]',
    ])
  })
})
