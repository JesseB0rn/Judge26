import { describe, expect, it } from 'vitest'
import {
  compileRankingConfig,
  EXAMPLE_RANKING_CONFIG,
  explainTeam,
  rank,
  type RankingConfig,
} from '../src'
import { calc, config, team } from './helpers'

const R = ['R1', 'R2', 'R3']
const ranks = (ranking: ReturnType<typeof rank>) => ranking.entries.map((e) => [e.team, e.rank])

describe('M3 ranking test matrix', () => {
  it('M3-T01 / T02 / T03: ADD, MAX and MIN over three rounds', () => {
    const t = team('t', { R1: 50, R2: 80, R3: 30 })
    const cfg = config(
      R,
      [calc('add', 'ADD', R), calc('max', 'MAX', R), calc('min', 'MIN', R)],
      'add',
    )
    const { results } = explainTeam(cfg, t)
    expect([results.add!.points, results.max!.points, results.min!.points]).toEqual([160, 80, 30])
    const addOnly = explainTeam(cfg, team('t', { R1: 50, R2: 30, R3: 20 }))
    expect(addOnly.results.add!.points).toBe(100)
  })

  it('M3-T04: difference respects operand order', () => {
    const cfg = config(
      ['R1', 'R2'],
      [calc('a', 'DIFFERENCE', ['R1', 'R2']), calc('b', 'DIFFERENCE', ['R2', 'R1'])],
      'a',
    )
    const { results } = explainTeam(cfg, team('t', { R1: 80, R2: 30 }))
    expect([results.a!.points, results.b!.points]).toEqual([50, -50])
  })

  it('M3-T05 / T06: best by points; equal points resolved by time', () => {
    const cfg = config(R, [calc('best', 'BEST_BY', R)], 'best')
    expect(
      explainTeam(cfg, team('t', { R1: [70, 50_000], R2: [90, 99_000], R3: [60, 10_000] })).results
        .best!.selected,
    ).toBe('R2')
    expect(
      explainTeam(cfg, team('t', { R1: [90, 60_000], R2: [90, 55_000], R3: [10, 1] })).results
        .best!,
    ).toMatchObject({
      selected: 'R2',
      timeMs: 55_000,
    })
  })

  it('WORST_BY selects the entire worst result', () => {
    const cfg = config(R, [calc('worst', 'WORST_BY', R)], 'worst')
    const r = explainTeam(cfg, team('t', { R1: [90, 60_000], R2: [40, 30_000], R3: [40, 45_000] }))
      .results.worst!
    expect(r).toMatchObject({ selected: 'R3', points: 40, timeMs: 45_000 })
  })

  it('M3-T07: sum of the best two of three', () => {
    const cfg = config(R, [calc('s', 'SUM_BEST_N', R, { n: 2 })], 's')
    expect(explainTeam(cfg, team('t', { R1: 60, R2: 100, R3: 80 })).results.s!.points).toBe(180)
  })

  it('M3-T08: nested expressions (150)', () => {
    const cfg = config(
      ['R1', 'R2', 'R3', 'R4'],
      [
        calc('a', 'MAX', ['R1', 'R2']),
        calc('b', 'ADD', ['R3', 'R4']),
        calc('o', 'ADD', ['a', 'b']),
      ],
      'o',
    )
    expect(explainTeam(cfg, team('t', { R1: 80, R2: 100, R3: 30, R4: 20 })).results.o!.points).toBe(
      150,
    )
  })

  it('M3-T09: two tie-breaking rules are evaluated in order', () => {
    const cfg = compileRankingConfig(EXAMPLE_RANKING_CONFIG)
    const ranking = rank(cfg, [
      team('slow', { R1: [100, 120_000], R2: 50, R3: 50 }),
      team('fast', { R1: [100, 110_000], R2: 10, R3: 10 }),
      team('fastMore', { R1: [100, 110_000], R2: 20, R3: 20 }),
      team('top', { R1: 120 }),
    ])
    expect(ranks(ranking)).toEqual([
      ['top', 1],
      ['fastMore', 2],
      ['fast', 3],
      ['slow', 4],
    ])
    // Best points decided 1→2; total (third key) decided 2→3; time (second key) decided 3→4.
    expect(ranking.entries.map((e) => e.decidedBy)).toEqual([null, 0, 2, 1])
    expect(ranking.keys.map((k) => k.label)).toEqual(['Best', 'Time of best', 'Total'])
  })

  it('M3-T10 / M3-T14: identical results share a rank (competition ranking) or follow the configured fallback', () => {
    const teams = [
      team('b', { R1: 50 }, 'Bravo'),
      team('a', { R1: 50 }, 'Alpha'),
      team('c', { R1: 40 }, 'Charlie'),
      team('d', { R1: 60 }, 'Delta'),
    ]
    const shared = rank(config(['R1'], [calc('t', 'ADD', ['R1'])], 't'), teams)
    expect(ranks(shared)).toEqual([
      ['d', 1],
      ['a', 2],
      ['b', 2],
      ['c', 4],
    ])
    expect(shared.entries.map((e) => e.shared)).toEqual([false, true, true, false])

    const byName = rank(
      config(['R1'], [calc('t', 'ADD', ['R1'])], 't', {
        ranking: {
          keys: [{ source: { calc: 't' }, field: 'points', order: 'desc' }],
          ties: 'name',
        },
      }),
      teams,
    )
    expect(ranks(byName)).toEqual([
      ['d', 1],
      ['a', 2],
      ['b', 3],
      ['c', 4],
    ])
    expect(byName.entries[2]!.decidedBy).toBe('name')
  })

  describe('M3-T11: missing results follow the configured policy', () => {
    const base = (policies: RankingConfig['policies']) =>
      config(R, [calc('total', 'ADD', R), calc('best', 'BEST_BY', R)], 'total', { policies })
    const teams = [team('complete', { R1: 10, R2: 10, R3: 10 }), team('partial', { R1: 50 })]

    it('zero (default): counts as 0 and marks the team provisional', () => {
      const ranking = rank(base(undefined), teams)
      expect(ranks(ranking)).toEqual([
        ['partial', 1],
        ['complete', 2],
      ])
      const partial = ranking.entries[0]!
      expect(partial.provisional).toBe(true)
      expect(partial.results.R2).toMatchObject({
        status: 'missing',
        points: 0,
        excluded: false,
        formula: 'missing → 0',
      })
      expect(partial.results.total).toMatchObject({ points: 50, incomplete: true })
    })

    it('exclude: ignored by aggregations', () => {
      const ranking = rank(base({ missing: 'exclude' }), teams)
      expect(ranking.entries.find((e) => e.team === 'partial')!.results.R2).toMatchObject({
        points: null,
        excluded: true,
      })
    })

    it('unranked: incomplete teams are listed without a rank', () => {
      const ranking = rank(base({ missing: 'unranked' }), teams)
      expect(ranks(ranking)).toEqual([
        ['complete', 1],
        ['partial', null],
      ])
    })
  })

  it('distinguishes missing, disqualified, absent and zero-point results', () => {
    const cfg = config(
      ['R1', 'R2', 'R3', 'R4'],
      [calc('t', 'ADD', ['R1', 'R2', 'R3', 'R4'])],
      't',
      {
        policies: { disqualified: 'exclude', absent: 'zero' },
      },
    )
    const { results } = explainTeam(cfg, team('t', { R1: 0, R2: 'dq', R3: 'absent' }))
    expect(['R1', 'R2', 'R3', 'R4'].map((r) => [results[r]!.status, results[r]!.points])).toEqual([
      ['ok', 0],
      ['disqualified', null],
      ['absent', 0],
      ['missing', 0],
    ])
  })

  it('M3-T12: a changed round result changes the overall ranking', () => {
    const cfg = config(R, [calc('total', 'ADD', R)], 'total')
    const before = rank(cfg, [team('a', { R1: 50, R2: 50 }), team('b', { R1: 40, R2: 50 })])
    const after = rank(cfg, [team('a', { R1: 50, R2: 50 }), team('b', { R1: 40, R2: 70 })])
    expect(ranks(before)[0]).toEqual(['a', 1])
    expect(ranks(after)[0]).toEqual(['b', 1])
  })

  it('teams without any result are unranked', () => {
    const cfg = config(R, [calc('best', 'MAX', R)], 'best', { policies: { missing: 'exclude' } })
    expect(ranks(rank(cfg, [team('none', {}), team('one', { R1: 1 })]))).toEqual([
      ['one', 1],
      ['none', null],
    ])
  })
})

