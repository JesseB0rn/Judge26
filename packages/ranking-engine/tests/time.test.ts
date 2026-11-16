import { describe, expect, it } from 'vitest'
import {
  decimalsOfResolution,
  explainTeam,
  formatRunTime,
  rank,
  timeDecimals,
  timeResolutionMs,
  truncateTime,
  withTimeDecimals,
  compileRankingConfig,
  type RankingConfig,
} from '../src'
import { team } from './helpers'

// M10-19 / M10-20: run time precision of an event.
describe('time precision', () => {
  it('M10-T30: formats 95 379 ms at every precision, cut not rounded', () => {
    expect([0, 1, 2, 3].map((d) => formatRunTime(95_379, d))).toEqual([
      '1:35',
      '1:35.3',
      '1:35.37',
      '1:35.379',
    ])
    expect(formatRunTime(59_999, 0)).toBe('0:59')
    expect(formatRunTime(3_600_000, 1)).toBe('60:00.0')
    expect(formatRunTime(null, 2)).toBe('–')
  })

  it('maps decimals to resolutions and back; invalid decimals are whole seconds', () => {
    expect([0, 1, 2, 3].map(timeResolutionMs)).toEqual([1000, 100, 10, 1])
    expect([1000, 100, 10, 1, undefined, 250].map(decimalsOfResolution)).toEqual([0, 1, 2, 3, 3, 3])
    expect([undefined, null, 4, -1, '2', 2].map(timeDecimals)).toEqual([0, 0, 0, 0, 0, 2])
    expect(truncateTime(95_379, 1)).toBe(95_300)
  })

  it('applies the coarser of the configuration’s and the event’s resolution', () => {
    const base: Pick<RankingConfig, 'timeResolutionMs'> = { timeResolutionMs: 10 }
    expect(withTimeDecimals(base, 0).timeResolutionMs).toBe(1000)
    expect(withTimeDecimals(base, 3)).toBe(base)
    expect(withTimeDecimals<Pick<RankingConfig, 'timeResolutionMs'>>({}, 1).timeResolutionMs).toBe(
      100,
    )
  })

  it('M10-T31: equal points, 95.1 s and 95.9 s tie on time at whole seconds, not at tenths', () => {
    const cfg: RankingConfig = {
      schemaVersion: 1,
      rounds: [{ key: 'R1' }],
      ranking: {
        keys: [
          { source: { round: 'R1' }, field: 'points', order: 'desc' },
          { source: { round: 'R1' }, field: 'time', order: 'asc' },
        ],
      },
    }
    const teams = [team('fast', { R1: [100, 95_100] }), team('slow', { R1: [100, 95_900] })]
    const seconds = rank(compileRankingConfig(withTimeDecimals(cfg, 0)), teams)
    expect(seconds.entries.map((e) => [e.team, e.rank, e.shared])).toEqual([
      ['fast', 1, true],
      ['slow', 1, true],
    ])
    const tenths = rank(compileRankingConfig(withTimeDecimals(cfg, 1)), teams)
    expect(tenths.entries.map((e) => [e.team, e.rank])).toEqual([
      ['fast', 1],
      ['slow', 2],
    ])
    // The measured milliseconds stay in the input; only the ranking uses the cut value.
    expect(
      explainTeam(compileRankingConfig(withTimeDecimals(cfg, 0)), teams[1]!).results.R1!.timeMs,
    ).toBe(95_000)
  })
})
