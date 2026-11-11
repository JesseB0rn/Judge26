import { t } from '@/i18n'
/**
 * Visual aggregation builder model (M3-18): maps a ranking configuration onto a block diagram
 * (rounds → calculations → ranking) and applies edits. Pure functions over the same format as
 * the JSON editor; nothing builder-specific is stored, so an opened configuration saved without
 * edits round-trips unchanged (M3-T16). Circular references can be drawn; validation reports
 * them and saving stays blocked (M3-T17).
 *
 * Block ids: "round:<index>", "calc:<index>" and "ranking".
 */
import type {
  Aggregation,
  CalcOp,
  Calculation,
  Issue,
  Operand,
  RankingConfig,
  RankingEntry,
  RankingKey,
  RoundConfig,
} from '@judge26/ranking-engine'
import { formatTime } from '@judge26/ranking-engine'
import { gridLayout, nodeHeight, type DiagramNode, type DiagramWire } from '@/shared/diagram/types'

export interface Draft {
  rounds: RoundConfig[]
  calculations?: Calculation[]
  ranking: { keys: RankingKey[]; ties?: 'shared' | 'name'; [key: string]: unknown }
  [key: string]: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function isBuildable(config: unknown): config is Draft {
  if (!isObject(config) || !Array.isArray(config.rounds) || !config.rounds.every(isObject)) {
    return false
  }
  const calcs = config.calculations
  if (calcs !== undefined) {
    if (!Array.isArray(calcs)) return false
    if (!calcs.every((c) => isObject(c) && (c.operands === undefined || Array.isArray(c.operands))))
      return false
  }
  return isObject(config.ranking) && Array.isArray(config.ranking.keys)
}

const GLYPHS: Record<CalcOp, string> = {
  ADD: 'Σ',
  MAX: 'MAX',
  MIN: 'MIN',
  DIFFERENCE: 'a−b',
  BEST_BY: 'BEST',
  WORST_BY: 'WRST',
  SUM_BEST_N: 'ΣN',
}

/** Calculations of the builder palette; label and hint are read in the current language. */
export const OPS: readonly { op: CalcOp; label: string; glyph: string; hint: string }[] = (
  Object.keys(GLYPHS) as CalcOp[]
).map((op) => ({
  op,
  glyph: GLYPHS[op],
  get label() {
    return t(`rankings.ops.${op}.label`)
  },
  get hint() {
    return t(`rankings.ops.${op}.hint`)
  },
}))
const ORDERED: CalcOp[] = ['BEST_BY', 'WORST_BY', 'SUM_BEST_N']

export const refOf = (o: Operand) => ('round' in o ? o.round : o.calc)

function usedIds(def: Draft) {
  return new Set([...def.rounds.map((r) => r.key), ...(def.calculations ?? []).map((c) => c.id)])
}
function unique(def: Draft, base: string) {
  const ids = usedIds(def)
  for (let i = 1; ; i++) if (!ids.has(`${base}${i}`)) return `${base}${i}`
}

/** The block a reference points to (first match, like validation's lookup). */
function blockOf(def: Draft, operand: Operand | undefined): string | undefined {
  if (!operand || !isObject(operand)) return undefined
  if ('round' in operand) {
    const i = def.rounds.findIndex((r) => r.key === operand.round)
    return i < 0 ? undefined : `round:${i}`
  }
  const i = (def.calculations ?? []).findIndex((c) => c.id === operand.calc)
  return i < 0 ? undefined : `calc:${i}`
}

/** The reference that wiring from a block produces. */
export function operandOf(def: Draft, block: string): Operand | undefined {
  const [kind, index] = block.split(':')
  if (kind === 'round') {
    const r = def.rounds[Number(index)]
    return r ? { round: r.key } : undefined
  }
  if (kind === 'calc') {
    const c = def.calculations?.[Number(index)]
    return c ? { calc: c.id } : undefined
  }
  return undefined
}

// --- Edits ---

export function addRound(def: Draft): { def: Draft; key: string } {
  const next = clone(def)
  const key = unique(next, 'R')
  next.rounds.push({ key, label: t('rankings.builder.roundLabel', { n: key.slice(1) }) })
  return { def: next, key: `round:${next.rounds.length - 1}` }
}

export function addCalculation(def: Draft, op: CalcOp): { def: Draft; key: string } {
  const next = clone(def)
  const meta = OPS.find((o) => o.op === op)!
  const calc: Calculation = {
    id: unique(next, op === 'SUM_BEST_N' ? 'bestN' : op.split('_')[0]!.toLowerCase()),
    label: meta.label,
    op,
    operands: [],
  }
  if (op === 'SUM_BEST_N') calc.n = 1
  next.calculations = [...(next.calculations ?? []), calc]
  return { def: next, key: `calc:${next.calculations.length - 1}` }
}

/** Removes every operand and ranking key that references `ref`. */
function dropReferences(def: Draft, matches: (o: Operand) => boolean) {
  for (const c of def.calculations ?? []) {
    if (Array.isArray(c.operands)) c.operands = c.operands.filter((o) => !matches(o))
  }
  def.ranking.keys = def.ranking.keys.filter((k) => !(isObject(k.source) && matches(k.source)))
}

export function removeBlock(def: Draft, block: string): Draft {
  const [kind, i] = block.split(':')
  const index = Number(i)
  const next = clone(def)
  if (kind === 'round') {
    const [round] = next.rounds.splice(index, 1)
    if (round && !next.rounds.some((r) => r.key === round.key)) {
      dropReferences(next, (o) => 'round' in o && o.round === round.key)
    }
  } else if (kind === 'calc' && next.calculations) {
    const [calc] = next.calculations.splice(index, 1)
    if (calc && !next.calculations.some((c) => c.id === calc.id)) {
      dropReferences(next, (o) => 'calc' in o && o.calc === calc.id)
    }
    if (!next.calculations.length) delete next.calculations
  } else {
    return def
  }
  return next
}

function setProps(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete target[k]
    else target[k] = v
  }
}