describe('rounds with several attempts', () => {
  it('uses the best attempt by default and keeps its time', () => {
    const cfg = config(['R1'], [calc('t', 'ADD', ['R1'])], 't')
    const t = team('t', {
      R1: [
        { round: 'R1', attempt: 1, status: 'completed', points: 80, timeMs: 50_000 },
        { round: 'R1', attempt: 2, status: 'completed', points: 80, timeMs: 40_000 },
      ],
    })
    expect(explainTeam(cfg, t).results.R1).toMatchObject({
      points: 80,
      timeMs: 40_000,
      selected: 'R1#2',
    })
  })

  it('supports other attempt aggregations', () => {
    const cfg = compileRankingConfig({
      schemaVersion: 1,
      rounds: [{ key: 'R1', attempts: { op: 'ADD' } }],
      ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc' }] },
    })
    const t = team('t', {
      R1: [
        { round: 'R1', attempt: 1, status: 'completed', points: 10 },
        { round: 'R1', attempt: 2, status: 'disqualified' },
        { round: 'R1', attempt: 3, status: 'completed', points: 5 },
      ],
    })
    expect(explainTeam(cfg, t).results.R1).toMatchObject({
      points: 15,
      formula: 'ADD(10, 0, 5) = 15',
    })
  })
})

describe('arithmetic', () => {
  it('sums times only when every result has one, truncated to the resolution', () => {
    const cfg = config(['R1', 'R2'], [calc('t', 'ADD', ['R1', 'R2'])], 't', {
      timeResolutionMs: 10,
    })
    expect(explainTeam(cfg, team('t', { R1: [1, 12_345], R2: [1, 1_009] })).results.t!.timeMs).toBe(
      13_340,
    )
    expect(explainTeam(cfg, team('t', { R1: [1, 12_345], R2: 1 })).results.t!.timeMs).toBeNull()
  })

  it('computes decimal points exactly at the configured precision', () => {
    const cfg = config(['R1', 'R2'], [calc('t', 'ADD', ['R1', 'R2'])], 't', { precision: 2 })
    expect(explainTeam(cfg, team('t', { R1: 0.1, R2: 0.2 })).results.t!.points).toBe(0.3)
  })

  it('excluded operands make DIFFERENCE excluded; all excluded gives no result', () => {
    const cfg = config(
      ['R1', 'R2'],
      [calc('d', 'DIFFERENCE', ['R1', 'R2']), calc('m', 'MAX', ['R1', 'R2'])],
      'd',
      {
        policies: { missing: 'exclude' },
      },
    )
    const { results } = explainTeam(cfg, team('t', { R1: 5 }))
    expect(results.d).toMatchObject({
      status: 'excluded',
      points: null,
      formula: 'DIFFERENCE: both operands are required',
    })
    expect(explainTeam(cfg, team('t', {})).results.m).toMatchObject({
      status: 'excluded',
      formula: 'MAX: no results',
    })
  })

  it('ranks by time ascending with missing times last', () => {
    const cfg = compileRankingConfig({
      schemaVersion: 1,
      rounds: [{ key: 'R1' }],
      ranking: { keys: [{ source: { round: 'R1' }, field: 'time', order: 'asc', label: 'Time' }] },
    })
    const ranking = rank(cfg, [
      team('slow', { R1: [1, 9_000] }),
      team('fast', { R1: [1, 5_000] }),
      team('none', { R1: 1 }),
    ])
    expect(ranks(ranking)).toEqual([
      ['fast', 1],
      ['slow', 2],
      ['none', null],
    ])
    expect(ranking.entries[0]!.values).toEqual([5_000])
  })
})

describe('input validation', () => {
  it('reports and ignores invalid games', () => {
    const cfg = config(['R1'], [calc('t', 'ADD', ['R1'])], 't')
    const ranking = rank(cfg, [
      {
        id: 'x',
        name: 'X',
        games: [
          { round: 'R9', status: 'completed', points: 1 },
          { round: 'R1', attempt: 0, status: 'completed', points: 1 },
          { round: 'R1', status: 'won' as never, points: 1 },
          { round: 'R1', status: 'completed' },
          { round: 'R1', status: 'completed', points: 1, timeMs: -5 },
          { round: 'R1', status: 'completed', points: 7 },
          { round: 'R1', status: 'completed', points: 9 },
        ],
      },
    ])
    expect(ranking.issues.map((i) => i.code)).toEqual([
      'unknown_round',
      'invalid_attempt',
      'invalid_status',
      'missing_points',
      'invalid_time',
      'duplicate_attempt',
    ])
    expect(ranking.entries[0]!.values).toEqual([7])
  })
})
