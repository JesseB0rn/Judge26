import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  EXAMPLE_RANKING_CONFIG,
  validateRankingConfig,
  type CalcOp,
  type Calculation,
} from '@judge26/ranking-engine'
import {
  addCalculation,
  addRound,
  asDraft,
  connect,
  disconnect,
  isBuildable,
  moveKey,
  opPatch,
  removeBlock,
  toDiagram,
  updateCalculation,
  updateRound,
  type Draft,
} from '../builder'

/** The fixtures' text-authored shape (packages/ranking-engine/tests/helpers.ts). */
function textAuthored(rounds: string[], calculations: Calculation[], result: string) {
  return {
    schemaVersion: 1,
    rounds: rounds.map((key) => ({ key })),
    calculations,
    ranking: { keys: [{ source: { calc: result }, field: 'points', order: 'desc' }] },
  }
}
const calc = (id: string, op: CalcOp, operands: string[], extra: Partial<Calculation> = {}) => ({
  id,
  label: id,
  op,
  operands: operands.map((o) => (o.startsWith('R') ? { round: o } : { calc: o })),
  ...extra,
})

/** Builds a configuration as a user does: palette blocks, inspector fields and wires. */
function build(
  roundCount: number,
  calcs: { id: string; op: CalcOp; inputs: string[]; extra?: Record<string, unknown> }[],
  result: string,
) {
  let def: Draft = { schemaVersion: 1, rounds: [], ranking: { keys: [] } }
  for (let i = 0; i < roundCount; i++) {
    const added = addRound(def)
    def = updateRound(added.def, i, { label: undefined }) // fixtures have no round labels
  }
  calcs.forEach((c, i) => {
    def = addCalculation(def, c.op).def
    def = updateCalculation(def, i, { id: c.id, label: c.id, ...opPatch({}, c.op), ...c.extra })
  })
  const block = (ref: string) =>
    ref.startsWith('R')
      ? `round:${def.rounds.findIndex((r) => r.key === ref)}`
      : `calc:${def.calculations!.findIndex((c) => c.id === ref)}`
  calcs.forEach((c, i) => {
    c.inputs.forEach((input, j) => {
      def = connect(def, block(input), `calc:${i}`, `in${j}`) as Draft
    })
  })
  return connect(def, block(result), 'ranking', 'in0') as Draft
}

const R = ['R1', 'R2', 'R3']
const byPointsTime = {
  by: [
    { field: 'points', order: 'desc' },
    { field: 'time', order: 'asc' },
  ],
}

