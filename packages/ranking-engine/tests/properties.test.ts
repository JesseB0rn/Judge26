import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { compileRankingConfig, EXAMPLE_RANKING_CONFIG, rank, type TeamInput } from '../src'

// Property-based tests (ROADMAP §10: critical calculations).

const roundResult = fc.oneof(
  fc.record({
    status: fc.constant('completed' as const),
    points: fc.integer({ min: 0, max: 300 }),
    timeMs: fc.option(fc.integer({ min: 0, max: 180_000 }), { nil: undefined }),
  }),
  fc.record({ status: fc.constantFrom('disqualified' as const, 'absent' as const) }),
)

const teamsArb = fc
  .uniqueArray(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      name: fc.string({ maxLength: 6 }),
      r1: fc.option(roundResult, { nil: undefined }),
      r2: fc.option(roundResult, { nil: undefined }),
      r3: fc.option(roundResult, { nil: undefined }),
    }),
    { selector: (t) => t.id, maxLength: 15 },
  )
  .map((list) =>
    list.map((t): TeamInput => ({
      id: t.id,
      name: t.name,
      games: (['r1', 'r2', 'r3'] as const).flatMap((k) =>
        t[k] ? [{ round: k.toUpperCase(), ...t[k]! }] : [],
      ),
    })),
  )

const cfg = compileRankingConfig(EXAMPLE_RANKING_CONFIG)

describe('ranking properties', () => {
  it('is deterministic and independent of input order', () => {
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const a = rank(cfg, teams)
        const b = rank(cfg, [...teams].reverse())
        expect(b).toEqual(a)
      }),
    )
  })

  it('ranks are non-decreasing; shared ranks have identical key values', () => {
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const ranked = rank(cfg, teams).entries.filter((e) => e.rank !== null)
        ranked.forEach((entry, i) => {
          if (i === 0) return expect(entry.rank).toBe(1)
          const prev = ranked[i - 1]!
          expect(entry.rank!).toBeGreaterThanOrEqual(prev.rank!)
          if (entry.rank === prev.rank) expect(entry.values).toEqual(prev.values)
          else expect(entry.rank).toBe(i + 1) // competition ranking: 1, 2, 2, 4
        })
      }),
    )
  })

  it('BEST_BY keeps the selected round’s own points and time (M3-11)', () => {
    fc.assert(
      fc.property(teamsArb, (teams) => {
        for (const entry of rank(cfg, teams).entries) {
          const best = entry.results.best!
          if (best.status !== 'ok') continue
          const selected = entry.results[best.selected!]!
          expect([best.points, best.timeMs]).toEqual([selected.points, selected.timeMs])
        }
      }),
    )
  })

  it('every team appears exactly once', () => {
    fc.assert(
      fc.property(teamsArb, (teams) => {
        const ids = rank(cfg, teams).entries.map((e) => e.team)
        expect(ids.sort()).toEqual(teams.map((t) => t.id).sort())
      }),
    )
  })
})
