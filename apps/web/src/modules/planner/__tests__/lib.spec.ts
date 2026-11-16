import { describe, expect, it } from 'vitest'
import {
  axisRange,
  gridColumns,
  clampStart,
  formatTime,
  issuesByItem,
  itemColumns,
  laterItems,
  layoutDay,
  parseRef,
  shiftPlacement,
  snap,
  timeRange,
  todayId,
  toMinutes,
  unplacedPhases,
} from '../lib'
import type { PlannerBlock, PlannerData, PlannerDay, PlannerPhase } from '../types'

const day = (id: string, date: string, starts_at = '08:00', ends_at = '18:00'): PlannerDay => ({
  id,
  date,
  label: '',
  starts_at,
  ends_at,
})

const phase = (data: Partial<PlannerPhase> & Pick<PlannerPhase, 'id'>): PlannerPhase => ({
  round: 'r1',
  phase: 'scoring',
  day: 'd1',
  starts_at: '09:00',
  duration_minutes: 60,
  ...data,
})

const block = (data: Partial<PlannerBlock> & Pick<PlannerBlock, 'id'>): PlannerBlock => ({
  day: 'd1',
  starts_at: '12:00',
  duration_minutes: 60,
  title: 'Lunch',
  place: '',
  color: '',
  responsibility: '',
  categories: [],
  public: true,
  ...data,
})

const rounds = [
  { id: 'r1', category: 'c1', key: 'R1', name: 'Round 1', position: 1, day: 'd1' },
  { id: 'r2', category: 'c2', key: 'X1', name: 'Round X', position: 1, day: 'd1' },
]

describe('planner time helpers', () => {
  it('parses, formats and snaps times', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('')).toBeNull()
    expect(toMinutes('24:00')).toBeNull()
    expect(formatTime(570)).toBe('09:30')
    expect(formatTime(1440)).toBe('24:00')
    expect(snap(572)).toBe(570)
    expect(snap(573)).toBe(575)
    expect(clampStart(1430, 30)).toBe(1410)
    expect(clampStart(-10, 30)).toBe(0)
    expect(timeRange('09:00', 30)).toBe('09:00–09:30')
    expect(timeRange('', 30)).toBe('Not placed')
  })

  it('parses deep-link values', () => {
    expect(parseRef('phase:abc123')).toEqual({ kind: 'phase', id: 'abc123' })
    expect(parseRef('block:x')).toEqual({ kind: 'block', id: 'x' })
    expect(parseRef('round:x')).toBeNull()
    expect(parseRef(undefined)).toBeNull()
  })

  it('M4-14-05: the axis covers all day windows in whole hours', () => {
    expect(
      axisRange([
        day('a', '2026-06-01', '08:00', '18:00'),
        day('b', '2026-06-02', '09:00', '15:00'),
      ]),
    ).toEqual({
      start: 480,
      end: 1080,
    })
    expect(axisRange([day('a', '2026-06-01', '08:30', '17:15')])).toEqual({ start: 480, end: 1080 })
    // Items outside the windows widen the axis.
    expect(axisRange([day('a', '2026-06-01')], [{ start: 7 * 60, end: 19 * 60 + 10 }])).toEqual({
      start: 420,
      end: 1200,
    })
    expect(axisRange([])).toEqual({ start: 480, end: 1080 })
  })

  it('finds today among the competition days', () => {
    const days = [day('a', '2026-06-01'), day('b', '2026-06-02')]
    expect(todayId(days, '2026-06-02')).toBe('b')
    expect(todayId(days, '2026-06-03')).toBeUndefined()
  })
})