describe('visual aggregation builder model', () => {
  it.each([
    [
      'M3-F01 addition',
      3,
      [{ id: 'total', op: 'ADD' as const, inputs: R }],
      'total',
      textAuthored(R, [calc('total', 'ADD', R)], 'total'),
    ],
    [
      'M3-F02 maximum',
      3,
      [{ id: 'best', op: 'MAX' as const, inputs: R }],
      'best',
      textAuthored(R, [calc('best', 'MAX', R)], 'best'),
    ],
    [
      'M3-F03 difference',
      2,
      [{ id: 'diff', op: 'DIFFERENCE' as const, inputs: ['R1', 'R2'] }],
      'diff',
      textAuthored(['R1', 'R2'], [calc('diff', 'DIFFERENCE', ['R1', 'R2'])], 'diff'),
    ],
    [
      'M3-F04 best keeps its time',
      3,
      [{ id: 'best', op: 'BEST_BY' as const, inputs: R, extra: byPointsTime }],
      'best',
      textAuthored(R, [calc('best', 'BEST_BY', R, byPointsTime as Partial<Calculation>)], 'best'),
    ],
    [
      'M3-F05 sum of best two',
      3,
      [{ id: 'best2', op: 'SUM_BEST_N' as const, inputs: R, extra: { n: 2 } }],
      'best2',
      textAuthored(R, [calc('best2', 'SUM_BEST_N', R, { n: 2 })], 'best2'),
    ],
    [
      'M3-F06 nested aggregation',
      4,
      [
        { id: 'groupA', op: 'MAX' as const, inputs: ['R1', 'R2'] },
        { id: 'groupB', op: 'ADD' as const, inputs: ['R3', 'R4'] },
        { id: 'overall', op: 'ADD' as const, inputs: ['groupA', 'groupB'] },
      ],
      'overall',
      textAuthored(
        ['R1', 'R2', 'R3', 'R4'],
        [
          calc('groupA', 'MAX', ['R1', 'R2']),
          calc('groupB', 'ADD', ['R3', 'R4']),
          calc('overall', 'ADD', ['groupA', 'groupB']),
        ],
        'overall',
      ),
    ],
  ])(
    'M3-T15: %s built visually equals the text-authored configuration',
    (_, rounds, calcs, result, expected) => {
      const built = build(rounds, calcs, result)
      expect(canonicalJson(built)).toBe(canonicalJson(expected))
      expect(validateRankingConfig(built).ok).toBe(true)
    },
  )

  it('M3-T16: an existing configuration round-trips unchanged', () => {
    const text = JSON.stringify(EXAMPLE_RANKING_CONFIG, null, 2)
    const def = JSON.parse(text) as Draft
    expect(isBuildable(def)).toBe(true)
    toDiagram(def, { issues: [] })
    expect(JSON.stringify(def, null, 2)).toBe(text)
    expect(JSON.stringify(updateCalculation(def, 0, { label: 'Best round' }), null, 2)).toBe(text)
  })

  it('M3-T17: a circular reference drawn in the builder is reported and blocks saving', () => {
    let def = asDraft(EXAMPLE_RANKING_CONFIG)
    // total → best and best → total
    def = connect(def, 'calc:0', 'calc:1', 'in3') as Draft
    def = connect(def, 'calc:1', 'calc:0', 'in3') as Draft
    const result = validateRankingConfig(def)
    expect(result.ok).toBe(false)
    const issues = result.ok ? [] : result.issues
    expect(issues.map((i) => i.code)).toContain('circular_reference')
    const { nodes, wires } = toDiagram(def, { issues })
    expect(nodes.filter((n) => n.errors?.some((e) => e.startsWith('Circular')))).toHaveLength(1)
    expect(wires.some((w) => w.error)).toBe(true)
  })

  it('lays out rounds, then calculations right of their inputs, then the ranking', () => {
    const { nodes, wires } = toDiagram(asDraft(EXAMPLE_RANKING_CONFIG))
    const x = (id: string) => nodes.find((n) => n.id === id)!.x
    expect(x('round:0')).toBeLessThan(x('calc:0'))
    expect(x('calc:0')).toBeLessThan(x('ranking'))
    const ranking = nodes.find((n) => n.id === 'ranking')!
    expect(ranking.inputs.map((p) => p.label)).toEqual([
      '1. Best · points ↓',
      '2. Time of best · time ↑',
      '3. Total · points ↓',
      '+ tie-breaker',
    ])
    expect(wires.filter((w) => w.to === 'ranking')).toHaveLength(3)
  })

  it('a wire into an occupied terminal replaces it, into the spare one adds it', () => {
    const def = asDraft(EXAMPLE_RANKING_CONFIG)
    const replaced = connect(def, 'round:0', 'ranking', 'in2') as Draft
    expect(replaced.ranking.keys[2]!.source).toEqual({ round: 'R1' })
    const added = connect(def, 'round:0', 'ranking', 'in3') as Draft
    expect(added.ranking.keys).toHaveLength(4)
    expect(connect(def, 'round:0', 'round:1', 'in0')).toMatch(/Rounds have no inputs/)
  })

  it('deleting wires and blocks removes the references', () => {
    let def = asDraft(EXAMPLE_RANKING_CONFIG)
    def = disconnect(def, 'op:1:2')
    expect(def.calculations![1]!.operands).toEqual([{ round: 'R1' }, { round: 'R2' }])
    def = removeBlock(def, 'round:0')
    expect(def.calculations![0]!.operands).toEqual([{ round: 'R2' }, { round: 'R3' }])
    def = removeBlock(def, 'calc:0')
    expect(def.ranking.keys.map((k) => k.label)).toEqual(['Total'])
  })

  it('renaming a round key or calculation id updates its references', () => {
    let def = updateRound(asDraft(EXAMPLE_RANKING_CONFIG), 0, { key: 'Q1' })
    expect(def.calculations![0]!.operands[0]).toEqual({ round: 'Q1' })
    def = updateCalculation(def, 0, { id: 'top' })
    expect(def.ranking.keys[0]!.source).toEqual({ calc: 'top' })
  })

  it('reorders tie-breakers and drops options the new operator does not use', () => {
    const def = moveKey(asDraft(EXAMPLE_RANKING_CONFIG), 2, 1)
    expect(def.ranking.keys.map((k) => k.label)).toEqual(['Best', 'Total', 'Time of best'])
    expect(opPatch({ op: 'BEST_BY', by: [{ field: 'time', order: 'asc' }] }, 'ADD')).toEqual({
      op: 'ADD',
      by: undefined,
      n: undefined,
    })
    expect(opPatch({}, 'SUM_BEST_N').n).toBe(1)
  })
})
