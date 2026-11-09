import {
  SCHEMA_VERSION,
  type Aggregation,
  type Calculation,
  type Issue,
  type Operand,
  type RankingConfig,
  type RoundConfig,
} from './types'

export interface CompiledRankingConfig {
  readonly config: RankingConfig
  readonly precision: number
  readonly scale: number
  readonly timeResolutionMs: number
  readonly rounds: ReadonlyMap<string, RoundConfig>
  readonly calculations: ReadonlyMap<string, Calculation>
}

export class RankingConfigError extends Error {
  constructor(readonly issues: Issue[]) {
    super(
      `Invalid ranking configuration: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    )
    this.name = 'RankingConfigError'
  }
}

export type ValidationResult =
  { ok: true; config: CompiledRankingConfig; issues: [] } | { ok: false; issues: Issue[] }

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const OPS = ['ADD', 'MAX', 'MIN', 'DIFFERENCE', 'BEST_BY', 'WORST_BY', 'SUM_BEST_N']
const ORDERED_OPS = ['BEST_BY', 'WORST_BY', 'SUM_BEST_N']

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** Validates a ranking configuration. Never throws; the result holds a frozen copy. */
export function validateRankingConfig(raw: unknown): ValidationResult {
  const input = isObject(raw) ? deepFreeze(JSON.parse(JSON.stringify(raw)) as Json) : raw
  const issues: Issue[] = []
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message })
  const keys = (obj: Json, allowed: string[], path: string) => {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) add(`${path}.${k}`, 'unknown_property', `Unknown property "${k}".`)
    }
  }

  if (!isObject(input)) {
    add('$', 'invalid_type', 'The configuration must be an object.')
    return { ok: false, issues }
  }
  keys(
    input,
    [
      'schemaVersion',
      'precision',
      'timeResolutionMs',
      'rounds',
      'calculations',
      'policies',
      'ranking',
    ],
    '$',
  )
  if (input.schemaVersion !== SCHEMA_VERSION) {
    add('$.schemaVersion', 'unsupported_schema', `schemaVersion must be ${SCHEMA_VERSION}.`)
  }
  let precision = 2
  if (input.precision !== undefined) {
    if (
      !Number.isInteger(input.precision) ||
      (input.precision as number) < 0 ||
      (input.precision as number) > 4
    ) {
      add('$.precision', 'invalid_precision', 'precision must be a whole number from 0 to 4.')
    } else precision = input.precision as number
  }
  let timeResolutionMs = 1
  if (input.timeResolutionMs !== undefined) {
    if (!Number.isInteger(input.timeResolutionMs) || (input.timeResolutionMs as number) < 1) {
      add('$.timeResolutionMs', 'invalid_type', 'timeResolutionMs must be a whole number ≥ 1.')
    } else timeResolutionMs = input.timeResolutionMs as number
  }

  const rounds = new Map<string, RoundConfig>()
  const calculations = new Map<string, Calculation>()
  const idPaths = new Map<string, string>()

  const checkId = (value: unknown, path: string): string | undefined => {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      add(
        path,
        'invalid_id',
        'Ids start with a letter and contain only letters, digits, "_" and "-" (max. 64).',
      )
      return undefined
    }
    if (idPaths.has(value)) {
      add(path, 'duplicate_id', `"${value}" is already used by a round or calculation.`)
      return undefined
    }
    idPaths.set(value, path)
    return value
  }

  const checkLabel = (obj: Json, path: string, required: boolean) => {
    if (obj.label === undefined) {
      if (required) add(`${path}.label`, 'required', 'label is required.')
    } else if (typeof obj.label !== 'string' || !obj.label.trim()) {
      add(`${path}.label`, 'invalid_type', 'label must be a non-empty string.')
    }
  }

  const checkSortKeys = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length === 0) {
      add(path, 'invalid_type', 'by must be a non-empty list of sort keys.')
      return
    }
    value.forEach((key, i) => {
      const p = `${path}[${i}]`
      if (!isObject(key)) return add(p, 'invalid_type', 'A sort key must be an object.')
      keys(key, ['field', 'order'], p)
      if (key.field !== 'points' && key.field !== 'time')
        add(`${p}.field`, 'invalid_type', 'field must be points or time.')
      if (key.order !== 'asc' && key.order !== 'desc')
        add(`${p}.order`, 'invalid_type', 'order must be asc or desc.')
    })
  }

  /** Validates op/by/n; `operandCount` is undefined for round attempts (unknown in advance). */
  const checkAggregation = (agg: Json, path: string, operandCount?: number) => {
    if (!OPS.includes(agg.op as string)) {
      add(`${path}.op`, 'invalid_type', `op must be one of ${OPS.join(', ')}.`)
      return
    }
    const op = agg.op as Aggregation['op']
    if (agg.by !== undefined) {
      if (!ORDERED_OPS.includes(op))
        add(`${path}.by`, 'not_allowed', `by is only used by ${ORDERED_OPS.join(', ')}.`)
      else checkSortKeys(agg.by, `${path}.by`)
    }
    if (op === 'SUM_BEST_N') {
      if (!Number.isInteger(agg.n) || (agg.n as number) < 1) {
        add(`${path}.n`, 'required', 'SUM_BEST_N needs n ≥ 1.')
      } else if (operandCount !== undefined && (agg.n as number) > operandCount) {
        add(`${path}.n`, 'invalid_range', `n exceeds the number of operands (${operandCount}).`)
      }
    } else if (agg.n !== undefined) {
      add(`${path}.n`, 'not_allowed', 'n is only used by SUM_BEST_N.')
    }
    if (op === 'DIFFERENCE' && operandCount !== undefined && operandCount !== 2) {
      add(
        `${path}.operands`,
        'invalid_operands',
        'DIFFERENCE needs exactly two operands (minuend, subtrahend).',
      )
    }
    if (op === 'DIFFERENCE' && operandCount === undefined) {
      add(`${path}.op`, 'not_allowed', 'DIFFERENCE cannot combine attempts.')
    }
  }

  // Rounds
  if (!Array.isArray(input.rounds) || input.rounds.length === 0) {
    add('$.rounds', 'required', 'At least one round is required.')
  } else {
    input.rounds.forEach((round, i) => {
      const path = `$.rounds[${i}]`
      if (!isObject(round)) return add(path, 'invalid_type', 'A round must be an object.')
      keys(round, ['key', 'label', 'attempts'], path)
      const key = checkId(round.key, `${path}.key`)
      checkLabel(round, path, false)
      if (round.attempts !== undefined) {
        if (!isObject(round.attempts))
          add(`${path}.attempts`, 'invalid_type', 'attempts must be an object.')
        else {
          keys(round.attempts, ['op', 'by', 'n'], `${path}.attempts`)
          checkAggregation(round.attempts, `${path}.attempts`)
        }
      }
      if (key) rounds.set(key, round as unknown as RoundConfig)
    })
  }

  // Calculations
  const calcList = input.calculations
  if (calcList !== undefined && !Array.isArray(calcList)) {
    add('$.calculations', 'invalid_type', 'calculations must be a list.')
  }
  const calcs = Array.isArray(calcList) ? calcList : []
  calcs.forEach((calc, i) => {
    const path = `$.calculations[${i}]`
    if (!isObject(calc)) return add(path, 'invalid_type', 'A calculation must be an object.')
    keys(calc, ['id', 'label', 'op', 'operands', 'by', 'n'], path)
    const id = checkId(calc.id, `${path}.id`)
    checkLabel(calc, path, true)
    const operands = calc.operands
    if (!Array.isArray(operands) || operands.length === 0) {
      add(`${path}.operands`, 'required', 'At least one operand is required.')
    }
    checkAggregation(calc, path, Array.isArray(operands) ? operands.length : 0)
    if (id) calculations.set(id, calc as unknown as Calculation)
  })

  const checkOperand = (operand: unknown, path: string) => {
    if (!isObject(operand))
      return add(path, 'invalid_operand', 'An operand must be { round } or { calc }.')
    const forms = ['round', 'calc'].filter((k) => k in operand)
    if (forms.length !== 1)
      return add(path, 'invalid_operand', 'An operand must be { round } or { calc }.')
    keys(operand, forms, path)
    if ('round' in operand && !rounds.has(operand.round as string)) {
      add(`${path}.round`, 'unknown_reference', `Unknown round "${String(operand.round)}".`)
    }
    if ('calc' in operand && !calculations.has(operand.calc as string)) {
      add(`${path}.calc`, 'unknown_reference', `Unknown calculation "${String(operand.calc)}".`)
    }
  }
  calcs.forEach((calc, i) => {
    if (isObject(calc) && Array.isArray(calc.operands)) {
      calc.operands.forEach((o, j) => checkOperand(o, `$.calculations[${i}].operands[${j}]`))
    }
  })

  // Policies
  if (input.policies !== undefined) {
    if (!isObject(input.policies)) add('$.policies', 'invalid_type', 'policies must be an object.')
    else {
      keys(input.policies, ['missing', 'disqualified', 'absent'], '$.policies')
      const allowed: Record<string, string[]> = {
        missing: ['zero', 'exclude', 'unranked'],
        disqualified: ['zero', 'exclude'],
        absent: ['zero', 'exclude'],
      }
      for (const [name, values] of Object.entries(allowed)) {
        const value = input.policies[name]
        if (value !== undefined && !values.includes(value as string)) {
          add(`$.policies.${name}`, 'invalid_type', `${name} must be one of ${values.join(', ')}.`)
        }
      }
    }
  }

  // Ranking
  if (!isObject(input.ranking)) {
    add('$.ranking', 'required', 'ranking is required.')
  } else {
    keys(input.ranking, ['keys', 'ties'], '$.ranking')
    const rankingKeys = input.ranking.keys
    if (!Array.isArray(rankingKeys) || rankingKeys.length === 0) {
      add('$.ranking.keys', 'required', 'At least one ranking key is required.')
    } else {
      rankingKeys.forEach((key, i) => {
        const path = `$.ranking.keys[${i}]`
        if (!isObject(key)) return add(path, 'invalid_type', 'A ranking key must be an object.')
        keys(key, ['source', 'field', 'order', 'label'], path)
        checkOperand(key.source, `${path}.source`)
        if (key.field !== 'points' && key.field !== 'time')
          add(`${path}.field`, 'invalid_type', 'field must be points or time.')
        if (key.order !== 'asc' && key.order !== 'desc')
          add(`${path}.order`, 'invalid_type', 'order must be asc or desc.')
        if (key.label !== undefined && (typeof key.label !== 'string' || !key.label.trim())) {
          add(`${path}.label`, 'invalid_type', 'label must be a non-empty string.')
        }
      })
    }
    if (
      input.ranking.ties !== undefined &&
      input.ranking.ties !== 'shared' &&
      input.ranking.ties !== 'name'
    ) {
      add('$.ranking.ties', 'invalid_type', 'ties must be shared or name.')
    }
  }

  if (issues.length === 0) {
    const cycle = findCycle(calculations)
    if (cycle) {
      add(
        idPaths.get(cycle[0]!)!.replace(/\.id$/, '.operands'),
        'circular_reference',
        `Circular calculation: ${cycle.join(' → ')}.`,
      )
    }
  }

  if (issues.length) return { ok: false, issues }
  return {
    ok: true,
    issues: [],
    config: {
      config: input as unknown as RankingConfig,
      precision,
      scale: 10 ** precision,
      timeResolutionMs,
      rounds,
      calculations,
    },
  }
}

export function compileRankingConfig(input: unknown): CompiledRankingConfig {
  const result = validateRankingConfig(input)
  if (!result.ok) throw new RankingConfigError(result.issues)
  return result.config
}

function findCycle(calculations: Map<string, Calculation>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): string[] | null => {
    state.set(id, 'visiting')
    stack.push(id)
    for (const operand of calculations.get(id)!.operands) {
      if (!('calc' in operand)) continue
      const next = operand.calc
      if (state.get(next) === 'visiting') return [...stack.slice(stack.indexOf(next)), next]
      if (!state.has(next)) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }
  for (const id of calculations.keys()) {
    if (!state.has(id)) {
      const found = visit(id)
      if (found) return found
    }
  }
  return null
}

export const operandId = (operand: Operand) => ('round' in operand ? operand.round : operand.calc)