describe('layoutDay', () => {
  const data = (phases: PlannerPhase[], blocks: PlannerBlock[]) => ({ phases, blocks, rounds })

  it('M4-14-06: places phases in their round’s category column', () => {
    const items = layoutDay(
      'd1',
      ['c1', 'c2'],
      data([phase({ id: 'p1' }), phase({ id: 'p2', round: 'r2' })], []),
    )
    expect(items.map((i) => [i.key, i.col, i.span, i.lanes])).toEqual([
      ['phase:p1', 0, 1, 1],
      ['phase:p2', 1, 1, 1],
    ])
    // Other days, unplaced phases and hidden categories are not shown.
    expect(layoutDay('d2', ['c1', 'c2'], data([phase({ id: 'p1' })], []))).toEqual([])
    expect(layoutDay('d1', ['c1'], data([phase({ id: 'p1', starts_at: '' })], []))).toEqual([])
    expect(layoutDay('d1', ['c2'], data([phase({ id: 'p1' })], []))).toEqual([])
  })

  it('M4-14-07: event-wide blocks span all columns, non-adjacent ones split', () => {
    const all = layoutDay('d1', ['c1', 'c2', 'c3'], data([], [block({ id: 'b1' })]))
    expect(all.map((i) => [i.col, i.span])).toEqual([[0, 3]])
    const split = layoutDay(
      'd1',
      ['c1', 'c2', 'c3'],
      data([], [block({ id: 'b1', categories: ['c3', 'c1'] })]),
    )
    expect(split.map((i) => [i.col, i.span])).toEqual([
      [0, 1],
      [2, 1],
    ])
    expect(new Set(split.map((i) => i.key)).size).toBe(2)
  })

  it('M4-14-08: overlapping blocks sit side by side', () => {
    const items = layoutDay(
      'd1',
      ['c1', 'c2'],
      data(
        [phase({ id: 'p1', starts_at: '12:30' })],
        [block({ id: 'b1' }), block({ id: 'b2', starts_at: '12:30', categories: ['c2'] })],
      ),
    )
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
    // The lunch block overlaps the phase in c1, so it is split into segments.
    expect(byKey['phase:p1']).toMatchObject({ col: 0, lanes: 2 })
    expect(byKey['block:b1:0']).toMatchObject({ col: 0, lanes: 2 })
    expect(byKey['block:b1:0']!.lane).not.toBe(byKey['phase:p1']!.lane)
    expect(byKey['block:b1:1']).toMatchObject({ col: 1, lanes: 2 })
    expect(byKey['block:b2:1']).toMatchObject({ col: 1, lanes: 2, lane: 1 })
    // Blocks that only touch do not overlap.
    const touching = layoutDay(
      'd1',
      ['c1'],
      data([phase({ id: 'p1', starts_at: '11:00' })], [block({ id: 'b1', categories: ['c1'] })]),
    )
    expect(touching.every((i) => i.lanes === 1)).toBe(true)
  })
})

describe('phase helpers', () => {
  const days = [day('d1', '2026-06-01'), day('d2', '2026-06-02')]

  it('M10-24: shifts placements by days and minutes; never past midnight', () => {
    expect(shiftPlacement(days, { day: 'd1', starts_at: '10:00' }, 60, 1, 30)).toEqual({
      day: 'd2',
      starts_at: '10:30',
    })
    // Would end after midnight or start before it: refused, not squeezed.
    expect(shiftPlacement(days, { day: 'd1', starts_at: '23:00' }, 60, 0, 30)).toBeNull()
    expect(shiftPlacement(days, { day: 'd1', starts_at: '00:10' }, 30, 0, -15)).toBeNull()
    expect(shiftPlacement(days, { day: 'd2', starts_at: '10:00' }, 60, 1, 0)).toBeNull()
  })

  it('M4-14-09: lists unplaced phases by category, round and phase order', () => {
    const data: PlannerData = {
      days,
      categories: [
        { id: 'c1', name: 'B category', code: 'B' },
        { id: 'c2', name: 'A category', code: 'A' },
      ],
      rounds,
      phases: [
        phase({ id: 's1', starts_at: '' }),
        phase({ id: 'm1', phase: 'maintenance', starts_at: '' }),
        phase({ id: 'x', round: 'r2', day: '' }),
        phase({ id: 'placed' }),
      ],
      blocks: [],
      issues: [],
    }
    expect(unplacedPhases(data).map((p) => p.id)).toEqual(['x', 'm1', 's1'])
  })

  it('indexes issues by item', () => {
    const map = issuesByItem([
      {
        code: 'phase_order',
        message: 'Order',
        items: [
          { kind: 'phase', id: 'a' },
          { kind: 'phase', id: 'b' },
        ],
      },
    ])
    expect(Object.keys(map)).toEqual(['phase:a', 'phase:b'])
  })
})

