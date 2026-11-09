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
    expect(formatValue(110_000, 'time')).toBe('110.000 s')
    expect(formatValue(42, 'points')).toBe('42')
  })
})
