import { scaleFor, toUnits } from './decimal'
import {
  SCHEMA_VERSION,
  type Condition,
  type Issue,
  type RulesetDefinition,
  type ScoringNode,
} from './types'

/** A validated ruleset, ready for evaluation. Create with `compileRuleset`. */
export interface CompiledRuleset {
  readonly definition: RulesetDefinition
  readonly precision: number
  readonly scale: number
  /** All nodes by id, in definition (pre-)order. */
  readonly nodes: ReadonlyMap<string, ScoringNode>
  readonly parents: ReadonlyMap<string, string | null>
}

export class RulesetValidationError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`Invalid ruleset: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`)
    this.name = 'RulesetValidationError'
  }
}

export type ValidationResult =
  { ok: true; ruleset: CompiledRuleset; issues: [] } | { ok: false; issues: Issue[] }

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const DEFAULT_PRECISION = 2
const COMPARE_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const
const NODE_KEYS = ['id', 'label', 'description', 'condition', 'deduction', 'type']
const TYPE_KEYS: Record<string, string[]> = {
  boolean: ['points', 'required'],
  number: ['integer', 'min', 'max', 'pointsPerUnit', 'unit', 'required'],
  select: ['options', 'required'],
  group: ['aggregate', 'children', 'selection', 'clamp', 'empty'],
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Validates a ruleset definition (M2-12). Never throws. The compiled ruleset holds
 * a frozen deep copy, so later changes to `input` cannot alter results (M2-14).
 */
export function validateRuleset(raw: unknown): ValidationResult {
  const input = isObject(raw) ? deepFreeze(JSON.parse(JSON.stringify(raw)) as Json) : raw
  const issues: Issue[] = []
  const add = (path: string, code: string, message: string, nodeId?: string) =>
    issues.push({ path, code, message, ...(nodeId ? { nodeId } : {}) })

  if (!isObject(input)) {
    add('$', 'invalid_type', 'The ruleset must be an object.')
    return { ok: false, issues }
  }
  checkKeys(input, ['schemaVersion', 'precision', 'root'], '$', add)
  if (input.schemaVersion !== SCHEMA_VERSION) {
    add('$.schemaVersion', 'unsupported_schema', `schemaVersion must be ${SCHEMA_VERSION}.`)
  }
  let precision = DEFAULT_PRECISION
  if (input.precision !== undefined) {
    if (
      !Number.isInteger(input.precision) ||
      (input.precision as number) < 0 ||
      (input.precision as number) > 4
    ) {
      add('$.precision', 'invalid_precision', 'precision must be a whole number from 0 to 4.')
    } else {
      precision = input.precision as number
    }
  }
  const scale = scaleFor(precision)

  const nodes = new Map<string, ScoringNode>()
  const parents = new Map<string, string | null>()
  const paths = new Map<string, string>()

  const checkNumber = (
    obj: Json,
    key: string,
    path: string,
    opts: { required?: boolean; integer?: boolean; nonNegative?: boolean; points?: boolean } = {},
  ): number | undefined => {
    const value = obj[key]
    if (value === undefined) {
      if (opts.required) add(`${path}.${key}`, 'required', `${key} is required.`)
      return undefined
    }
    if (!isFiniteNumber(value)) {
      add(`${path}.${key}`, 'invalid_type', `${key} must be a number.`)
      return undefined
    }
    if (opts.integer && !Number.isInteger(value)) {
      add(`${path}.${key}`, 'not_integer', `${key} must be a whole number.`)
    }
    if (opts.nonNegative && value < 0) {
      add(`${path}.${key}`, 'negative_value', `${key} must not be negative.`)
    }
    if (opts.points && toUnits(value, scale) / scale !== value) {
      add(
        `${path}.${key}`,
        'too_many_decimals',
        `${key} has more than ${precision} decimal place(s) (ruleset precision).`,
      )
    }
    return value
  }

  const checkString = (obj: Json, key: string, path: string, required: boolean) => {
    const value = obj[key]
    if (value === undefined) {
      if (required) add(`${path}.${key}`, 'required', `${key} is required.`)
      return undefined
    }
    if (typeof value !== 'string' || (required && !value.trim())) {
      add(`${path}.${key}`, 'invalid_type', `${key} must be a non-empty string.`)
      return undefined
    }
    return value
  }

  const checkBoolean = (obj: Json, key: string, path: string) => {
    if (obj[key] !== undefined && typeof obj[key] !== 'boolean') {
      add(`${path}.${key}`, 'invalid_type', `${key} must be true or false.`)
    }
  }

  const checkRange = (
    obj: Json,
    path: string,
    opts: { integer?: boolean; nonNegative?: boolean; points?: boolean },
  ) => {
    checkKeys(obj, ['min', 'max'], path, add)
    const min = checkNumber(obj, 'min', path, opts)
    const max = checkNumber(obj, 'max', path, opts)
    if (min !== undefined && max !== undefined && min > max) {
      add(`${path}.max`, 'invalid_range', 'max must not be lower than min.')
    }
    return { min, max }
  }

  function visitNode(raw: unknown, path: string, parent: string | null) {
    if (!isObject(raw)) {
      add(path, 'invalid_type', 'A node must be an object.')
      return
    }
    const type = raw.type
    if (typeof type !== 'string' || !(type in TYPE_KEYS)) {
      add(`${path}.type`, 'invalid_type', 'type must be one of boolean, number, select, group.')
      return
    }
    checkKeys(raw, [...NODE_KEYS, ...TYPE_KEYS[type]!], path, add)

    const id = raw.id
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      add(
        `${path}.id`,
        'invalid_id',
        'id must start with a letter and contain only letters, digits, "_" and "-" (max. 64).',
      )
    } else if (nodes.has(id)) {
      add(`${path}.id`, 'duplicate_id', `The id "${id}" is used more than once.`, id)
    } else {
      nodes.set(id, raw as unknown as ScoringNode)
      parents.set(id, parent)
      paths.set(id, path)
    }
    const nodeId = typeof id === 'string' ? id : undefined
    checkString(raw, 'label', path, true)
    checkString(raw, 'description', path, false)
    checkBoolean(raw, 'deduction', path)
    const deduction = raw.deduction === true
    if ('required' in raw) checkBoolean(raw, 'required', path)

    switch (type) {
      case 'boolean':
        checkNumber(raw, 'points', path, { required: true, nonNegative: deduction, points: true })
        break
      case 'number': {
        checkBoolean(raw, 'integer', path)
        const integer = raw.integer === true
        const min = checkNumber(raw, 'min', path, { integer })
        const max = checkNumber(raw, 'max', path, { integer })
        if (min !== undefined && max !== undefined && min > max) {
          add(`${path}.max`, 'invalid_range', 'max must not be lower than min.', nodeId)
        }
        checkNumber(raw, 'pointsPerUnit', path, {
          required: true,
          nonNegative: deduction,
          points: true,
        })
        checkString(raw, 'unit', path, false)
        break
      }
      case 'select': {
        const options = raw.options
        if (!Array.isArray(options) || options.length === 0) {
          add(
            `${path}.options`,
            'required',
            'A select criterion needs at least one option.',
            nodeId,
          )
          break
        }
        const seen = new Set<string>()
        options.forEach((option, i) => {
          const optionPath = `${path}.options[${i}]`
          if (!isObject(option)) {
            add(optionPath, 'invalid_type', 'An option must be an object.', nodeId)
            return
          }
          checkKeys(option, ['id', 'label', 'points'], optionPath, add)
          const optionId = option.id
          if (typeof optionId !== 'string' || !ID_PATTERN.test(optionId)) {
            add(
              `${optionPath}.id`,
              'invalid_id',
              'Option ids follow the same rules as node ids.',
              nodeId,
            )
          } else if (seen.has(optionId)) {
            add(`${optionPath}.id`, 'duplicate_id', `Duplicate option id "${optionId}".`, nodeId)
          } else {
            seen.add(optionId)
          }
          checkString(option, 'label', optionPath, true)
          checkNumber(option, 'points', optionPath, {
            required: true,
            nonNegative: deduction,
            points: true,
          })
        })
        break
      }
      case 'group': {
        if (!['sum', 'max', 'min'].includes(raw.aggregate as string)) {
          add(`${path}.aggregate`, 'invalid_type', 'aggregate must be sum, max or min.', nodeId)
        }
        const children = raw.children
        if (!Array.isArray(children) || children.length === 0) {
          add(`${path}.children`, 'required', 'A group needs at least one child.', nodeId)
        } else {
          children.forEach((child, i) => visitNode(child, `${path}.children[${i}]`, nodeId ?? null))
        }
        if (raw.selection !== undefined) {
          if (!isObject(raw.selection)) {
            add(`${path}.selection`, 'invalid_type', 'selection must be an object.', nodeId)
          } else {
            const { min, max } = checkRange(raw.selection, `${path}.selection`, {
              integer: true,
              nonNegative: true,
            })
            const count = Array.isArray(children) ? children.length : 0
            if (min !== undefined && min > count) {
              add(
                `${path}.selection.min`,
                'invalid_range',
                `min exceeds the number of children (${count}).`,
                nodeId,
              )
            }
            if (max !== undefined && max < 1) {
              add(`${path}.selection.max`, 'invalid_range', 'max must be at least 1.', nodeId)
            }
          }
        }
        if (raw.clamp !== undefined) {
          if (!isObject(raw.clamp))
            add(`${path}.clamp`, 'invalid_type', 'clamp must be an object.', nodeId)
          else checkRange(raw.clamp, `${path}.clamp`, { points: true })
        }
        checkNumber(raw, 'empty', path, { points: true })
        break
      }
    }
  }

  if (!isObject(input.root) || input.root.type !== 'group') {
    add('$.root', 'invalid_root', 'root must be a group.')
  } else {
    if (input.root.condition !== undefined) {
      add('$.root.condition', 'not_allowed', 'The root group cannot have a condition.')
    }
    if (input.root.deduction !== undefined) {
      add('$.root.deduction', 'not_allowed', 'The root group cannot be a deduction.')
    }
    visitNode(input.root, '$.root', null)
  }

  // Conditions are checked once all node ids are known.
  for (const [id, node] of nodes) {
    if (node.condition !== undefined) {
      checkCondition(node.condition, `${paths.get(id)}.condition`, id, nodes, add)
    }
  }

  if (issues.length === 0) {
    const cycle = findCycle(nodes, parents)
    if (cycle) {
      add(
        `${paths.get(cycle[0]!)}.condition`,
        'circular_reference',
        `Circular dependency: ${cycle.join(' → ')}.`,
        cycle[0],
      )
    }
  }

  if (issues.length) return { ok: false, issues }
  return {
    ok: true,
    issues: [],
    ruleset: {
      definition: input as unknown as RulesetDefinition,
      precision,
      scale,
      nodes,
      parents,
    },
  }
}

