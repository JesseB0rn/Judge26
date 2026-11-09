import { describe, expect, it } from 'vitest'
import { evaluate } from '../src'
import { bool, codes, group, num, ruleset } from './helpers'

// Mandatory scoring fixtures from ROADMAP §4.
describe('M2 mandatory fixtures', () => {
  it('M2-F01: additive scoring (10 + 15 + 20 = 45)', () => {
    const r = ruleset([bool('A', 10), bool('B', 15), bool('C', 20)])
    const result = evaluate(r, { A: true, B: true, C: true })
    expect(result.total).toBe(45)
    expect(result.valid).toBe(true)
  })

  describe('M2-F02: mutually exclusive criteria', () => {
    const r = ruleset([
      group('choice', 'sum', [bool('A', 10), bool('B', 25)], { selection: { min: 1, max: 1 } }),
    ])

    it('selecting A produces 10', () => {
      expect(evaluate(r, { A: true }).total).toBe(10)
    })

    it('selecting B produces 25', () => {
      expect(evaluate(r, { B: true, A: false }).total).toBe(25)
    })

    it('selecting both is rejected', () => {
      const result = evaluate(r, { A: true, B: true })
      expect(result.valid).toBe(false)
      expect(codes(result.issues)).toEqual(['too_many_selected'])
    })

    it('a required group cannot be submitted empty', () => {
      const result = evaluate(r, {})
      expect(result.valid).toBe(false)
      expect(codes(result.issues)).toEqual(['too_few_selected'])
      // Drafts may be incomplete.
      expect(evaluate(r, {}, { mode: 'draft' }).valid).toBe(true)
    })
  })

  it('M2-F03: penalties (50 − 5 − 10 = 35)', () => {
    const r = ruleset([
      num('base', 1),
      bool('penaltyA', 5, { deduction: true }),
      bool('penaltyB', 10, { deduction: true }),
    ])
    const result = evaluate(r, { base: 50, penaltyA: true, penaltyB: true })
    expect(result.total).toBe(35)
    expect(result.explanation.formula).toBe('SUM(50, -5, -10) = 35')
  })

  it('M2-F04: nested groups (ADD(ADD(10, 20), MAX(5, 15)) = 45)', () => {
    const r = ruleset([
      group('groupA', 'sum', [bool('a1', 10), bool('a2', 20)]),
      group('groupB', 'max', [bool('b1', 5), bool('b2', 15)]),
    ])
    const result = evaluate(r, { a1: true, a2: true, b1: true, b2: true })
    expect(result.total).toBe(45)
    const [a, b] = result.explanation.children!
    expect(a!.points).toBe(30)
    expect(b!.points).toBe(15)
    expect(b!.selectedChild).toBe('b2')
  })

  describe('M2-F05: conditional bonus', () => {
    const r = ruleset([
      bool('task', 0),
      bool('bonus', 15, { condition: { ref: 'task', op: 'eq', value: true } }),
    ])

    it('task completed: 15 bonus points', () => {
      expect(evaluate(r, { task: true, bonus: true }).total).toBe(15)
    })

    it('task not completed: bonus is zero and not eligible', () => {
      const result = evaluate(r, { task: false })
      expect(result.total).toBe(0)
      expect(result.valid).toBe(true)
      const bonus = result.explanation.children![1]!
      expect(bonus).toMatchObject({ active: false, inactiveReason: 'condition', points: 0 })

      const selected = evaluate(r, { task: false, bonus: true })
      expect(selected.total).toBe(0)
      expect(codes(selected.issues)).toEqual(['not_eligible'])
    })
  })
})
