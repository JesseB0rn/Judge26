import { evaluate } from './evaluate'
import type { CompiledRuleset } from './validate'
import type { Explanation, ScoreValue, ScoreValues, ScoringNode } from './types'

/**
 * Score sheet helper: sets a value and keeps the sheet consistent.
 *
 * - In a group that allows at most one selection, selecting a child deselects its
 *   siblings (booleans become `false`, other values are cleared).
 * - Values of criteria that become inactive (unmet condition) are cleared.
 *
 * Returns a new values object; the input is not modified.
 */
export function updateValue(
  ruleset: CompiledRuleset,
  values: ScoreValues,
  id: string,
  value: ScoreValue | undefined,
): ScoreValues {
  const next: ScoreValues = { ...values }
  if (value === null || value === undefined) delete next[id]
  else next[id] = value

  const node = ruleset.nodes.get(id)
  const parentId = ruleset.parents.get(id)
  const parent = parentId ? ruleset.nodes.get(parentId) : undefined
  const selects =
    value === true ||
    (typeof value === 'string' && value !== '') ||
    (typeof value === 'number' && value !== 0)
  if (node && selects && parent?.type === 'group' && parent.selection?.max === 1) {
    for (const sibling of parent.children) if (sibling.id !== id) clear(sibling, next)
  }

  return pruneInactive(ruleset, next)
}

/** Removes values of inactive criteria until the sheet is stable. */
export function pruneInactive(ruleset: CompiledRuleset, values: ScoreValues): ScoreValues {
  let current = values
  for (let i = 0; i <= ruleset.nodes.size; i++) {
    const inactive = inactiveWithValues(
      evaluate(ruleset, current, { mode: 'draft' }).explanation,
      current,
    )
    if (inactive.length === 0) return current
    current = { ...current }
    for (const key of inactive) delete current[key]
  }
  return current
}

function clear(node: ScoringNode, values: ScoreValues) {
  if (node.type === 'group') node.children.forEach((c) => clear(c, values))
  else if (node.type === 'boolean') {
    if (values[node.id] !== undefined) values[node.id] = false
  } else delete values[node.id]
}

function inactiveWithValues(explanation: Explanation, values: ScoreValues): string[] {
  const own =
    !explanation.active && explanation.type !== 'group' && values[explanation.id] != null
      ? [explanation.id]
      : []
  return [...own, ...(explanation.children ?? []).flatMap((c) => inactiveWithValues(c, values))]
}
