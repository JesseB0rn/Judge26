import type { Ranking } from '@judge26/ranking-engine'
import type { PublicEvent, PublicGame, PublicRanking } from '../types'

export const SAT = { id: 'sat', date: '2026-06-13', label: 'Saturday' }
export const SUN = { id: 'sun', date: '2026-06-14', label: 'Sunday' }

let n = 0
export function game(overrides: Partial<PublicGame> = {}): PublicGame {
  n++
  return {
    id: `g${n}`,
    category: 'rmj',
    round: 'r1',
    team: { id: `t${n}`, name: `Team ${n}`, organization: '', country: '' },
    table: 'tA',
    sequence: n,
    attempt: 1,
    state: 'upcoming',
    ...overrides,
  }
}

const team = (id: string, name: string) => ({
  id,
  name,
  organization: `${name} School`,
  country: 'CH',
})

/** Two categories; RM-J R1 on Saturday, R2 on Sunday; RM-E R1 on Saturday. */
export function makePublicEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    revision: 5,
    event: {
      id: 'event1',
      name: 'WRO Final',
      season: 2026,
      venue: 'Bern',
      description: '',
      status: 'published',
    },
    days: [SAT, SUN],
    categories: [
      { id: 'rmj', name: 'RoboMission Junior', code: 'RM-J', live: true, official: null },
      { id: 'rme', name: 'RoboMission Elementary', code: 'RM-E', live: false, official: null },
    ],
    tables: [
      { id: 'tA', name: 'Table A' },
      { id: 'tB', name: 'Table B' },
    ],
    rounds: [
      { id: 'r1', category: 'rmj', key: 'R1', name: 'Round 1', position: 1, day: 'sat' },
      { id: 'r2', category: 'rmj', key: 'R2', name: 'Round 2', position: 2, day: 'sun' },
      { id: 'e1', category: 'rme', key: 'R1', name: 'Round 1', position: 1, day: 'sat' },
    ],
    games: [
      { ...game(), id: 'a1', team: team('a', 'Alpha'), round: 'r1', sequence: 1, state: 'done' },
      {
        ...game(),
        id: 'b1',
        team: team('b', 'Bravo'),
        round: 'r1',
        sequence: 2,
        state: 'in_review',
      },
      {
        ...game(),
        id: 'c1',
        team: team('c', 'Charlie'),
        round: 'r1',
        sequence: 3,
        state: 'scoring',
      },
      { ...game(), id: 'd1', team: team('d', 'Delta'), round: 'r1', sequence: 4 },
      { ...game(), id: 'a2', team: team('a', 'Alpha'), round: 'r2', sequence: 1 },
      {
        ...game(),
        id: 'e1g',
        category: 'rme',
        team: team('e', 'Echo'),
        round: 'e1',
        table: 'tB',
        sequence: 1,
      },
    ],
    ...overrides,
  }
}

export function makeRankingResult(names: string[]): Ranking {
  return {
    keys: [{ label: 'Total', field: 'points', order: 'desc' }],
    entries: names.map((name, i) => ({
      team: name.toLowerCase(),
      name,
      rank: i + 1,
      shared: false,
      provisional: false,
      values: [100 - i * 10],
      decidedBy: i ? 0 : null,
      results: {},
    })),
    issues: [],
  } as unknown as Ranking
}

const CONFIG = {
  schemaVersion: 1,
  precision: 0,
  rounds: [{ key: 'R1' }],
  calculations: [],
  ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc', label: 'Total' }] },
}

export function makePublicRanking(overrides: Partial<PublicRanking> = {}): PublicRanking {
  return {
    revision: 5,
    category: { id: 'rmj', name: 'RoboMission Junior', code: 'RM-J', event: 'event1' },
    official: null,
    live: { config: CONFIG as never, result: makeRankingResult(['Alpha', 'Bravo']) },
    progress: { total: 5, done: 1, in_review: 1 },
    teams: {},
    ...overrides,
  }
}

export function official(names: string[], title = 'Official day 1') {
  return {
    id: 'snap1',
    title,
    created: '2026-06-13 18:00:00.000Z',
    published_at: '2026-06-13 18:05:00.000Z',
    fingerprint: 'abc',
    config: CONFIG as never,
    result: makeRankingResult(names),
  }
}
