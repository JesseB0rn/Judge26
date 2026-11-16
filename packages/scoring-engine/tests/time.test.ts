import { describe, expect, it } from 'vitest'
import {
  countedTimeMs,
  DEFAULT_ZERO_POINTS_TIME_MS,
  usesZeroPointsTime,
  validateRuleset,
} from '../src'

const definition = (extra: object) => ({
  schemaVersion: 1,
  ...extra,
  root: {
    id: 'root',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'a', label: 'A', type: 'boolean', points: 10 }],
  },
})

// M10-18: time counted for a run with zero points.
describe('zero-point time', () => {
  it('M10-T27/T28: a zero-point run counts with the ruleset’s time, others with the measured one', () => {
    const on = { zeroPointsTimeMs: DEFAULT_ZERO_POINTS_TIME_MS }
    expect(DEFAULT_ZERO_POINTS_TIME_MS).toBe(120_000)
    expect(countedTimeMs(on, 0, 43_000)).toBe(120_000)
    expect(countedTimeMs(on, 0, 0)).toBe(120_000)
    expect(countedTimeMs(on, 5, 43_000)).toBe(43_000)
    expect(countedTimeMs(on, null, 43_000)).toBe(43_000)
    // Off (no option, e.g. every ruleset written before M10): the measured time counts.
    expect(countedTimeMs({}, 0, 43_000)).toBe(43_000)
    expect(countedTimeMs(null, 0, 43_000)).toBe(43_000)
    expect(usesZeroPointsTime(on, 0)).toBe(true)
    expect(usesZeroPointsTime(on, 1)).toBe(false)
  })

  it('validates the option', () => {
    expect(validateRuleset(definition({ zeroPointsTimeMs: 90_000 })).ok).toBe(true)
    for (const bad of [-1, 1.5, 3_600_001, '120']) {
      const result = validateRuleset(definition({ zeroPointsTimeMs: bad }))
      expect(result.ok ? [] : result.issues.map((i) => i.code)).toContain(
        'invalid_zero_points_time',
      )
    }
  })
})
