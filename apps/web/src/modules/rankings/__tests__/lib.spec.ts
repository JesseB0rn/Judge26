import { describe, expect, it } from 'vitest'
import { EXAMPLE_RANKING_CONFIG } from '@judge26/ranking-engine'
import { makeGame, makeRound, makeTeam } from '@/test/utils'
import { formatValue, parseRankingConfig, secondsToMs, toTeamInputs } from '../lib'

describe('rankings lib', () => {
  it('builds engine inputs like the backend (status, no-time, scheduled games)', () => {
    const rounds = [makeRound('R1'), makeRound('R2', 2)]
    const games = [
      makeGame({ round: 'round-R1', points: 80, time_ms: 95_000 }),
      makeGame({ round: 'round-R2', points: 40, time_ms: 0 }),
      makeGame({ round: 'round-R2', attempt: 2, status: 'disqualified', points: 0 }),
      makeGame({ round: 'round-R1', attempt: 2, status: 'scheduled' }),
      makeGame({ round: 'round-unknown', points: 1 }),
      makeGame({ team: 'other', points: 99 }),
    ]
    expect(toTeamInputs([makeTeam()], games, rounds)).toEqual([
      {
        id: 'team1',
        name: 'Robo Rangers',
        games: [
          { round: 'R1', attempt: 1, status: 'completed', points: 80, timeMs: 95_000 },
          { round: 'R2', attempt: 1, status: 'completed', points: 40, timeMs: null },
          { round: 'R2', attempt: 2, status: 'disqualified', points: null, timeMs: null },
        ],
      },
    ])
  })

  it('converts typed seconds to milliseconds', () => {
    expect(secondsToMs('95.37')).toBe(95_370)
    expect(secondsToMs('95,5')).toBe(95_500)
    expect(secondsToMs('')).toBe(0)
    expect(secondsToMs('abc')).toBe(0)
    expect(secondsToMs(-3)).toBe(0)
  })

  it('parses ranking configurations', () => {
    expect(parseRankingConfig('').issues).toEqual([])
    expect(parseRankingConfig('{').syntaxError).toBeTruthy()
    expect(parseRankingConfig('{}').issues.length).toBeGreaterThan(0)
    expect(parseRankingConfig(JSON.stringify(EXAMPLE_RANKING_CONFIG)).config).toBeDefined()
  })

  it('formats key values', () => {
    expect(formatValue(null, 'points')).toBe('–')
    // M10-19: times as m:ss with the event's decimals (default milliseconds), cut not rounded.
    expect(formatValue(110_000, 'time')).toBe('1:50.000')
    expect(formatValue(95_379, 'time', 1)).toBe('1:35.3')
    expect(formatValue(95_379, 'time', 0)).toBe('1:35')
    expect(formatValue(42, 'points')).toBe('42')
  })

  it('M10-20: parsing with the event’s decimals cuts times to the coarser resolution', () => {
    const text = JSON.stringify({ ...EXAMPLE_RANKING_CONFIG, timeResolutionMs: 10 })
    expect(parseRankingConfig(text, 0).config!.timeResolutionMs).toBe(1000)
    expect(parseRankingConfig(text, 1).config!.timeResolutionMs).toBe(100)
    expect(parseRankingConfig(text, 3).config!.timeResolutionMs).toBe(10)
    // Category templates (no event): as configured. The saved definition is never changed.
    expect(parseRankingConfig(text).config!.timeResolutionMs).toBe(10)
    expect(
      (parseRankingConfig(text, 0).definition as { timeResolutionMs: number }).timeResolutionMs,
    ).toBe(10)
  })
})
