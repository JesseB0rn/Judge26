import { describe, expect, it } from 'vitest'
import { canonicalJson, EXAMPLE_RULESET, validateRuleset } from '@judge26/scoring-engine'
import {
  addNode,
  connect,
  connectCondition,
  disconnectCondition,
  entries,
  flattenCondition,
  isBuildable,
  moveNode,
  nodeAt,
  removeNode,
  toDiagram,
  unflattenCondition,
  updateNode,
  type Draft,
  type NodeType,
} from '../builder'

const example = () => JSON.parse(JSON.stringify(EXAMPLE_RULESET)) as Draft
const ids = (def: Draft) => entries(def).map((e) => e.node.id)

/** Adds a block to `parent` and sets its properties, as a user would in palette + inspector. */
function block(
  def: Draft,
  parent: string,
  type: NodeType,
  props: Record<string, unknown>,
  aggregate?: 'sum' | 'max' | 'min',
) {
  const added = addNode(def, type, parent, aggregate)
  let next = added.def
  // New blocks come with defaults; replace them entirely by the wanted properties.
  const current = nodeAt(next, added.key) as unknown as Record<string, unknown>
  const cleared = Object.fromEntries(
    Object.keys(current)
      .filter((k) => k !== 'type' && k !== 'children' && !(k in props))
      .map((k) => [k, undefined]),
  )
  next = updateNode(next, added.key, { ...cleared, ...props })
  return { def: next, key: added.key }
}

