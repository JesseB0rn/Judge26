import { formatUnits, fromUnits, toUnits } from '@judge26/scoring-engine'
import { operandId, type CompiledRankingConfig } from './validate'
import type {
  Aggregation,
  GameInput,
  Issue,
  ResultExplanation,
  ResultStatus,
  SortKey,
} from './types'

/** Internal result: points in scaled integer units, time in milliseconds. */
export interface Value {
  units: number | null
  timeMs: number | null
  status: ResultStatus
  excluded: boolean
  incomplete: boolean
  explanation: ResultExplanation
}

export const DEFAULT_ORDER: SortKey[] = [
  { field: 'points', order: 'desc' },
  { field: 'time', order: 'asc' },
]
const DEFAULT_ATTEMPTS: Aggregation = { op: 'BEST_BY', by: DEFAULT_ORDER }

export function formatTime(ms: number | null): string {
  return ms === null ? '–' : `${(ms / 1000).toFixed(3)} s`
}

const describeKeys = (keys: SortKey[]) =>
  keys.map((k) => `${k.field} ${k.order === 'desc' ? '↓' : '↑'}`).join(', ')

/**
 * Compares two results: negative if `a` ranks before `b`. Missing values always
 * rank last, regardless of the sort order.
 */
export function compareResults(
  a: { units: number | null; timeMs: number | null },
  b: { units: number | null; timeMs: number | null },
  keys: SortKey[],
): number {
  for (const key of keys) {
    const av = key.field === 'points' ? a.units : a.timeMs
    const bv = key.field === 'points' ? b.units : b.timeMs
    if (av === null && bv === null) continue
    if (av === null) return 1
    if (bv === null) return -1
    const diff = key.order === 'desc' ? bv - av : av - bv
    if (diff !== 0) return diff
  }
  return 0
}

/** Validates and normalizes games; invalid ones are reported and ignored. */
export function normalizeGames(
  config: CompiledRankingConfig,
  games: GameInput[],
  issues: Issue[],
  path: string,
): Map<string, (GameInput & { attempt: number })[]> {
  const byRound = new Map<string, (GameInput & { attempt: number })[]>()
  games.forEach((game, i) => {
    const p = `${path}.games[${i}]`
    const attempt = game.attempt ?? 1
    if (!config.rounds.has(game.round)) {
      issues.push({ path: p, code: 'unknown_round', message: `Unknown round "${game.round}".` })
      return
    }
    if (!Number.isInteger(attempt) || attempt < 1) {
      issues.push({
        path: p,
        code: 'invalid_attempt',
        message: 'attempt must be a whole number ≥ 1.',
      })
      return
    }
    if (!['completed', 'disqualified', 'absent'].includes(game.status)) {
      issues.push({
        path: p,
        code: 'invalid_status',
        message: `Invalid status "${String(game.status)}".`,
      })
      return
    }
    if (
      game.status === 'completed' &&
      (typeof game.points !== 'number' || !Number.isFinite(game.points))
    ) {
      issues.push({ path: p, code: 'missing_points', message: 'A completed game needs points.' })
      return
    }
    const time = game.timeMs
    if (time !== undefined && time !== null && (!Number.isInteger(time) || time < 0)) {
      issues.push({
        path: p,
        code: 'invalid_time',
        message: 'timeMs must be a whole number of milliseconds ≥ 0.',
      })
      return
    }
    const list = byRound.get(game.round) ?? []
    if (list.some((g) => g.attempt === attempt)) {
      issues.push({
        path: p,
        code: 'duplicate_attempt',
        message: `Duplicate attempt ${attempt} in round "${game.round}".`,
      })
      return
    }
    list.push({ ...game, attempt })
    byRound.set(game.round, list)
  })
  for (const list of byRound.values()) list.sort((a, b) => a.attempt - b.attempt)
  return byRound
}