function renameRefs(def: Draft, kind: 'round' | 'calc', from: string, to: string) {
  const rename = (o: Operand): Operand =>
    kind === 'round' && 'round' in o && o.round === from
      ? { round: to }
      : kind === 'calc' && 'calc' in o && o.calc === from
        ? { calc: to }
        : o
  for (const c of def.calculations ?? [])
    if (Array.isArray(c.operands)) c.operands = c.operands.map(rename)
  for (const k of def.ranking.keys) if (isObject(k.source)) k.source = rename(k.source)
}

export function updateRound(def: Draft, index: number, patch: Record<string, unknown>): Draft {
  const next = clone(def)
  const round = next.rounds[index] as unknown as Record<string, unknown> | undefined
  if (!round) return def
  const old = round.key as string
  setProps(round, patch)
  if (typeof patch.key === 'string' && patch.key !== old) renameRefs(next, 'round', old, patch.key)
  return next
}

export function updateCalculation(
  def: Draft,
  index: number,
  patch: Record<string, unknown>,
): Draft {
  const next = clone(def)
  const calc = next.calculations?.[index] as unknown as Record<string, unknown> | undefined
  if (!calc) return def
  const old = calc.id as string
  setProps(calc, patch)
  if (typeof patch.id === 'string' && patch.id !== old) renameRefs(next, 'calc', old, patch.id)
  return next
}

/**
 * The properties an aggregation keeps when its operator changes: `by` only for ordered
 * operators, `n` only for SUM_BEST_N (validation rejects them elsewhere).
 */
export function opPatch(current: Partial<Aggregation>, op: CalcOp): Record<string, unknown> {
  return {
    op,
    by: ORDERED.includes(op) ? current.by : undefined,
    n: op === 'SUM_BEST_N' ? (current.n ?? 1) : undefined,
  }
}

export function updateRanking(def: Draft, patch: Record<string, unknown>): Draft {
  const next = clone(def)
  setProps(next.ranking as Record<string, unknown>, patch)
  return next
}

