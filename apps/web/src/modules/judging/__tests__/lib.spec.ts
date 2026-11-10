import { describe, expect, it } from 'vitest'
import {
  IDLE,
  dayOptions,
  elapsed,
  filterAssignments,
  formatTime,
  groupByRound,
  isToDo,
  parseTime,
  pause,
  phase,
  scoreState,
  start,
  stop,
  tableOptions,
} from '../lib'
import { makeAssignment } from './fixtures'

describe('stopwatch (M5-07)', () => {
  it('M5-T06: start and stop records the elapsed duration', () => {
    const running = start(IDLE, 1_000)
    expect(phase(running)).toBe('running')
    expect(elapsed(running, 3_500)).toBe(2_500)
    const { timeMs, state } = stop(running, 96_370)
    expect(timeMs).toBe(95_370)
    expect(state).toEqual(IDLE)
  })

  it('pausing excludes the paused period; resuming continues', () => {
    let s = start(IDLE, 0)
    s = pause(s, 10_000)
    expect(phase(s)).toBe('paused')
    expect(elapsed(s, 50_000)).toBe(10_000)
    s = start(s, 60_000)
    expect(stop(s, 65_000).timeMs).toBe(15_000)
  })

  it('start while running and pause while stopped change nothing', () => {
    const s = start(IDLE, 5)
    expect(start(s, 99)).toBe(s)
    expect(pause(IDLE, 99)).toBe(IDLE)
  })
})

describe('times (M5-08)', () => {
  it('formats minutes, seconds and hundredths', () => {
    expect(formatTime(0)).toBe('0:00.00')
    expect(formatTime(95_370)).toBe('1:35.37')
    expect(formatTime(5_009)).toBe('0:05.00')
    expect(formatTime(600_000)).toBe('10:00.00')
  })

  it.each([
    ['1:35.37', 95_370],
    ['1:35', 95_000],
    ['95.37', 95_370],
    ['95,37', 95_370],
    [' 12 ', 12_000],
    ['', 0],
  ])('parses %j', (text, ms) => expect(parseTime(text)).toBe(ms))

  it.each(['abc', '1:75', '-3', '1:2:3'])('rejects %j', (text) => {
    expect(parseTime(text)).toBeNull()
  })
})

describe('score state', () => {
  it('derives the state from the sheet and the game', () => {
    expect(scoreState(makeAssignment())).toBe('open')
    expect(scoreState(makeAssignment({ status: 'completed' }))).toBe('recorded')
    const sheet = (status: 'draft' | 'submitted' | 'rejected' | 'finalized') =>
      makeAssignment({
        sheet: { status, outcome: 'completed', points: 1, time_ms: 0, updated: '' },
      })
    expect(scoreState(sheet('draft'))).toBe('draft')
    expect(scoreState(sheet('rejected'))).toBe('returned')
    expect(scoreState(sheet('submitted'))).toBe('submitted')
    expect(scoreState(sheet('finalized'))).toBe('final')
    expect(isToDo(sheet('rejected'))).toBe(true)
    expect(isToDo(sheet('submitted'))).toBe(false)
  })
})

describe('dashboard filters (M5-02)', () => {
  const sat = { id: 'sat', date: '2026-06-13', label: 'Saturday' }
  const sun = { id: 'sun', date: '2026-06-14', label: '' }
  const rows = [
    makeAssignment({ id: 'a', day: sun, table: { id: 't2', name: 'Table 10' } }),
    makeAssignment({ id: 'b', day: sat, table: { id: 't1', name: 'Table 2' } }),
    makeAssignment({ id: 'c', day: null, table: { id: 't1', name: 'Table 2' } }),
  ]

  it('filters by day and table', () => {
    expect(filterAssignments(rows, { day: 'sat', table: '' }).map((r) => r.id)).toEqual(['b'])
    expect(filterAssignments(rows, { day: 'none', table: '' }).map((r) => r.id)).toEqual(['c'])
    expect(filterAssignments(rows, { day: '', table: 't1' }).map((r) => r.id)).toEqual(['b', 'c'])
    expect(filterAssignments(rows, { day: '', table: '' })).toHaveLength(3)
  })

  it('offers days by date and tables in natural order', () => {
    expect(dayOptions(rows).map((o) => o.label)).toEqual(['Saturday', '2026-06-14', 'No day'])
    expect(tableOptions(rows).map((o) => o.label)).toEqual(['Table 2', 'Table 10'])
  })

  it('groups rows by day and round in their order', () => {
    const groups = groupByRound(rows)
    expect(groups).toHaveLength(3)
    expect(groups[1]!.subtitle).toContain('Saturday')
  })
})