/** Computes every round and calculation result of one team (M3-03, M3-12). */
export function computeTeam(
  config: CompiledRankingConfig,
  games: Map<string, (GameInput & { attempt: number })[]>,
): Map<string, Value> {
  const { scale, timeResolutionMs } = config
  const policies = config.config.policies ?? {}
  const memo = new Map<string, Value>()
  const pts = (units: number | null) => (units === null ? '–' : formatUnits(units, scale))
  const truncate = (ms: number | null | undefined) =>
    ms === null || ms === undefined ? null : Math.floor(ms / timeResolutionMs) * timeResolutionMs

  const make = (base: Omit<ResultExplanation, 'points'> & { units: number | null }): Value => {
    const { units, ...rest } = base
    return {
      units,
      timeMs: base.timeMs,
      status: base.status,
      excluded: base.excluded,
      incomplete: base.incomplete,
      explanation: { ...rest, points: units === null ? null : fromUnits(units, scale) },
    }
  }

  /** Applies the zero/exclude policy to a result without valid points. */
  const unavailable = (
    id: string,
    kind: ResultExplanation['kind'],
    label: string,
    status: 'missing' | 'disqualified' | 'absent',
  ): Value => {
    const policy = (status === 'missing' ? policies.missing : policies[status]) ?? 'zero'
    const excluded = policy === 'exclude'
    return make({
      id,
      kind,
      label,
      units: excluded ? null : 0,
      timeMs: null,
      status,
      excluded,
      incomplete: status === 'missing',
      formula: `${status} → ${excluded ? 'excluded' : '0'}`,
    })
  }

  const attemptValue = (
    key: string,
    label: string,
    game: GameInput & { attempt: number },
  ): Value => {
    const id = `${key}#${game.attempt}`
    const attemptLabel = `${label} attempt ${game.attempt}`
    if (game.status !== 'completed') return unavailable(id, 'attempt', attemptLabel, game.status)
    const units = toUnits(game.points as number, scale)
    const timeMs = truncate(game.timeMs)
    return make({
      id,
      kind: 'attempt',
      label: attemptLabel,
      units,
      timeMs,
      status: 'ok',
      excluded: false,
      incomplete: false,
      formula: `${pts(units)} pts / ${formatTime(timeMs)}`,
    })
  }

  function aggregate(
    agg: Aggregation,
    operands: Value[],
    id: string,
    kind: 'round' | 'calculation',
    label: string,
  ): Value {
    const incomplete = operands.some((o) => o.incomplete)
    const included = operands.filter((o) => !o.excluded)
    const explanations = operands.map((o) => o.explanation)
    const base = { id, kind, label, incomplete, operands: explanations }
    const keys = agg.by ?? DEFAULT_ORDER

    const excludedResult = (reason: string) =>
      make({
        ...base,
        units: null,
        timeMs: null,
        status: 'excluded',
        excluded: true,
        formula: `${agg.op}: ${reason}`,
      })

    if (included.length === 0) return excludedResult('no results')

    const sum = (values: Value[]) => ({
      units: values.reduce((s, v) => s + (v.units as number), 0),
      timeMs: values.every((v) => v.timeMs !== null)
        ? values.reduce((s, v) => s + (v.timeMs as number), 0)
        : null,
    })
    const ok = (units: number, timeMs: number | null, formula: string, selected?: string) =>
      make({
        ...base,
        units,
        timeMs,
        status: 'ok',
        excluded: false,
        formula,
        ...(selected ? { selected } : {}),
      })

    switch (agg.op) {
      case 'ADD': {
        const s = sum(included)
        return ok(
          s.units,
          s.timeMs,
          `ADD(${included.map((v) => pts(v.units)).join(', ')}) = ${pts(s.units)}`,
        )
      }
      case 'MAX':
      case 'MIN': {
        const pick = agg.op === 'MAX' ? Math.max : Math.min
        const units = pick(...included.map((v) => v.units as number))
        return ok(
          units,
          null,
          `${agg.op}(${included.map((v) => pts(v.units)).join(', ')}) = ${pts(units)}`,
        )
      }
      case 'DIFFERENCE': {
        const [a, b] = operands
        if (a!.excluded || b!.excluded) return excludedResult('both operands are required')
        const units = (a!.units as number) - (b!.units as number)
        return ok(
          units,
          null,
          `${a!.explanation.id} − ${b!.explanation.id} = ${pts(a!.units)} − ${pts(b!.units)} = ${pts(units)}`,
        )
      }
      case 'BEST_BY':
      case 'WORST_BY': {
        const sign = agg.op === 'BEST_BY' ? 1 : -1
        const ordered = included
          .map((value, index) => ({ value, index }))
          .sort((x, y) => sign * compareResults(x.value, y.value, keys) || x.index - y.index)
        const chosen = ordered[0]!.value
        // The whole result is selected: its time stays associated with its points (M3-11).
        return ok(
          chosen.units as number,
          chosen.timeMs,
          `${agg.op}(${describeKeys(keys)}) → ${chosen.explanation.id}: ${pts(chosen.units)} pts / ${formatTime(chosen.timeMs)}`,
          chosen.explanation.id,
        )
      }
      case 'SUM_BEST_N': {
        const n = agg.n as number
        const best = included
          .map((value, index) => ({ value, index }))
          .sort((x, y) => compareResults(x.value, y.value, keys) || x.index - y.index)
          .slice(0, n)
          .map((x) => x.value)
        const s = sum(best)
        return ok(
          s.units,
          s.timeMs,
          `SUM_BEST_N(${n}; ${describeKeys(keys)}): ${best.map((v) => v.explanation.id).join(' + ')} = ${pts(s.units)}`,
        )
      }
    }
  }

  function roundValue(key: string): Value {
    const round = config.rounds.get(key)!
    const label = round.label ?? key
    const attempts = games.get(key) ?? []
    if (attempts.length === 0) return unavailable(key, 'round', label, 'missing')
    const values = attempts.map((g) => attemptValue(key, label, g))
    if (values.length === 1) {
      const only = values[0]!
      return { ...only, explanation: { ...only.explanation, id: key, kind: 'round', label } }
    }
    return aggregate(round.attempts ?? DEFAULT_ATTEMPTS, values, key, 'round', label)
  }

  function value(id: string): Value {
    const cached = memo.get(id)
    if (cached) return cached
    let result: Value
    if (config.rounds.has(id)) result = roundValue(id)
    else {
      const calc = config.calculations.get(id)!
      const operands = calc.operands.map((o) => value(operandId(o)))
      result = aggregate(calc, operands, calc.id, 'calculation', calc.label)
    }
    memo.set(id, result)
    return result
  }

  for (const key of config.rounds.keys()) value(key)
  for (const id of config.calculations.keys()) value(id)
  return memo
}
