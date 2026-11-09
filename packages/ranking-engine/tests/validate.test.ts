import { describe, expect, it } from 'vitest'
import {
  compileRankingConfig,
  EXAMPLE_RANKING_CONFIG,
  defaultRankingConfig,
  RankingConfigError,
  validateRankingConfig,
  rank,
} from '../src'
import { team } from './helpers'

const base = {
  schemaVersion: 1,
  rounds: [{ key: 'R1' }, { key: 'R2' }],
  ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc' }] },
}
const issuesOf = (config: unknown) => {
  const result = validateRankingConfig(config)
  return result.ok ? [] : result.issues.map((i) => `${i.code} @ ${i.path}`)
}

describe('validateRankingConfig', () => {
  it('accepts the example and generated default configurations', () => {
    expect(validateRankingConfig(EXAMPLE_RANKING_CONFIG).ok).toBe(true)
    expect(
      validateRankingConfig(defaultRankingConfig([{ key: 'R1', label: 'Round 1' }, { key: 'R2' }]))
        .ok,
    ).toBe(true)
  })

  it('validates the document structure', () => {
    expect(issuesOf('x')).toEqual(['invalid_type @ $'])
    expect(
      issuesOf({ schemaVersion: 2, precision: 9, timeResolutionMs: 0, rounds: [], extra: true }),
    ).toEqual([
      'unknown_property @ $.extra',
      'unsupported_schema @ $.schemaVersion',
      'invalid_precision @ $.precision',
      'invalid_type @ $.timeResolutionMs',
      'required @ $.rounds',
      'required @ $.ranking',
    ])
  })

  it('validates rounds and attempt aggregations', () => {
    expect(
      issuesOf({
        ...base,
        rounds: [
          'x',
          { key: '1bad' },
          { key: 'R1', label: '' },
          { key: 'R1' },
          { key: 'R2', attempts: 'best' },
          { key: 'R3', attempts: { op: 'DIFFERENCE' } },
          { key: 'R4', attempts: { op: 'ADD', by: [], n: 2, x: 1 } },
          { key: 'R5', attempts: { op: 'SUM_BEST_N' } },
          { key: 'R6', attempts: { op: 'NOPE' } },
          { key: 'R7', attempts: { op: 'BEST_BY', by: [{ field: 'speed', order: 'up' }, 'x'] } },
        ],
      }),
    ).toEqual([
      'invalid_type @ $.rounds[0]',
      'invalid_id @ $.rounds[1].key',
      'invalid_type @ $.rounds[2].label',
      'duplicate_id @ $.rounds[3].key',
      'invalid_type @ $.rounds[4].attempts',
      'not_allowed @ $.rounds[5].attempts.op',
      'unknown_property @ $.rounds[6].attempts.x',
      'not_allowed @ $.rounds[6].attempts.by',
      'not_allowed @ $.rounds[6].attempts.n',
      'required @ $.rounds[7].attempts.n',
      'invalid_type @ $.rounds[8].attempts.op',
      'invalid_type @ $.rounds[9].attempts.by[0].field',
      'invalid_type @ $.rounds[9].attempts.by[0].order',
      'invalid_type @ $.rounds[9].attempts.by[1]',
    ])
  })

  it('validates calculations and references', () => {
    expect(
      issuesOf({
        ...base,
        calculations: [
          5,
          { id: 'R1', label: 'clash', op: 'ADD', operands: [{ round: 'R1' }] },
          { id: 'a', op: 'ADD', operands: [] },
          { id: 'b', label: 'B', op: 'DIFFERENCE', operands: [{ round: 'R1' }] },
          {
            id: 'c',
            label: 'C',
            op: 'SUM_BEST_N',
            n: 3,
            operands: [{ round: 'R1' }, { round: 'R2' }],
          },
          {
            id: 'd',
            label: 'D',
            op: 'MAX',
            operands: [{ round: 'R9' }, { calc: 'zz' }, { round: 'R1', calc: 'a' }, 'x'],
          },
        ],
      }),
    ).toEqual([
      'invalid_type @ $.calculations[0]',
      'duplicate_id @ $.calculations[1].id',
      'required @ $.calculations[2].label',
      'required @ $.calculations[2].operands',
      'invalid_operands @ $.calculations[3].operands',
      'invalid_range @ $.calculations[4].n',
      'unknown_reference @ $.calculations[5].operands[0].round',
      'unknown_reference @ $.calculations[5].operands[1].calc',
      'invalid_operand @ $.calculations[5].operands[2]',
      'invalid_operand @ $.calculations[5].operands[3]',
    ])
    expect(issuesOf({ ...base, calculations: 'none' })).toEqual(['invalid_type @ $.calculations'])
  })

  it('prevents circular calculation dependencies', () => {
    const result = validateRankingConfig({
      ...base,
      calculations: [
        { id: 'a', label: 'A', op: 'ADD', operands: [{ calc: 'b' }] },
        { id: 'b', label: 'B', op: 'ADD', operands: [{ round: 'R1' }, { calc: 'c' }] },
        { id: 'c', label: 'C', op: 'MAX', operands: [{ calc: 'a' }] },
      ],
    })
    expect(!result.ok && result.issues).toEqual([
      {
        code: 'circular_reference',
        path: '$.calculations[0].operands',
        message: 'Circular calculation: a → b → c → a.',
      },
    ])
    expect(
      issuesOf({
        ...base,
        calculations: [{ id: 's', label: 'S', op: 'ADD', operands: [{ calc: 's' }] }],
      }),
    ).toEqual(['circular_reference @ $.calculations[0].operands'])
  })

  it('validates policies and ranking keys', () => {
    expect(
      issuesOf({
        ...base,
        policies: { missing: 'ignore', disqualified: 'unranked', absent: 'zero', other: 1 },
        ranking: {
          keys: [{ source: { calc: 'nope' }, field: 'speed', order: 'up', label: '' }, 3],
          ties: 'random',
          extra: 1,
        },
      }),
    ).toEqual([
      'unknown_property @ $.policies.other',
      'invalid_type @ $.policies.missing',
      'invalid_type @ $.policies.disqualified',
      'unknown_property @ $.ranking.extra',
      'unknown_reference @ $.ranking.keys[0].source.calc',
      'invalid_type @ $.ranking.keys[0].field',
      'invalid_type @ $.ranking.keys[0].order',
      'invalid_type @ $.ranking.keys[0].label',
      'invalid_type @ $.ranking.keys[1]',
      'invalid_type @ $.ranking.ties',
    ])
    expect(issuesOf({ ...base, policies: 'strict' })).toEqual(['invalid_type @ $.policies'])
    expect(issuesOf({ ...base, ranking: { keys: [] } })).toEqual(['required @ $.ranking.keys'])
  })

  it('compileRankingConfig throws with all issues', () => {
    expect(() => compileRankingConfig({})).toThrow(RankingConfigError)
    expect(() => compileRankingConfig({})).toThrow(/schemaVersion/)
  })

  it('M3-T13 groundwork: compiled configurations are isolated from later changes', () => {
    const config = structuredClone(base)
    const compiled = compileRankingConfig(config)
    config.ranking.keys[0]!.order = 'asc'
    const ranking = rank(compiled, [team('a', { R1: 1 }), team('b', { R1: 2 })])
    expect(ranking.entries[0]!.team).toBe('b')
    expect(Object.isFrozen(compiled.config.ranking)).toBe(true)
  })
})