export function updateKey(def: Draft, index: number, patch: Record<string, unknown>): Draft {
  const next = clone(def)
  const key = next.ranking.keys[index] as unknown as Record<string, unknown> | undefined
  if (!key) return def
  setProps(key, patch)
  return next
}

export function updateSettings(def: Draft, patch: Record<string, unknown>): Draft {
  const next = clone(def)
  setProps(next, patch)
  return next
}

export function setPolicy(def: Draft, name: string, value: string | undefined): Draft {
  const next = clone(def)
  const policies = { ...(next.policies as Record<string, unknown> | undefined) }
  if (value === undefined) delete policies[name]
  else policies[name] = value
  if (Object.keys(policies).length) next.policies = policies
  else delete next.policies
  return next
}

function moveItem<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item!)
  return copy
}

export function moveOperand(def: Draft, calc: number, from: number, to: number): Draft {
  const next = clone(def)
  const c = next.calculations?.[calc]
  if (!c) return def
  c.operands = moveItem(c.operands, from, to)
  return next
}

export function removeOperand(def: Draft, calc: number, index: number): Draft {
  const next = clone(def)
  const c = next.calculations?.[calc]
  if (!c) return def
  c.operands = c.operands.filter((_, i) => i !== index)
  return next
}

export function moveKey(def: Draft, from: number, to: number): Draft {
  const next = clone(def)
  next.ranking.keys = moveItem(next.ranking.keys, from, to)
  return next
}

export function removeKey(def: Draft, index: number): Draft {
  const next = clone(def)
  next.ranking.keys = next.ranking.keys.filter((_, i) => i !== index)
  return next
}

/**
 * Applies a wire drawn from block `from` to terminal `port` ("in<n>") of block `to`: a new
 * terminal appends, an occupied one is replaced. Returns the new configuration or a message.
 */
export function connect(def: Draft, from: string, to: string, port: string): Draft | string {
  const operand = operandOf(def, from)
  if (!operand) return t('rankings.builder.noOutput')
  const index = Number(port.replace('in', ''))
  const next = clone(def)
  if (to === 'ranking') {
    const keys = next.ranking.keys
    if (index < keys.length) keys[index]!.source = operand
    else keys.push({ source: operand, field: 'points', order: 'desc' })
    return next
  }
  const [kind, i] = to.split(':')
  const calc = kind === 'calc' ? next.calculations?.[Number(i)] : undefined
  if (!calc) return t('rankings.builder.noInputs')
  const operands = Array.isArray(calc.operands) ? calc.operands : (calc.operands = [])
  if (index < operands.length) operands[index] = operand
  else operands.push(operand)
  return next
}

/** Deletes the connection a wire stands for. Wire ids: "op:<calc>:<index>" or "key:<index>". */
export function disconnect(def: Draft, wire: string): Draft {
  const [kind, a, b] = wire.split(':')
  if (kind === 'op') return removeOperand(def, Number(a), Number(b))
  if (kind === 'key') return removeKey(def, Number(a))
  return def
}

// --- Diagram ---

const sortText = (by: Aggregation['by']) =>
  (
    by ?? [
      { field: 'points', order: 'desc' },
      { field: 'time', order: 'asc' },
    ]
  )
    .map((k) => `${k.field === 'points' ? 'pts' : 't'}${k.order === 'desc' ? '↓' : '↑'}`)
    .join(' ')

export function describeAggregation(agg: Partial<Aggregation> | undefined) {
  if (!agg) return t('rankings.builder.bestAttempt')
  const meta = OPS.find((o) => o.op === agg.op)
  if (!meta) return String(agg.op ?? '?')
  if (agg.op === 'SUM_BEST_N') {
    return t('rankings.builder.bestNBy', { n: agg.n ?? '?', sort: sortText(agg.by) })
  }
  if (agg.op === 'BEST_BY' || agg.op === 'WORST_BY')
    return t('rankings.builder.opBy', { op: meta.label, sort: sortText(agg.by) })
  return meta.label
}

