import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRuleset, evaluate, type ScoringNode, type ScoreValues } from '../src'

const dir = join(import.meta.dirname, '../examples')
const load = (file: string) => compileRuleset(JSON.parse(readFileSync(join(dir, file), 'utf8')))

/** Best result on the table: every object fully placed, nothing damaged (no surprise task). */
function perfect(node: ScoringNode, values: ScoreValues = {}): ScoreValues {
  switch (node.type) {
    case 'group':
      if (node.distribute) values[node.children[0]!.id] = node.distribute.objects
      else node.children.forEach((child) => perfect(child, values))
      break
    case 'boolean':
      values[node.id] = true
      break
    case 'number':
      if (node.id !== 'surprise') values[node.id] = node.max ?? 0
      break
    case 'select':
      values[node.id] = node.options.reduce((a, b) => (b.points > a.points ? b : a)).id
      break
  }
  return values
}

// Maximum points printed on the official WRO 2026 score sheets.
const MAX: Record<string, number> = {
  'wro-2026-robomission-elementary.json': 255,
  'wro-2026-robomission-junior.json': 230,
  'wro-2026-robomission-senior.json': 233,
}

describe('example rulesets', () => {
  it('covers every file in examples/', () => {
    expect(readdirSync(dir).sort()).toEqual(Object.keys(MAX).sort())
  })

  for (const [file, max] of Object.entries(MAX)) {
    describe(file, () => {
      const ruleset = load(file)

      it(`reaches the maximum of ${max} points`, () => {
        const result = evaluate(ruleset, perfect(ruleset.definition.root))
        expect(result.issues).toEqual([])
        expect(result.total).toBe(max)
      })

      it('adds the surprise task on top', () => {
        expect(evaluate(ruleset, { ...perfect(ruleset.definition.root), surprise: 20 }).total).toBe(
          max + 20,
        )
      })

      it('gives no bonus without points in the other tasks', () => {
        const bonus = ruleset.definition.root.children.find((c) => c.label.includes('Bonus'))!
        const values = perfect(bonus)
        const result = evaluate(ruleset, values)
        expect(result.total).toBe(0)
        expect(result.issues.map((i) => i.code)).toContain('not_eligible')
      })
    })
  }
})
