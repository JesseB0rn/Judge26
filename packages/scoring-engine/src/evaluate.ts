import { formatUnits, fromUnits, toUnits } from './decimal'
import type { CompiledRuleset } from './validate'
import type {
  Condition,
  Criterion,
  EvaluationMode,
  EvaluationResult,
  Explanation,
  Group,
  Issue,
  ScoreValue,
  ScoreValues,
  ScoringNode,
} from './types'

interface Activity {
  active: boolean
  reason?: 'condition' | 'parent'
}

interface NodeScore {
  /** Contribution in scaled units (after clamp and deduction). */
  units: number
  /** At least one (active) criterion in this node has a value. */
  answered: boolean
  /** Counts towards a group's selection limits (M2-05). */
  selected: boolean
  explanation: Explanation
}

/**
 * Evaluates score sheet values against a compiled ruleset.
 *
 * Deterministic: the same ruleset and values always produce the same result
 * (M2-T12). In `draft` mode, missing required values and unmet minimum
 * selections are not reported; all other problems are.
 */
export function evaluate(
  ruleset: CompiledRuleset,
  values: ScoreValues,
  options: { mode?: EvaluationMode } = {},
): EvaluationResult {
  const mode = options.mode ?? 'final'
  const { nodes, parents, scale } = ruleset
  const issues: Issue[] = []
  const issue = (nodeId: string, code: string, message: string) =>
    issues.push({ path: nodeId, nodeId, code, message })

  for (const key of Object.keys(values)) {
    const node = nodes.get(key)
    if (!node) issue(key, 'unknown_criterion', `Unknown criterion "${key}".`)
    else if (node.type === 'group')
      issue(key, 'not_a_criterion', `"${key}" is a group and takes no value.`)
  }

  const activityMemo = new Map<string, Activity>()
  const scoreMemo = new Map<string, NodeScore>()

  const rawValue = (id: string): ScoreValue | undefined => {
    const value = values[id]
    return value === null || value === undefined ? undefined : value
  }

  /** The value if it is valid for the criterion, otherwise undefined. */
  const validValue = (node: Criterion): ScoreValue | undefined => {
    const value = rawValue(node.id)
    if (value === undefined) return undefined
    return valueProblem(node, value) ? undefined : value
  }

  function activity(id: string): Activity {
    const memo = activityMemo.get(id)
    if (memo) return memo
    const node = nodes.get(id)!
    const parent = parents.get(id)
    let result: Activity = { active: true }
    if (parent && !activity(parent).active) result = { active: false, reason: 'parent' }
    else if (node.condition && !holds(node.condition))
      result = { active: false, reason: 'condition' }
    activityMemo.set(id, result)
    return result
  }

  function holds(condition: Condition): boolean {
    if ('all' in condition) return condition.all.every(holds)
    if ('any' in condition) return condition.any.some(holds)
    if ('not' in condition) return !holds(condition.not)

    const target = nodes.get(condition.ref)!
    const active = activity(target.id).active
    let current: ScoreValue | undefined
    if (target.type === 'group') {
      const s = score(target.id)
      current = active && s.answered ? fromUnits(s.units, scale) : undefined
    } else {
      current = active ? validValue(target) : undefined
    }

    if (condition.op === 'set') return current !== undefined
    if (condition.op === 'unset') return current === undefined
    // Comparisons with a missing value are false (including neq).
    if (current === undefined) return false
    switch (condition.op) {
      case 'eq':
        return current === condition.value
      case 'neq':
        return current !== condition.value
      case 'in':
        return condition.value.includes(current as string)
      case 'gt':
        return (current as number) > (condition.value as number)
      case 'gte':
        return (current as number) >= (condition.value as number)
      case 'lt':
        return (current as number) < (condition.value as number)
      case 'lte':
        return (current as number) <= (condition.value as number)
    }
  }

  function score(id: string): NodeScore {
    const memo = scoreMemo.get(id)
    if (memo) return memo
    const node = nodes.get(id)!
    const result = node.type === 'group' ? scoreGroup(node) : scoreCriterion(node)
    scoreMemo.set(id, result)
    return result
  }

  const fmt = (units: number) => formatUnits(units, scale)

  function inactive(node: ScoringNode, act: Activity, children?: Explanation[]): NodeScore {
    return {
      units: 0,
      answered: false,
      selected: false,
      explanation: {
        id: node.id,
        label: node.label,
        type: node.type,
        active: false,
        inactiveReason: act.reason,
        points: 0,
        formula:
          act.reason === 'condition'
            ? 'inactive (condition not met)'
            : 'inactive (parent inactive)',
        ...(children ? { children } : {}),
      },
    }
  }

  function applyDeduction(node: ScoringNode, units: number, formula: string) {
    if (!node.deduction || units === 0) return { units, formula }
    return { units: -units, formula: `${formula} → deduction −${fmt(units)}` }
  }

  function scoreCriterion(node: Criterion): NodeScore {
    const act = activity(node.id)
    if (!act.active) return inactive(node, act)
    const value = validValue(node)
    let units = 0
    let formula = 'no value'
    let selected = false
    if (value !== undefined) {
      switch (node.type) {
        case 'boolean':
          units = value === true ? toUnits(node.points, scale) : 0
          formula = value === true ? `yes → ${fmt(units)}` : 'no → 0'
          selected = value === true
          break
        case 'number':
          units = toUnits((value as number) * node.pointsPerUnit, scale)
          formula = `${value as number} × ${node.pointsPerUnit} = ${fmt(units)}`
          selected = value !== 0
          break
        case 'select': {
          const option = node.options.find((o) => o.id === value)!
          units = toUnits(option.points, scale)
          formula = `${option.label} → ${fmt(units)}`
          selected = true
          break
        }
      }
    }
    const applied = applyDeduction(node, units, formula)
    return {
      units: applied.units,
      answered: value !== undefined,
      selected,
      explanation: {
        id: node.id,
        label: node.label,
        type: node.type,
        active: true,
        value: rawValue(node.id) ?? null,
        points: fromUnits(applied.units, scale),
        formula: applied.formula,
      },
    }
  }

  function scoreGroup(node: Group): NodeScore {
    const childScores = node.children.map((c) => score(c.id))
    const children = childScores.map((c) => c.explanation)
    const act = activity(node.id)
    if (!act.active) return inactive(node, act, children)

    const eligible = node.children
      .map((child, i) => ({ child, score: childScores[i]! }))
      .filter(({ child, score }) => activity(child.id).active && score.answered)

    let units: number
    let formula: string
    let selectedChild: string | undefined
    if (eligible.length === 0) {
      units = toUnits(node.empty ?? 0, scale)
      formula = `no answered criteria → ${fmt(units)}`
    } else if (node.aggregate === 'sum') {
      units = eligible.reduce((sum, e) => sum + e.score.units, 0)
      formula = `SUM(${eligible.map((e) => fmt(e.score.units)).join(', ')}) = ${fmt(units)}`
    } else {
      const pick = node.aggregate === 'max' ? Math.max : Math.min
      units = pick(...eligible.map((e) => e.score.units))
      // Ties resolve to the first child in definition order (deterministic).
      selectedChild = eligible.find((e) => e.score.units === units)!.child.id
      formula = `${node.aggregate.toUpperCase()}(${eligible.map((e) => fmt(e.score.units)).join(', ')}) = ${fmt(units)}`
    }

    if (node.clamp) {
      const min = node.clamp.min !== undefined ? toUnits(node.clamp.min, scale) : -Infinity
      const max = node.clamp.max !== undefined ? toUnits(node.clamp.max, scale) : Infinity
      const clamped = Math.min(Math.max(units, min), max)
      if (clamped !== units) {
        formula = `${formula}, limited to ${fmt(clamped)}`
        units = clamped
      }
    }

    const selectedCount = node.children.filter(
      (child, i) => activity(child.id).active && childScores[i]!.selected,
    ).length
    if (node.selection) {
      const { min, max } = node.selection
      if (max !== undefined && selectedCount > max) {
        issue(
          node.id,
          'too_many_selected',
          `"${node.label}" allows at most ${max} selection(s); ${selectedCount} selected.`,
        )
      }
      if (mode === 'final' && min !== undefined && selectedCount < min) {
        issue(node.id, 'too_few_selected', `"${node.label}" requires at least ${min} selection(s).`)
      }
    }

    const applied = applyDeduction(node, units, formula)
    return {
      units: applied.units,
      // A group with a configured `empty` value always provides a score.
      answered: eligible.length > 0 || node.empty !== undefined,
      selected: selectedCount > 0,
      explanation: {
        id: node.id,
        label: node.label,
        type: 'group',
        active: true,
        points: fromUnits(applied.units, scale),
        formula: applied.formula,
        children,
        ...(selectedChild ? { selectedChild } : {}),
      },
    }
  }

  // Value validation (M2-T01 … M2-T04).
  for (const node of nodes.values()) {
    if (node.type === 'group') continue
    const value = rawValue(node.id)
    const act = activity(node.id)
    if (value !== undefined) {
      const problem = valueProblem(node, value)
      if (problem) issue(node.id, problem.code, problem.message)
      if (!act.active) {
        issue(
          node.id,
          'not_eligible',
          `"${node.label}" is not eligible: ${act.reason === 'condition' ? 'its condition is not met' : 'its group is inactive'}.`,
        )
      }
    } else if (mode === 'final' && act.active && node.required) {
      issue(node.id, 'required', `"${node.label}" is required.`)
    }
  }

  const root = score(ruleset.definition.root.id)
  return {
    total: fromUnits(root.units, scale),
    valid: issues.length === 0,
    issues: sortIssues(issues, [...nodes.keys()]),
    explanation: root.explanation,
  }
}

