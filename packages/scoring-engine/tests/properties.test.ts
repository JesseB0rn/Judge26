import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  canonicalJson,
  compileRuleset,
  evaluate,
  fingerprint,
  toUnits,
  type ScoringNode,
} from '../src'

// Property-based tests (ROADMAP §10: critical calculations).

const points = fc.integer({ min: 0, max: 10_000 }).map((n) => n / 100) // up to 2 decimals
const id = (prefix: string, i: number) => `${prefix}${i}`

/** Random flat criteria with values. */
const criteriaWithValues = fc
  .array(
    fc.tuple(
      fc.constantFrom('boolean', 'number', 'select'),
      points,
      fc.boolean(),
      fc.integer({ min: 0, max: 50 }),
    ),
    {
      minLength: 1,
      maxLength: 12,
    },
  )
  .map((items) => {
    const nodes: ScoringNode[] = []
    const values: Record<string, boolean | number | string> = {}
    items.forEach(([type, p, flag, n], i) => {
      const nodeId = id('c', i)
      if (type === 'boolean') {
        nodes.push({ id: nodeId, label: nodeId, type, points: p })
        values[nodeId] = flag
      } else if (type === 'number') {
        nodes.push({ id: nodeId, label: nodeId, type, pointsPerUnit: p, integer: true, min: 0 })
        values[nodeId] = n
      } else {
        nodes.push({
          id: nodeId,
          label: nodeId,
          type,
          options: [
            { id: 'a', label: 'A', points: p },
            { id: 'b', label: 'B', points: n },
          ],
        })
        values[nodeId] = flag ? 'a' : 'b'
      }
    })
    return { nodes, values }
  })

const build = (aggregate: 'sum' | 'max' | 'min', children: ScoringNode[], extra: object = {}) =>
  compileRuleset({
    schemaVersion: 1,
    precision: 2,
    root: { id: 'root', label: 'Total', type: 'group', aggregate, children, ...extra },
  })

const contributions = (result: ReturnType<typeof evaluate>) =>
  result.explanation.children!.map((c) => c.points)
const units = (n: number) => toUnits(n, 100)

describe('scoring properties', () => {
  it('SUM equals the exact sum of child contributions', () => {
    fc.assert(
      fc.property(criteriaWithValues, ({ nodes, values }) => {
        const result = evaluate(build('sum', nodes), values)
        const expected = contributions(result).reduce((s, p) => s + units(p), 0)
        expect(units(result.total)).toBe(expected)
        expect(result.valid).toBe(true)
      }),
    )
  })

  it('MAX/MIN select a child contribution that bounds all others', () => {
    fc.assert(
      fc.property(
        criteriaWithValues,
        fc.constantFrom('max', 'min'),
        ({ nodes, values }, aggregate) => {
          const result = evaluate(build(aggregate as 'max' | 'min', nodes), values)
          const pts = contributions(result)
          expect(pts).toContain(result.total)
          for (const p of pts) {
            if (aggregate === 'max') expect(result.total).toBeGreaterThanOrEqual(p)
            else expect(result.total).toBeLessThanOrEqual(p)
          }
        },
      ),
    )
  })

  it('M2-T12: evaluation is deterministic and independent of value key order', () => {
    fc.assert(
      fc.property(criteriaWithValues, ({ nodes, values }) => {
        const ruleset = build('sum', nodes)
        const reversed = Object.fromEntries(Object.entries(values).reverse())
        expect(evaluate(ruleset, reversed)).toEqual(evaluate(ruleset, values))
      }),
    )
  })

  it('SUM is independent of child order', () => {
    fc.assert(
      fc.property(criteriaWithValues, ({ nodes, values }) => {
        const forward = evaluate(build('sum', nodes), values).total
        const backward = evaluate(build('sum', [...nodes].reverse()), values).total
        expect(backward).toBe(forward)
      }),
    )
  })

  it('deductions never increase the score and clamps are respected', () => {
    fc.assert(
      fc.property(criteriaWithValues, criteriaWithValues, ({ nodes, values }, penalties) => {
        const renamed = penalties.nodes.map((n) => ({ ...n, id: `p${n.id}`, label: `p${n.id}` }))
        const penaltyValues = Object.fromEntries(
          Object.entries(penalties.values).map(([k, v]) => [`p${k}`, v]),
        )
        const deduction = {
          id: 'penalties',
          label: 'Penalties',
          type: 'group' as const,
          aggregate: 'sum' as const,
          deduction: true,
          children: renamed,
        }
        const without = evaluate(build('sum', nodes), values).total
        const withPenalties = evaluate(build('sum', [...nodes, deduction]), {
          ...values,
          ...penaltyValues,
        }).total
        expect(withPenalties).toBeLessThanOrEqual(without)
        const clamped = evaluate(build('sum', [...nodes, deduction], { clamp: { min: 0 } }), {
          ...values,
          ...penaltyValues,
        })
        expect(clamped.total).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  it('totals are exact at the configured precision', () => {
    fc.assert(
      fc.property(criteriaWithValues, ({ nodes, values }) => {
        const { total } = evaluate(build('sum', nodes), values)
        expect(Math.round(total * 100) / 100).toBe(total)
      }),
    )
  })

  it('fingerprints ignore key order and detect changes', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (obj) => {
        const reordered = Object.fromEntries(Object.entries(obj).reverse())
        expect(fingerprint(reordered)).toBe(fingerprint(obj))
        expect(canonicalJson(reordered)).toBe(canonicalJson(obj))
      }),
    )
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }))
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{16}$/)
  })
})