const fieldText = (k: Pick<RankingKey, 'field' | 'order'>) =>
  `${k.field === 'time' ? t('rankings.fields.time') : t('rankings.fields.points')} ${k.order === 'asc' ? '↑' : '↓'}`

export function issuesByBlock(def: Draft, issues: Issue[]) {
  const map = new Map<string, string[]>()
  const general: Issue[] = []
  for (const issue of issues) {
    const m = /^\$\.(rounds|calculations)\[(\d+)\]/.exec(issue.path)
    const block = m
      ? `${m[1] === 'rounds' ? 'round' : 'calc'}:${m[2]}`
      : issue.path.startsWith('$.ranking')
        ? 'ranking'
        : null
    if (block) map.set(block, [...(map.get(block) ?? []), issue.message])
    else general.push(issue)
  }
  return { map, general }
}

function probeText(entry: RankingEntry | undefined, id: string) {
  const r = entry?.results[id]
  if (!r) return undefined
  if (r.status !== 'ok') return r.status
  const time = r.timeMs ? ` · ${formatTime(r.timeMs)}` : ''
  return `${r.points ?? '–'}${time}`
}

export function toDiagram(
  def: Draft,
  options: {
    issues?: Issue[]
    probe?: RankingEntry
    positions?: Map<string, { x: number; y: number }>
  } = {},
): { nodes: DiagramNode[]; wires: DiagramWire[] } {
  const errors = issuesByBlock(def, options.issues ?? []).map
  const calcs = def.calculations ?? []
  const label = (o: Operand | undefined) => {
    const block = blockOf(def, o)
    if (!block || !o) return o && isObject(o) ? `? ${refOf(o)}` : '?'
    const [kind, i] = block.split(':')
    return kind === 'round'
      ? (def.rounds[Number(i)]!.label ?? def.rounds[Number(i)]!.key)
      : calcs[Number(i)]!.label || calcs[Number(i)]!.id
  }

  const nodes: DiagramNode[] = [
    ...def.rounds.map((r, i) => ({
      id: `round:${i}`,
      x: 0,
      y: 0,
      shape: 'control' as const,
      tone: 'round' as const,
      glyph: String(r.key ?? '?').slice(0, 4),
      title: r.label || String(r.key ?? '?'),
      subtitle: `${r.key} · ${describeAggregation(r.attempts)}`,
      inputs: [],
      output: true,
      probe: probeText(options.probe, r.key),
      errors: errors.get(`round:${i}`),
    })),
    ...calcs.map((c, i) => {
      const meta = OPS.find((o) => o.op === c.op)
      const operands = Array.isArray(c.operands) ? c.operands : []
      const inputs =
        c.op === 'DIFFERENCE'
          ? ['a', 'b'].map((name, j) => ({
              id: `in${j}`,
              label: operands[j]
                ? `${name}: ${label(operands[j])}`
                : `${name}: ${t('rankings.builder.wireHere')}`,
              spare: !operands[j],
            }))
          : [
              ...operands.map((o, j) => ({ id: `in${j}`, label: label(o) })),
              { id: `in${operands.length}`, label: t('rankings.builder.wireToAdd'), spare: true },
            ]
      const badges: string[] = []
      if (c.op === 'SUM_BEST_N') badges.push(`n=${c.n ?? '?'}`)
      if (ORDERED.includes(c.op)) badges.push(sortText(c.by))
      return {
        id: `calc:${i}`,
        x: 0,
        y: 0,
        shape: 'function' as const,
        tone: 'calc' as const,
        glyph: meta?.glyph ?? '?',
        title: c.label || c.id,
        subtitle: `${c.id} · ${meta?.label ?? c.op}`,
        inputs,
        output: true,
        badges,
        probe: probeText(options.probe, c.id),
        errors: errors.get(`calc:${i}`),
      }
    }),
    {
      id: 'ranking',
      x: 0,
      y: 0,
      shape: 'indicator',
      tone: 'sink',
      glyph: '#',
      title: t('categories.ranking'),
      subtitle:
        def.ranking.ties === 'name'
          ? t('rankings.builder.tiesName')
          : t('rankings.builder.tiesShared'),
      inputs: [
        ...def.ranking.keys.map((k, j) => ({
          id: `in${j}`,
          label: `${j + 1}. ${k.label ?? label(k.source)} · ${fieldText(k)}`,
        })),
        {
          id: `in${def.ranking.keys.length}`,
          label: def.ranking.keys.length
            ? t('rankings.builder.addTieBreaker')
            : t('rankings.builder.addKey'),
          spare: true,
        },
      ],
      output: false,
      errors: errors.get('ranking'),
    },
  ]

  const circular = new Set(
    [...errors].filter(([, m]) => m.some((x) => x.startsWith('Circular'))).map(([k]) => k),
  )
  const wires: DiagramWire[] = []
  calcs.forEach((c, i) => {
    ;(Array.isArray(c.operands) ? c.operands : []).forEach((o, j) => {
      const from = blockOf(def, o)
      if (!from) return
      wires.push({
        id: `op:${i}:${j}`,
        from,
        to: `calc:${i}`,
        port: `in${j}`,
        tone: from.startsWith('calc') ? 'calc' : 'round',
        thick: from.startsWith('calc'),
        error: circular.has(`calc:${i}`),
      })
    })
  })
  def.ranking.keys.forEach((k, j) => {
    const from = blockOf(def, k.source)
    if (!from) return
    wires.push({
      id: `key:${j}`,
      from,
      to: 'ranking',
      port: `in${j}`,
      tone: 'sink',
      thick: true,
    })
  })

  // Layout: rounds in column 0, each calculation right of its operands, the ranking last.
  const column = new Map<string, number>()
  const colOf = (block: string, seen: Set<string>): number => {
    if (column.has(block)) return column.get(block)!
    if (!block.startsWith('calc:') || seen.has(block)) return 0
    seen.add(block)
    const c = calcs[Number(block.split(':')[1])]!
    const deps = (Array.isArray(c.operands) ? c.operands : [])
      .map((o) => blockOf(def, o))
      .filter((b): b is string => !!b)
    const value = 1 + Math.max(0, ...deps.map((d) => colOf(d, seen)))
    column.set(block, value)
    return value
  }
  def.rounds.forEach((_, i) => column.set(`round:${i}`, 0))
  calcs.forEach((_, i) => colOf(`calc:${i}`, new Set()))
  const last = Math.max(0, ...column.values()) + 1
  column.set('ranking', last)

  const sizes = new Map(nodes.map((n) => [n.id, nodeHeight(n)]))
  const columns: string[][] = Array.from({ length: last + 1 }, () => [])
  for (const n of nodes) columns[column.get(n.id) ?? 0]!.push(n.id)
  let positions = gridLayout([columns[0]!], sizes)
  const incoming = new Map<string, string[]>()
  for (const w of wires) incoming.set(w.to, [...(incoming.get(w.to) ?? []), w.from])
  for (let c = 1; c <= last; c++) {
    const centres = new Map<string, number>()
    for (const id of columns[c]!) {
      const ys = (incoming.get(id) ?? [])
        .map((src) => positions.get(src))
        .filter((p): p is { x: number; y: number } => !!p)
        .map((p) => p.y + 40)
      if (ys.length) centres.set(id, ys.reduce((a, b) => a + b, 0) / ys.length)
    }
    const ids = [...columns[c]!].sort((a, b) => (centres.get(a) ?? 0) - (centres.get(b) ?? 0))
    positions = new Map([
      ...positions,
      ...gridLayout(
        columns.map((_, i) => (i === c ? ids : [])),
        sizes,
        { centres },
      ),
    ])
  }
  for (const n of nodes) {
    const p = options.positions?.get(n.id) ?? positions.get(n.id) ?? { x: 0, y: 0 }
    n.x = p.x
    n.y = p.y
  }
  return { nodes, wires }
}

/** For tests and starting points: a ranking config typed as a draft. */
export const asDraft = (config: RankingConfig) => clone(config) as unknown as Draft