/** Checks a single value against its criterion definition. */
export function valueProblem(
  node: Criterion,
  value: ScoreValue,
): { code: string; message: string } | null {
  switch (node.type) {
    case 'boolean':
      return typeof value === 'boolean'
        ? null
        : { code: 'invalid_type', message: `"${node.label}" must be yes or no.` }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { code: 'invalid_type', message: `"${node.label}" must be a number.` }
      }
      if (node.integer && !Number.isInteger(value)) {
        return { code: 'not_integer', message: `"${node.label}" must be a whole number.` }
      }
      if (node.min !== undefined && value < node.min) {
        return { code: 'below_minimum', message: `"${node.label}" must be at least ${node.min}.` }
      }
      if (node.max !== undefined && value > node.max) {
        return { code: 'above_maximum', message: `"${node.label}" must be at most ${node.max}.` }
      }
      return null
    case 'select':
      return typeof value === 'string' && node.options.some((o) => o.id === value)
        ? null
        : { code: 'unknown_option', message: `"${node.label}" has no option "${String(value)}".` }
  }
}

/** Orders issues by node position in the ruleset for stable output. */
function sortIssues(issues: Issue[], order: string[]): Issue[] {
  const position = (id: string | undefined) => {
    const i = id ? order.indexOf(id) : -1
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => position(a.issue.nodeId) - position(b.issue.nodeId) || a.index - b.index)
    .map(({ issue }) => issue)
}