/** Validates and compiles a ruleset; throws `RulesetValidationError` if invalid. */
export function compileRuleset(input: unknown): CompiledRuleset {
  const result = validateRuleset(input)
  if (!result.ok) throw new RulesetValidationError(result.issues)
  return result.ruleset
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function checkKeys(
  obj: Json,
  allowed: string[],
  path: string,
  add: (path: string, code: string, message: string) => void,
) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key))
      add(`${path}.${key}`, 'unknown_property', `Unknown property "${key}".`)
  }
}

function checkCondition(
  raw: unknown,
  path: string,
  owner: string,
  nodes: Map<string, ScoringNode>,
  add: (path: string, code: string, message: string, nodeId?: string) => void,
) {
  if (!isObject(raw)) {
    add(path, 'invalid_condition', 'A condition must be an object.', owner)
    return
  }
  const forms = ['ref', 'all', 'any', 'not'].filter((k) => k in raw)
  if (forms.length !== 1) {
    add(path, 'invalid_condition', 'A condition needs exactly one of ref, all, any or not.', owner)
    return
  }
  if ('all' in raw || 'any' in raw) {
    const key = 'all' in raw ? 'all' : 'any'
    checkKeys(raw, [key], path, add)
    const list = raw[key]
    if (!Array.isArray(list) || list.length === 0) {
      add(`${path}.${key}`, 'invalid_condition', `${key} needs at least one condition.`, owner)
      return
    }
    list.forEach((c, i) => checkCondition(c, `${path}.${key}[${i}]`, owner, nodes, add))
    return
  }
  if ('not' in raw) {
    checkKeys(raw, ['not'], path, add)
    checkCondition(raw.not, `${path}.not`, owner, nodes, add)
    return
  }

  checkKeys(raw, ['ref', 'op', 'value'], path, add)
  const target = typeof raw.ref === 'string' ? nodes.get(raw.ref) : undefined
  if (!target) {
    // M2-T08
    add(`${path}.ref`, 'unknown_reference', `Unknown node "${String(raw.ref)}".`, owner)
    return
  }
  const op = raw.op
  const value = raw.value
  const invalid = (message: string) => add(path, 'invalid_condition', message, owner)

  if (op === 'set' || op === 'unset') {
    if ('value' in raw) invalid(`"${op}" takes no value.`)
    return
  }
  switch (target.type) {
    case 'boolean':
      if ((op !== 'eq' && op !== 'neq') || typeof value !== 'boolean') {
        invalid(`Boolean "${target.id}" supports eq/neq with true or false.`)
      }
      break
    case 'select': {
      const ids = new Set(target.options.map((o) => o.id))
      if (op === 'in') {
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.some((v) => !ids.has(v as string))
        ) {
          invalid(`"in" needs a list of option ids of "${target.id}".`)
        }
      } else if ((op !== 'eq' && op !== 'neq') || typeof value !== 'string' || !ids.has(value)) {
        invalid(`Select "${target.id}" supports eq/neq/in with its option ids.`)
      }
      break
    }
    case 'number':
    case 'group':
      if (!COMPARE_OPS.includes(op as never) || !isFiniteNumber(value)) {
        invalid(`"${target.id}" supports ${COMPARE_OPS.join('/')} with a number.`)
      }
      break
  }
}