describe('custom columns (M4-14-33)', () => {
  const data = {
    categories: [
      { id: 'c1', name: 'RoboMission', code: 'RM' },
      { id: 'c2', name: 'Future Engineers', code: 'FE' },
    ],
    columns: [
      { id: 'k2', name: 'Visitors', position: 1, public: true },
      { id: 'k1', name: 'Coaches', position: 0, public: true },
    ],
  }

  it('lists the categories, then the custom columns in their order', () => {
    expect(gridColumns(data).map((c) => [c.id, c.custom])).toEqual([
      ['c1', false],
      ['c2', false],
      ['k1', true],
      ['k2', true],
    ])
    expect(gridColumns(data, ['k2', 'c1']).map((c) => c.id)).toEqual(['c1', 'k2'])
    // Unknown ids fall back to all columns.
    expect(gridColumns(data, ['gone'])).toHaveLength(4)
  })

  it('places blocks in custom columns, alone or together with categories', () => {
    const columns = gridColumns(data).map((c) => c.id)
    const items = layoutDay('d1', columns, {
      rounds: [],
      phases: [],
      blocks: [
        block({ id: 'b1', columns: ['k1'] }),
        block({ id: 'b2', starts_at: '15:00', categories: ['c2'], columns: ['k1'] }),
      ],
    })
    expect(items.map((i) => [i.key, i.col, i.span])).toEqual([
      ['block:b1:2', 2, 1],
      ['block:b2:1', 1, 2],
    ])
  })
})

describe('M10-24 move later', () => {
  // Columns c1, c2 (categories) and k1 (custom column). Day d1, plus one item on d2.
  const plan = (phases: PlannerPhase[], blocks: PlannerBlock[]): PlannerData => ({
    days: [day('d1', '2026-06-01'), day('d2', '2026-06-02')],
    categories: [
      { id: 'c1', name: 'One', code: 'C1' },
      { id: 'c2', name: 'Two', code: 'C2' },
    ],
    columns: [{ id: 'k1', name: 'Judges', position: 0, public: false }],
    rounds,
    phases,
    blocks,
    issues: [],
  })
  const keys = (refs: { kind: string; id: string }[]) => refs.map((r) => `${r.kind}:${r.id}`).sort()

  it('columns of phases and blocks; a block without coverage spans every column', () => {
    const d = plan(
      [phase({ id: 'p1', round: 'r2' })],
      [block({ id: 'b1', categories: ['c1'], columns: ['k1'] }), block({ id: 'all' })],
    )
    expect(itemColumns(d, { kind: 'phase', id: 'p1' })).toEqual(['c2'])
    expect(itemColumns(d, { kind: 'block', id: 'b1' })).toEqual(['c1', 'k1'])
    expect(itemColumns(d, { kind: 'block', id: 'all' })).toEqual(['c1', 'c2', 'k1'])
  })

  it('M10-T36: the rest of the column moves; earlier items, other columns and days stay', () => {
    const d = plan(
      [
        phase({ id: 'm', phase: 'maintenance', starts_at: '08:00', duration_minutes: 30 }),
        phase({ id: 'c', phase: 'check', starts_at: '09:00', duration_minutes: 10 }),
        phase({ id: 's', phase: 'scoring', starts_at: '10:00' }),
        phase({ id: 'x', round: 'r2', starts_at: '11:00' }),
        phase({ id: 'next-day', day: 'd2', starts_at: '12:00' }),
      ],
      [block({ id: 'lunch', categories: ['c1'], starts_at: '12:00' })],
    )
    expect(keys(laterItems(d, { kind: 'phase', id: 'c' }))).toEqual(['block:lunch', 'phase:s'])
    expect(laterItems(d, { kind: 'block', id: 'lunch' })).toEqual([])
  })

  it('M10-T37: a later block spanning columns brings the later items of those columns', () => {
    const d = plan(
      [
        phase({ id: 'a1', starts_at: '09:00' }),
        phase({ id: 'b-early', round: 'r2', starts_at: '09:30' }),
        phase({ id: 'b-late', round: 'r2', starts_at: '13:00' }),
      ],
      [
        block({ id: 'wide', categories: ['c1', 'c2'], starts_at: '11:00' }),
        block({ id: 'judges', columns: ['k1'], starts_at: '14:00' }),
      ],
    )
    expect(keys(laterItems(d, { kind: 'phase', id: 'a1' }))).toEqual(['block:wide', 'phase:b-late'])
    // A block covering every column pulls the custom column in, too.
    const all = plan(
      [phase({ id: 'a1', starts_at: '09:00' })],
      [
        block({ id: 'ceremony', starts_at: '10:00' }),
        block({ id: 'judges', columns: ['k1'], starts_at: '14:00' }),
      ],
    )
    expect(keys(laterItems(all, { kind: 'phase', id: 'a1' }))).toEqual([
      'block:ceremony',
      'block:judges',
    ])
  })

  it('items starting at the same time in the column move too', () => {
    const d = plan(
      [phase({ id: 'a', starts_at: '09:00' })],
      [block({ id: 'parallel', categories: ['c1'], starts_at: '09:00' })],
    )
    expect(keys(laterItems(d, { kind: 'phase', id: 'a' }))).toEqual(['block:parallel'])
  })
})