describe('visual rule builder model', () => {
  it('M2-T13: building the example ruleset yields the JSON-authored definition', () => {
    let def: Draft = {
      schemaVersion: 1,
      precision: 0,
      root: {
        id: 'total',
        label: 'Total score',
        type: 'group',
        aggregate: 'sum',
        clamp: { min: 0 },
        children: [],
      },
    }
    const src = EXAMPLE_RULESET.root.children
    const strip = (n: object) =>
      Object.fromEntries(
        Object.entries(n).filter(([k]) => k !== 'children' && k !== 'type' && k !== 'condition'),
      )

    // Groups: each starts with a placeholder task that is removed once real children exist.
    for (const [i, group] of src.entries()) {
      if (group.type !== 'group') throw new Error('fixture')
      const g = block(def, '', 'group', strip(group), group.aggregate)
      def = g.def
      for (const child of group.children) {
        if (child.type === 'group') {
          const sub = block(def, g.key, 'group', strip(child), child.aggregate)
          def = sub.def
          for (const leaf of child.children) def = block(def, sub.key, leaf.type, strip(leaf)).def
          def = removeNode(def, `${sub.key}.0`)
        } else {
          def = block(def, g.key, child.type, strip(child)).def
        }
      }
      def = removeNode(def, `${i}.0`)
    }
    // The tower bonus condition is drawn as a wire into the bonus block's enable terminal.
    const tower = entries(def).find((e) => e.node.id === 'tower')!.key
    const bonus = entries(def).find((e) => e.node.id === 'bonus')!.key
    const wired = connect(def, tower, bonus, 'enable')
    expect(typeof wired).toBe('object')
    def = wired as Draft
    expect(nodeAt(def, bonus)?.condition).toEqual({ ref: 'tower', op: 'eq', value: 'three' })

    expect(canonicalJson(def)).toBe(canonicalJson(EXAMPLE_RULESET))
    expect(validateRuleset(def).ok).toBe(true)
  })

  it('M2-T14: an existing ruleset round-trips through the builder unchanged', () => {
    const text = JSON.stringify(EXAMPLE_RULESET, null, 2)
    const def = JSON.parse(text) as Draft
    expect(isBuildable(def)).toBe(true)
    // Rendering the diagram does not touch the definition.
    toDiagram(def, { issues: [] })
    expect(JSON.stringify(def, null, 2)).toBe(text)
    // A no-op edit keeps it byte for byte.
    const same = updateNode(def, '0', { label: 'Missions' })
    expect(JSON.stringify(same, null, 2)).toBe(text)
  })

  it('M2-T15: a circular condition drawn in the builder is reported on the block', () => {
    let def = example()
    const keyOf = (id: string) => entries(def).find((e) => e.node.id === id)!.key
    // bonus depends on tower; making tower depend on bonus closes the loop.
    def = connect(def, keyOf('bonus'), keyOf('tower'), 'enable') as Draft
    const result = validateRuleset(def)
    expect(result.ok).toBe(false)
    const issues = result.ok ? [] : result.issues
    expect(issues.map((i) => i.code)).toContain('circular_reference')
    const diagram = toDiagram(def, { issues })
    const flagged = diagram.nodes.filter((n) => n.errors?.some((e) => e.startsWith('Circular')))
    expect(flagged.length).toBe(1)
    expect(diagram.wires.some((w) => w.port === 'enable' && w.error)).toBe(true)
  })

  it('maps the tree onto blocks and wires, criteria left of their groups', () => {
    const { nodes, wires } = toDiagram(example())
    const root = nodes.find((n) => n.id === '')!
    const flag = nodes.find((n) => n.title === 'Flag raised')!
    const missions = nodes.find((n) => n.title === 'Missions')!
    expect(root.shape).toBe('indicator')
    expect(missions.shape).toBe('function')
    expect(flag.shape).toBe('control')
    expect(flag.x).toBeLessThan(missions.x)
    expect(missions.x).toBeLessThan(root.x)
    // Group inputs: one per child plus a spare terminal.
    expect(missions.inputs).toHaveLength(6)
    expect(missions.inputs[missions.inputs.length - 1]!.spare).toBe(true)
    expect(wires.filter((w) => w.port === 'enable')).toHaveLength(1)
    expect(nodes.find((n) => n.title === 'Penalties')!.negated).toBe(true)
  })

  it('rewires a block into another group at the chosen terminal', () => {
    const def = example()
    // flag (0.0) into bestAttempt (1) at its first terminal
    const moved = connect(def, '0.0', '1', 'in0') as Draft
    expect(ids(moved).slice(0, 4)).toEqual(['total', 'missions', 'blocks', 'parking'])
    expect(
      (nodeAt(moved, '1') as { children: { id: string }[] }).children.map((c) => c.id),
    ).toEqual(['flag', 'runA', 'runB'])
    // Reordering inside the same group.
    const reordered = moveNode(def, '0.0', '0', 3)!.def
    expect(
      (nodeAt(reordered, '0') as { children: { id: string }[] }).children.map((c) => c.id),
    ).toEqual(['blocks', 'parking', 'flag', 'tower', 'bonus'])
  })

  it('refuses wires that would put a group inside itself', () => {
    expect(connect(example(), '0', '0.2', 'in0')).toMatch(/itself/)
    expect(connect(example(), '', '0', 'in0')).toMatch(/total/)
  })

  it('removing a block removes conditions that referenced it', () => {
    const def = removeNode(example(), '0.3') // tower
    expect(ids(def)).not.toContain('tower')
    expect(entries(def).find((e) => e.node.id === 'bonus')!.node.condition).toBeUndefined()
  })

  it('renaming an id renames condition references', () => {
    const def = updateNode(example(), '0.3', { id: 'towerLevel' })
    expect(entries(def).find((e) => e.node.id === 'bonus')!.node.condition).toEqual({
      ref: 'towerLevel',
      op: 'eq',
      value: 'three',
    })
  })

  it('adds and removes condition clauses', () => {
    let def = example()
    def = connectCondition(def, '0.4', '0.0')! // bonus also needs the flag
    expect(nodeAt(def, '0.4')?.condition).toEqual({
      all: [
        { ref: 'tower', op: 'eq', value: 'three' },
        { ref: 'flag', op: 'eq', value: true },
      ],
    })
    def = disconnectCondition(def, '0.4', 'tower')
    expect(nodeAt(def, '0.4')?.condition).toEqual({ ref: 'flag', op: 'eq', value: true })
  })

  it('flattens simple conditions for the inspector and keeps complex ones as JSON', () => {
    const flat = flattenCondition({
      any: [{ ref: 'a', op: 'set' }, { not: { ref: 'b', op: 'eq', value: true } }],
    })
    expect(flat).toEqual({
      join: 'any',
      clauses: [
        { negated: false, ref: 'a', op: 'set' },
        { negated: true, ref: 'b', op: 'eq', value: true },
      ],
    })
    expect(unflattenCondition(flat!)).toEqual({
      any: [{ ref: 'a', op: 'set' }, { not: { ref: 'b', op: 'eq', value: true } }],
    })
    expect(flattenCondition({ all: [{ any: [{ ref: 'a', op: 'set' }] }] })).toBeNull()
  })
})