/**
 * Finds a dependency cycle (M2-T09). Activity of a node depends on its parent's
 * activity and on the nodes its condition references; a group's score depends on
 * its children; a criterion's value depends on its own activity.
 */
function findCycle(
  nodes: Map<string, ScoringNode>,
  parents: Map<string, string | null>,
): string[] | null {
  const edges = new Map<string, string[]>()
  for (const [id, node] of nodes) {
    const activity = [] as string[]
    const parent = parents.get(id)
    if (parent) activity.push(`A:${parent}`)
    if (node.condition) for (const ref of conditionRefs(node.condition)) activity.push(`S:${ref}`)
    edges.set(`A:${id}`, activity)
    edges.set(
      `S:${id}`,
      node.type === 'group' ? [`A:${id}`, ...node.children.map((c) => `S:${c.id}`)] : [`A:${id}`],
    )
  }

  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (vertex: string): string[] | null => {
    state.set(vertex, 'visiting')
    stack.push(vertex)
    for (const next of edges.get(vertex) ?? []) {
      if (state.get(next) === 'visiting') {
        const cycle = stack.slice(stack.indexOf(next)).map((v) => v.slice(2))
        return [...new Set(cycle), cycle[0]!]
      }
      if (!state.has(next)) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(vertex, 'done')
    return null
  }
  for (const vertex of edges.keys()) {
    if (!state.has(vertex)) {
      const found = visit(vertex)
      if (found) return found
    }
  }
  return null
}

export function conditionRefs(condition: Condition): string[] {
  if ('ref' in condition) return [condition.ref]
  if ('all' in condition) return condition.all.flatMap(conditionRefs)
  if ('any' in condition) return condition.any.flatMap(conditionRefs)
  return conditionRefs(condition.not)
}
