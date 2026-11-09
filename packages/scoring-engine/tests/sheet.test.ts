import { describe, expect, it } from 'vitest'
import { compileRuleset, EXAMPLE_RULESET, updateValue } from '../src'
import { bool, group, num, ruleset } from './helpers'

describe('updateValue', () => {
  it('sets and clears values without mutating the input', () => {
    const r = ruleset([bool('a', 1), num('n', 1)])
    const values = { a: true }
    expect(updateValue(r, values, 'n', 3)).toEqual({ a: true, n: 3 })
    expect(updateValue(r, values, 'a', null)).toEqual({})
    expect(values).toEqual({ a: true })
  })

  it('M5-T05 groundwork: selecting an option in an exclusive group deselects the others', () => {
    const r = ruleset([
      group(
        'choice',
        'sum',
        [bool('a', 10), bool('b', 25), num('c', 1), group('d', 'sum', [bool('d1', 1)])],
        {
          selection: { max: 1 },
        },
      ),
    ])
    expect(updateValue(r, { a: true, c: 4, d1: true }, 'b', true)).toEqual({
      a: false,
      b: true,
      d1: false,
    })
    // Deselecting does not touch siblings.
    expect(updateValue(r, { a: true, b: false }, 'a', false)).toEqual({ a: false, b: false })
  })

  it('does not deselect siblings in non-exclusive groups', () => {
    const r = ruleset([group('g', 'sum', [bool('a', 1), bool('b', 1)], { selection: { max: 2 } })])
    expect(updateValue(r, { a: true }, 'b', true)).toEqual({ a: true, b: true })
  })

  it('clears values that become ineligible, including chains', () => {
    const r = ruleset([
      bool('a', 0),
      bool('b', 1, { condition: { ref: 'a', op: 'eq', value: true } }),
      bool('c', 1, { condition: { ref: 'b', op: 'eq', value: true } }),
    ])
    expect(updateValue(r, { a: true, b: true, c: true }, 'a', false)).toEqual({ a: false })
  })

  it('keeps the example sheet consistent', () => {
    const r = compileRuleset(EXAMPLE_RULESET)
    let values = updateValue(r, {}, 'tower', 'three')
    values = updateValue(r, values, 'bonus', true)
    values = updateValue(r, values, 'parkFull', true)
    values = updateValue(r, values, 'parkPartial', true)
    expect(values).toEqual({ tower: 'three', bonus: true, parkFull: false, parkPartial: true })
    expect(updateValue(r, values, 'tower', 'two')).toEqual({
      tower: 'two',
      parkFull: false,
      parkPartial: true,
    })
  })
})
