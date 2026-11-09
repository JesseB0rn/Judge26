import { describe, expect, it } from 'vitest'
import { explainTeam } from '../src'
import { calc, config, team } from './helpers'

const R = ['R1', 'R2', 'R3']
const result = (cfg: ReturnType<typeof config>, t: ReturnType<typeof team>, id: string) =>
  explainTeam(cfg, t).results[id]!

// Mandatory ranking fixtures from ROADMAP §5.
describe('M3 mandatory fixtures', () => {
  it('M3-F01: addition (50 + 30 + 20 = 100)', () => {
    const cfg = config(R, [calc('total', 'ADD', R)], 'total')
    expect(result(cfg, team('t', { R1: 50, R2: 30, R3: 20 }), 'total').points).toBe(100)
  })

  it('M3-F02: maximum (80)', () => {
    const cfg = config(R, [calc('best', 'MAX', R)], 'best')
    expect(result(cfg, team('t', { R1: 50, R2: 80, R3: 30 }), 'best').points).toBe(80)
  })

  it('M3-F03: difference R1 − R2 (80 − 30 = 50)', () => {
    const cfg = config(['R1', 'R2'], [calc('diff', 'DIFFERENCE', ['R1', 'R2'])], 'diff')
    const r = result(cfg, team('t', { R1: 80, R2: 30 }), 'diff')
    expect(r.points).toBe(50)
    expect(r.formula).toBe('R1 − R2 = 80 − 30 = 50')
  })

  it('M3-F04: best result keeps its associated time (100 pts / 110 s)', () => {
    const cfg = config(
      R,
      [
        calc('best', 'BEST_BY', R, {
          by: [
            { field: 'points', order: 'desc' },
            { field: 'time', order: 'asc' },
          ],
        }),
      ],
      'best',
    )
    const r = result(
      cfg,
      team('t', { R1: [100, 120_000], R2: [80, 90_000], R3: [100, 110_000] }),
      'best',
    )
    expect(r).toMatchObject({ points: 100, timeMs: 110_000, selected: 'R3' })
    // The time comes from the selected round, not from an independent minimum (90 s in R2).
    expect(r.timeMs).not.toBe(90_000)
  })

  it('M3-F05: sum of the best two rounds (100 + 80 = 180)', () => {
    const cfg = config(R, [calc('best2', 'SUM_BEST_N', R, { n: 2 })], 'best2')
    const r = result(cfg, team('t', { R1: 100, R2: 80, R3: 60 }), 'best2')
    expect(r.points).toBe(180)
    expect(r.formula).toBe('SUM_BEST_N(2; points ↓, time ↑): R1 + R2 = 180')
  })

  it('M3-F06: nested aggregation (MAX(100, 80) + ADD(20, 30) = 150)', () => {
    const cfg = config(
      ['R1', 'R2', 'R3', 'R4'],
      [
        calc('groupA', 'MAX', ['R1', 'R2']),
        calc('groupB', 'ADD', ['R3', 'R4']),
        calc('overall', 'ADD', ['groupA', 'groupB']),
      ],
      'overall',
    )
    const { results } = explainTeam(cfg, team('t', { R1: 100, R2: 80, R3: 20, R4: 30 }))
    expect(results.groupA!.points).toBe(100)
    expect(results.groupB!.points).toBe(50)
    expect(results.overall!.points).toBe(150)
    expect(results.overall!.operands!.map((o) => o.id)).toEqual(['groupA', 'groupB'])
  })
})
