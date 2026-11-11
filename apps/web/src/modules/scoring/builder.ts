import { t } from '@/i18n'
/**
 * Visual rule builder model (M2-15): maps a ruleset definition onto a block diagram and
 * applies edits to the definition. Every edit is a pure function returning a new definition
 * in the same format as the JSON editor; nothing builder-specific is stored, so a ruleset
 * opened and saved without edits round-trips unchanged (M2-T14).
 *
 * Nodes are addressed by their path of child indexes from the root ("" = root, "0.2" = third
 * child of the first child), so the builder keeps working while ids are missing or duplicated.
 */
import type { Condition, Explanation, Group, Issue, ScoringNode } from '@judge26/scoring-engine'
import {
  gridLayout,
  nodeHeight,
  type DiagramNode,
  type DiagramWire,
  type Tone,
} from '@/shared/diagram/types'

export type NodeType = ScoringNode['type']
/** A ruleset definition as edited: valid JSON with the ruleset's shape, not necessarily valid. */
export interface Draft {
  root: Group
  [key: string]: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The builder needs a tree it can walk; anything else is left to the JSON editor. */
export function isBuildable(definition: unknown): definition is Draft {
  if (!isObject(definition) || !isObject(definition.root)) return false
  const ok = (node: unknown): boolean => {
    if (!isObject(node) || typeof node.type !== 'string') return false
    if (node.type !== 'group') return true
    return Array.isArray(node.children) && node.children.every(ok)
  }
  return definition.root.type === 'group' && ok(definition.root)
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export interface Entry {
  key: string
  node: ScoringNode
  parent: string | null
  index: number
  depth: number
  /** JSON path as used by validation issues, e.g. "$.root.children[0]". */
  path: string
}

export function entries(def: Draft): Entry[] {
  const list: Entry[] = []
  const walk = (
    node: ScoringNode,
    key: string,
    parent: string | null,
    index: number,
    depth: number,
    path: string,
  ) => {
    list.push({ key, node, parent, index, depth, path })
    if (node.type === 'group') {
      node.children.forEach((child, i) =>
        walk(
          child,
          key === '' ? `${i}` : `${key}.${i}`,
          key,
          i,
          depth + 1,
          `${path}.children[${i}]`,
        ),
      )
    }
  }
  walk(def.root, '', null, 0, 0, '$.root')
  return list
}

export function nodeAt(def: Draft, key: string): ScoringNode | undefined {
  let node: ScoringNode | undefined = def.root
  if (key === '') return node
  for (const part of key.split('.')) {
    if (node?.type !== 'group') return undefined
    node = node.children[Number(part)]
  }
  return node
}

const parentKey = (key: string) => (key.includes('.') ? key.slice(0, key.lastIndexOf('.')) : '')
const isWithin = (key: string, ancestor: string) =>
  ancestor === '' || key === ancestor || key.startsWith(`${ancestor}.`)

function allIds(def: Draft) {
  return new Set(entries(def).map((e) => e.node.id))
}

function uniqueId(def: Draft, base: string) {
  const ids = allIds(def)
  for (let i = 1; ; i++) if (!ids.has(`${base}${i}`)) return `${base}${i}`
}

export const PALETTE: {
  type: NodeType
  aggregate?: Group['aggregate']
  label: string
  glyph: string
}[] = (
  [
    { type: 'boolean', glyph: 'TF', key: 'boolean' },
    { type: 'number', glyph: '123', key: 'number' },
    { type: 'select', glyph: '▾', key: 'select' },
    { type: 'group', aggregate: 'sum', glyph: 'Σ', key: 'sum' },
    { type: 'group', aggregate: 'max', glyph: 'MAX', key: 'max' },
    { type: 'group', aggregate: 'min', glyph: 'MIN', key: 'min' },
  ] as const
).map(({ key, ...block }) => ({
  ...block,
  // Read in the current language.
  get label() {
    return t(`scoring.palette.${key}`)
  },
}))

function newNode(def: Draft, type: NodeType, aggregate: Group['aggregate'] = 'sum'): ScoringNode {
  switch (type) {
    case 'boolean':
      return { id: uniqueId(def, 'task'), label: t('scoring.new.task'), type, points: 10 }
    case 'number':
      return {
        id: uniqueId(def, 'count'),
        label: t('scoring.new.count'),
        type,
        integer: true,
        min: 0,
        pointsPerUnit: 1,
      }
    case 'select': {
      return {
        id: uniqueId(def, 'choice'),
        label: t('scoring.new.choice'),
        type,
        options: [
          { id: 'none', label: t('scoring.new.none'), points: 0 },
          { id: 'full', label: t('scoring.new.full'), points: 10 },
        ],
      }
    }
    case 'group': {
      const id = uniqueId(def, aggregate === 'sum' ? 'group' : aggregate)
      // A group needs a child to be valid; start with a placeholder task.
      const child = {
        id: uniqueId(def, 'task'),
        label: t('scoring.new.task'),
        type: 'boolean' as const,
        points: 10,
      }
      return { id, label: t('scoring.new.group'), type, aggregate, children: [child] }
    }
  }
}

/** Where a palette block goes: into the selected group, next to a selected criterion, or the root. */
export function targetGroup(def: Draft, selected: string | null): string {
  if (selected === null) return ''
  const node = nodeAt(def, selected)
  if (!node) return ''
  return node.type === 'group' ? selected : parentKey(selected)
}

export function addNode(
  def: Draft,
  type: NodeType,
  parent: string,
  aggregate?: Group['aggregate'],
): { def: Draft; key: string } {
  const next = clone(def)
  const group = nodeAt(next, parent)
  if (group?.type !== 'group') return { def, key: parent }
  group.children.push(newNode(next, type, aggregate))
  const index = group.children.length - 1
  return { def: next, key: parent === '' ? `${index}` : `${parent}.${index}` }
}

/** Moves a node (with its subtree) to `index` of group `parent`. Returns null if impossible. */
export function moveNode(
  def: Draft,
  key: string,
  parent: string,
  index: number,
): { def: Draft; key: string } | null {
  if (key === '' || isWithin(parent, key)) return null
  const target = nodeAt(def, parent)
  if (target?.type !== 'group') return null
  const next = clone(def)
  const from = nodeAt(next, parentKey(key)) as Group
  const fromIndex = Number(key.split('.').pop())
  const [node] = from.children.splice(fromIndex, 1)
  // Removing the node shifts the keys of later siblings, including possibly the target group.
  const shift = (k: string) => {
    const base = parentKey(key)
    const prefix = base === '' ? '' : `${base}.`
    if (!k.startsWith(prefix) || k === base) return k
    const rest = k.slice(prefix.length).split('.')
    if (Number(rest[0]) > fromIndex) rest[0] = String(Number(rest[0]) - 1)
    return prefix + rest.join('.')
  }
  const newParent = shift(parent)
  const group = nodeAt(next, newParent) as Group
  let at = Math.min(Math.max(index, 0), group.children.length)
  if (newParent === parentKey(key) && index > fromIndex)
    at = Math.min(index - 1, group.children.length)
  group.children.splice(at, 0, node!)
  return { def: next, key: newParent === '' ? `${at}` : `${newParent}.${at}` }
}

/** Removes a node and every condition clause that referenced it or its descendants. */
export function removeNode(def: Draft, key: string): Draft {
  if (key === '') return def
  const next = clone(def)
  const node = nodeAt(next, key)
  if (!node) return def
  const removed = new Set<string>()
  const collect = (n: ScoringNode) => {
    removed.add(n.id)
    if (n.type === 'group') n.children.forEach(collect)
  }
  collect(node)
  const parent = nodeAt(next, parentKey(key)) as Group
  parent.children.splice(Number(key.split('.').pop()), 1)
  for (const e of entries(next)) {
    if (!e.node.condition) continue
    const pruned = pruneCondition(e.node.condition, (ref) => !removed.has(ref))
    if (pruned) e.node.condition = pruned
    else delete e.node.condition
  }
  return next
}

/**
 * Sets (or with `undefined` removes) properties of a node. Renaming an id also renames the
 * condition references to it.
 */
export function updateNode(def: Draft, key: string, patch: Record<string, unknown>): Draft {
  const next = clone(def)
  const node = nodeAt(next, key) as unknown as Record<string, unknown> | undefined
  if (!node) return def
  const oldId = node.id
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete node[k]
    else node[k] = v
  }
  if ('id' in patch && typeof patch.id === 'string' && oldId !== patch.id) {
    const rename = (c: Condition): Condition => {
      if ('ref' in c) return c.ref === oldId ? { ...c, ref: patch.id as string } : c
      if ('all' in c) return { all: c.all.map(rename) }
      if ('any' in c) return { any: c.any.map(rename) }
      return { not: rename(c.not) }
    }
    for (const e of entries(next)) if (e.node.condition) e.node.condition = rename(e.node.condition)
  }
  return next
}

// --- Conditions ---

export function conditionRefs(condition: Condition | undefined): string[] {
  if (!condition || !isObject(condition)) return []
  if ('ref' in condition) return [condition.ref]
  if ('all' in condition && Array.isArray(condition.all))
    return condition.all.flatMap(conditionRefs)
  if ('any' in condition && Array.isArray(condition.any))
    return condition.any.flatMap(conditionRefs)
  if ('not' in condition) return conditionRefs(condition.not)
  return []
}

function pruneCondition(c: Condition, keep: (ref: string) => boolean): Condition | undefined {
  if ('ref' in c) return keep(c.ref) ? c : undefined
  if ('not' in c) {
    const inner = pruneCondition(c.not, keep)
    return inner ? { not: inner } : undefined
  }
  const key = 'all' in c ? 'all' : 'any'
  const list = ((c as Record<string, Condition[]>)[key] ?? [])
    .map((x) => pruneCondition(x, keep))
    .filter((x): x is Condition => !!x)
  if (!list.length) return undefined
  if (list.length === 1) return list[0]
  return { [key]: list } as Condition
}

/** A sensible first clause for a reference, by the referenced node's type. */
export function defaultClause(ref: ScoringNode): Condition {
  switch (ref.type) {
    case 'boolean':
      return { ref: ref.id, op: 'eq', value: true }
    case 'select':
      return { ref: ref.id, op: 'eq', value: ref.options[ref.options.length - 1]?.id ?? '' }
    default:
      return { ref: ref.id, op: 'gt', value: 0 }
  }
}

/** Wires `refKey` into the enable terminal of `key`: adds an "and" clause to its condition. */
export function connectCondition(def: Draft, key: string, refKey: string): Draft | null {
  if (key === '' || key === refKey) return null
  const ref = nodeAt(def, refKey)
  const node = nodeAt(def, key)
  if (!ref || !node) return null
  if (conditionRefs(node.condition).includes(ref.id)) return def
  const clause = defaultClause(ref)
  const c = node.condition
  const condition: Condition = !c
    ? clause
    : 'all' in c
      ? { all: [...c.all, clause] }
      : { all: [c, clause] }
  return updateNode(def, key, { condition })
}

export function disconnectCondition(def: Draft, key: string, refId: string): Draft {
  const node = nodeAt(def, key)
  if (!node?.condition) return def
  return updateNode(def, key, { condition: pruneCondition(node.condition, (r) => r !== refId) })
}

/** Flat form of a condition for the inspector: clauses joined by "and" or "or". */
export interface Clause {
  negated: boolean
  ref: string
  op: string
  value?: unknown
}
export interface FlatCondition {
  join: 'all' | 'any'
  clauses: Clause[]
}

function toClause(c: Condition): Clause | null {
  if ('not' in c) {
    const inner = 'ref' in c.not ? toClause(c.not) : null
    return inner && !inner.negated ? { ...inner, negated: true } : null
  }
  if (!('ref' in c)) return null
  return { negated: false, ref: c.ref, op: c.op, ...('value' in c ? { value: c.value } : {}) }
}

/** Null when the condition nests deeper than one and/or level (edited as JSON then). */
export function flattenCondition(c: Condition | undefined): FlatCondition | null {
  if (!c) return { join: 'all', clauses: [] }
  const list = 'all' in c ? c.all : 'any' in c ? c.any : [c]
  if (!Array.isArray(list)) return null
  const clauses = list.map(toClause)
  if (clauses.some((x) => !x)) return null
  return { join: 'any' in c ? 'any' : 'all', clauses: clauses as Clause[] }
}

export function unflattenCondition(flat: FlatCondition): Condition | undefined {
  const list = flat.clauses.map((cl) => {
    const base = {
      ref: cl.ref,
      op: cl.op,
      ...(cl.value !== undefined ? { value: cl.value } : {}),
    } as Condition
    return cl.negated ? { not: base } : base
  })
  if (!list.length) return undefined
  if (list.length === 1) return list[0]
  return (flat.join === 'any' ? { any: list } : { all: list }) as Condition
}

// --- Diagram ---

const TONE: Record<NodeType, Tone> = {
  boolean: 'boolean',
  number: 'number',
  select: 'select',
  group: 'group',
}
const GLYPH = { boolean: 'TF', number: '123', select: '▾', sum: 'Σ', max: 'MAX', min: 'MIN' }

const fmt = (n: unknown) => (typeof n === 'number' ? String(n) : '?')

function summary(node: ScoringNode): string {
  switch (node.type) {
    case 'boolean':
      return t('scoring.summary.boolean', { points: fmt(node.points) })
    case 'number': {
      const range =
        node.min !== undefined || node.max !== undefined
          ? ` · ${node.min ?? '−∞'}…${node.max ?? '∞'}`
          : ''
      return `× ${t('scoring.summary.points', { points: fmt(node.pointsPerUnit) })}${node.unit ? `/${node.unit}` : ''}${range}`
    }
    case 'select':
      return t('scoring.summary.options', Array.isArray(node.options) ? node.options.length : 0)
    case 'group':
      return t(
        `scoring.summary.${node.aggregate === 'max' ? 'max' : node.aggregate === 'min' ? 'min' : 'sum'}`,
      )
  }
}

function badges(node: ScoringNode): string[] {
  const list: string[] = []
  if ('required' in node && node.required) list.push(t('scoring.badge.required'))
  if (node.type === 'group') {
    const s = node.selection
    if (s && (s.min !== undefined || s.max !== undefined)) {
      list.push(
        s.min === s.max
          ? `=${s.min}`
          : s.min !== undefined && s.max !== undefined
            ? `${s.min}–${s.max}`
            : s.max !== undefined
              ? `≤${s.max}`
              : `≥${s.min}`,
      )
    }
    const c = node.clamp
    if (c && (c.min !== undefined || c.max !== undefined))
      list.push(`[${c.min ?? '−∞'},${c.max ?? '∞'}]`)
  }
  return list
}

function explanationMap(explanation: Explanation | undefined) {
  const map = new Map<string, Explanation>()
  const walk = (e: Explanation) => {
    map.set(e.id, e)
    e.children?.forEach(walk)
  }
  if (explanation) walk(explanation)
  return map
}

/** Assigns validation issues to the deepest node whose path prefixes the issue's path. */
export function issuesByNode(def: Draft, issues: Issue[]) {
  const list = entries(def)
  const map = new Map<string, string[]>()
  const general: Issue[] = []
  for (const issue of issues) {
    const owner = list
      .filter((e) => issue.path === e.path || issue.path.startsWith(`${e.path}.`))
      .sort((a, b) => b.path.length - a.path.length)[0]
    // Issues inside a child list belong to the child, not to the group.
    if (owner) map.set(owner.key, [...(map.get(owner.key) ?? []), issue.message])
    else general.push(issue)
  }
  return { map, general }
}

/** Blocks: criteria (controls) on the left, groups to the right of their children, total last. */
export function toDiagram(
  def: Draft,
  options: {
    issues?: Issue[]
    explanation?: Explanation
    positions?: Map<string, { x: number; y: number }>
  } = {},
): { nodes: DiagramNode[]; wires: DiagramWire[] } {
  const list = entries(def)
  const byKey = new Map(list.map((e) => [e.key, e]))
  const byId = new Map<string, Entry>()
  for (const e of list) if (!byId.has(e.node.id)) byId.set(e.node.id, e)
  const errors = issuesByNode(def, options.issues ?? []).map
  const probes = explanationMap(options.explanation)

  const nodes: DiagramNode[] = list.map((e) => {
    const n = e.node
    const isGroup = n.type === 'group'
    const probe = probes.get(n.id)
    return {
      id: e.key,
      x: 0,
      y: 0,
      shape: e.key === '' ? 'indicator' : isGroup ? 'function' : 'control',
      tone: TONE[n.type] ?? 'number',
      glyph: isGroup ? (GLYPH[n.aggregate] ?? '?') : (GLYPH[n.type] ?? '?'),
      title: e.key === '' ? `${t('judging.sheet.total')} · ${n.label ?? ''}` : (n.label ?? n.id),
      subtitle: `${n.id ?? '?'} · ${summary(n)}`,
      inputs: isGroup
        ? [
            ...n.children.map((c, i) => ({ id: `in${i}`, label: c.label ?? c.id })),
            { id: `in${n.children.length}`, label: t('rankings.builder.wireToAdd'), spare: true },
          ]
        : [],
      output: e.key !== '',
      enable: e.key !== '',
      badges: badges(n),
      negated: n.deduction === true,
      inactive: probe ? !probe.active : false,
      probe: probe?.active ? String(probe.points) : undefined,
      errors: errors.get(e.key),
    }
  })

  const wires: DiagramWire[] = []
  for (const e of list) {
    if (e.parent !== null) {
      wires.push({
        id: `data:${e.key}`,
        from: e.key,
        to: e.parent,
        port: `in${e.index}`,
        tone: TONE[e.node.type] ?? 'number',
        thick: e.node.type === 'group',
      })
    }
    for (const ref of new Set(conditionRefs(e.node.condition))) {
      const source = byId.get(ref)
      if (!source) continue
      wires.push({
        id: `cond:${e.key}:${ref}`,
        from: source.key,
        to: e.key,
        port: 'enable',
        tone: 'boolean',
        dashed: true,
        error: errors.get(e.key)?.some((m) => m.startsWith('Circular')),
      })
    }
  }

  // Layout: column = height of the subtree (criteria in column 0), rows in tree order.
  const height = new Map<string, number>()
  const h = (key: string): number => {
    const node = byKey.get(key)!.node
    const value =
      node.type === 'group'
        ? 1 + Math.max(0, ...node.children.map((_, i) => h(key === '' ? `${i}` : `${key}.${i}`)))
        : 0
    height.set(key, value)
    return value
  }
  h('')
  const columns: string[][] = []
  for (const e of list) {
    if (e.node.type !== 'group') (columns[0] ??= []).push(e.key)
  }
  const sizes = new Map(nodes.map((n) => [n.id, nodeHeight(n)]))
  // Groups are centred on their children, which are placed first (deeper columns later).
  let positions = gridLayout(columns, sizes)
  const maxCol = height.get('') ?? 1
  for (let c = 1; c <= maxCol; c++) {
    const ids = list
      .filter((e) => e.node.type === 'group' && height.get(e.key) === c)
      .map((e) => e.key)
    const centres = new Map<string, number>()
    for (const id of ids) {
      const group = byKey.get(id)!.node as Group
      const ys = group.children.map((_, i) => {
        const k = id === '' ? `${i}` : `${id}.${i}`
        const p = positions.get(k)
        return p ? p.y + (sizes.get(k) ?? 0) / 2 : 0
      })
      centres.set(id, ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0)
    }
    ids.sort((a, b) => centres.get(a)! - centres.get(b)!)
    columns[c] = ids
    positions = new Map([
      ...positions,
      ...gridLayout(
        columns.map((col, i) => (i === c ? col : [])),
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

/** Applies a wire drawn on the canvas. Returns the new definition or an error message. */
export function connect(def: Draft, from: string, to: string, port: string): Draft | string {
  if (port === 'enable') {
    const result = connectCondition(def, to, from)
    return result ?? t('scoring.wire.notConditional')
  }
  const index = Number(port.replace('in', ''))
  if (from === '') return t('scoring.wire.total')
  if (isWithin(to, from)) return t('scoring.wire.itself')
  return moveNode(def, from, to, index)?.def ?? t('scoring.wire.impossible')
}
