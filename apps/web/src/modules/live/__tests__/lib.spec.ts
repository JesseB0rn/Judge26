import { describe, expect, it } from 'vitest'
import {
  currentDay,
  filterGames,
  isProvisional,
  localDate,
  pageCount,
  pageOf,
  parseRotate,
  parseTvView,
  pickRanking,
  progressOf,
  publishedCategories,
  scheduleGroups,
  tableQueues,
  tvSlides,
} from '../lib'
import { makePublicEvent, makePublicRanking, official, SAT, SUN } from './fixtures'

const ids = (games: { id: string }[]) => games.map((g) => g.id)

describe('live lib', () => {
  it('M6-06 / M6-07: filters games by category and by the day of their round', () => {
    const event = makePublicEvent()
    expect(ids(filterGames(event, { category: 'rme' }))).toEqual(['e1g'])
    expect(ids(filterGames(event, { day: 'sun' }))).toEqual(['a2'])
    expect(ids(filterGames(event, { category: 'rmj', day: 'sat' }))).toEqual([
      'a1',
      'b1',
      'c1',
      'd1',
    ])
    expect(filterGames(event, {})).toHaveLength(6)
  })

  it('M6-08: counts done, in-review and remaining games', () => {
    const event = makePublicEvent()
    expect(progressOf(filterGames(event, { day: 'sat' }))).toEqual({
      total: 5,
      done: 1,
      inReview: 1,
      remaining: 3,
      percent: 20,
    })
    expect(progressOf([])).toMatchObject({ total: 0, percent: 0 })
    expect(progressOf([{ state: 'done' }, { state: 'done' }, { state: 'upcoming' }]).percent).toBe(
      66,
    )
  })

  it('M6-09: starts on today, else on the first day with open games, else on the last day', () => {
    const event = makePublicEvent()
    expect(currentDay(event, SUN.date)).toBe('sun')
    expect(currentDay(event, '2026-06-01')).toBe('sat')
    const finishedSaturday = makePublicEvent({
      games: makePublicEvent().games.map((g) => (g.round === 'r2' ? g : { ...g, state: 'done' })),
    })
    expect(currentDay(finishedSaturday, '2026-06-20')).toBe('sun')
    const allDone = makePublicEvent({
      games: makePublicEvent().games.map((g) => ({ ...g, state: 'done' as const })),
    })
    expect(currentDay(allDone, '2026-06-20')).toBe('sun')
    expect(currentDay(makePublicEvent({ days: [] }), SAT.date)).toBe('')
  })

  it('formats local calendar dates', () => {
    expect(localDate(new Date(2026, 5, 3, 23, 59))).toBe('2026-06-03')
  })

  it('M6-04: groups the schedule by round in playing order', () => {
    const groups = scheduleGroups(makePublicEvent(), {})
    expect(groups.map((g) => [g.round.id, g.day?.id, ids(g.games)])).toEqual([
      ['e1', 'sat', ['e1g']],
      ['r1', 'sat', ['a1', 'b1', 'c1', 'd1']],
      ['r2', 'sun', ['a2']],
    ])
    expect(groups[1]!.progress).toMatchObject({ total: 4, done: 1, inReview: 1 })
    expect(groups[1]!.category?.name).toBe('RoboMission Junior')
  })

  it('M6-04: shows now/next per table; games in review have left the table', () => {
    const [a, b] = tableQueues(makePublicEvent(), { day: 'sat' })
    expect(a!.table.name).toBe('Table A')
    expect(a!.current?.id).toBe('c1')
    expect(ids(a!.next)).toEqual(['d1'])
    expect(a!.remaining).toBe(2)
    expect(b!.current?.id).toBe('e1g')
    const sunday = tableQueues(makePublicEvent(), { day: 'sun' })
    expect(sunday[0]!.current?.id).toBe('a2')
    expect(sunday[1]!.current).toBeNull()
  })

  it('M6-03: only categories with a published ranking are shown publicly', () => {
    const { categories } = makePublicEvent()
    expect(publishedCategories(categories).map((c) => c.id)).toEqual(['rmj'])
  })

  it('M6-02 / M6-10: prefers the official ranking; live results are provisional while games are open', () => {
    const liveOnly = makePublicRanking()
    expect(pickRanking(liveOnly)?.source).toBe('live')
    expect(isProvisional(liveOnly, 'live')).toBe(true)
    const both = makePublicRanking({ official: official(['Bravo', 'Alpha']) })
    expect(pickRanking(both)?.source).toBe('official')
    expect(pickRanking(both, 'live')?.source).toBe('live')
    expect(isProvisional(both, 'official')).toBe(false)
    expect(pickRanking(makePublicRanking({ live: null }))).toBeNull()
    expect(pickRanking(undefined)).toBeNull()
    const complete = makePublicRanking({ progress: { total: 2, done: 2, in_review: 0 } })
    expect(isProvisional(complete, 'live')).toBe(false)
  })

  it('M6-05: builds the TV rotation with one slide per ranking page', () => {
    const rankings = [
      { category: 'rmj', rows: 25 },
      { category: 'rme', rows: 3 },
    ]
    const slides = tvSlides({ view: 'auto', rankings, rowsPerPage: 10, hasTables: true })
    expect(slides).toEqual([
      { kind: 'ranking', category: 'rmj', page: 0, pages: 3 },
      { kind: 'ranking', category: 'rmj', page: 1, pages: 3 },
      { kind: 'ranking', category: 'rmj', page: 2, pages: 3 },
      { kind: 'ranking', category: 'rme', page: 0, pages: 1 },
      { kind: 'tables' },
      { kind: 'progress' },
    ])
    expect(tvSlides({ view: 'tables', rankings, rowsPerPage: 10, hasTables: true })).toEqual([
      { kind: 'tables' },
    ])
    expect(tvSlides({ view: 'auto', rankings: [], rowsPerPage: 10, hasTables: false })).toEqual([
      { kind: 'progress' },
    ])

    // The day's timetable (M4-14-26) comes after the tables when it has anything placed.
    expect(
      tvSlides({
        view: 'auto',
        rankings: [],
        rowsPerPage: 10,
        hasTables: true,
        hasTimetable: true,
      }),
    ).toEqual([{ kind: 'tables' }, { kind: 'timetable' }, { kind: 'progress' }])
    expect(
      tvSlides({
        view: 'timetable',
        rankings,
        rowsPerPage: 10,
        hasTables: true,
        hasTimetable: true,
      }),
    ).toEqual([{ kind: 'timetable' }])
  })

  it('paginates and parses TV options', () => {
    expect(pageCount(0, 10)).toBe(1)
    expect(pageCount(21, 10)).toBe(3)
    expect(pageOf([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4])
    expect(parseTvView('tables')).toBe('tables')
    expect(parseTvView('timetable')).toBe('timetable')
    expect(parseTvView('admin')).toBe('auto')
    expect(parseRotate('30')).toBe(30)
    expect(parseRotate('1')).toBe(5)
    expect(parseRotate('x')).toBe(15)
    expect(parseRotate('9999')).toBe(300)
  })
})
