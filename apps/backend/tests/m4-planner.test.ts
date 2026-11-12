import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError, type RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// M4-14: multi-day schedule planner (docs/specifications/M4-tables-and-scheduling.md).

interface Phase extends RecordModel {
  round: string
  phase: 'maintenance' | 'check' | 'scoring'
  day: string
  starts_at: string
  duration_minutes: number
}

interface Issue {
  code: string
  items: { kind: 'phase' | 'block'; id: string }[]
}

interface PlannerPayload {
  days: { id: string; date: string; starts_at: string; ends_at: string }[]
  rounds: { id: string; day: string }[]
  phases: Phase[]
  blocks: (RecordModel & { title: string; public: boolean; columns: string[] })[]
  columns: { id: string; name: string; position: number; public: boolean }[]
  issues: Issue[]
  internal: boolean
  can_edit: boolean
  my_categories: string[]
}

interface Ctx {
  event: RecordModel
  category: RecordModel
  manager: TestUser
  judge: TestUser
  day1: RecordModel
  day2: RecordModel
  round: RecordModel
}

describe('M4-14 schedule planner', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(eventData: Record<string, unknown> = {}): Promise<Ctx> {
    const event = await fx.event(eventData)
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const day1 = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-01', label: 'Day 1' })
    const day2 = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-02', label: 'Day 2' })
    const round = await createRound(manager, category.id, 'R1', 30, 60)
    return { event, category, manager, judge, day1, day2, round }
  }

  const createRound = (user: TestUser, category: string, key: string, testing = 30, scoring = 60) =>
    user.pb.collection('rounds').create({
      category,
      key,
      name: `Round ${key}`,
      position: 1,
      testing_minutes: testing,
      scoring_minutes: scoring,
    })

  const phases = async (ctx: Ctx, roundId = ctx.round.id) => {
    const list = await ctx.manager.pb
      .collection('round_phases')
      .getFullList<Phase>({ filter: `round = "${roundId}"` })
    return Object.fromEntries(list.map((p) => [p.phase, p])) as Record<Phase['phase'], Phase>
  }

  const place = (ctx: Ctx, p: Phase, data: Partial<Phase>) =>
    ctx.manager.pb
      .collection('round_phases')
      .update<Phase>(p.id, { ...data, expected_updated: p.updated })

  const planner = (user: TestUser, eventId: string) =>
    user.pb.send<PlannerPayload>(`/api/events/${eventId}/planner`, { method: 'GET' })

  const codes = (issues: Issue[]) => issues.map((i) => i.code).sort()

  async function placeT01(ctx: Ctx) {
    const p = await phases(ctx)
    const maintenance = await place(ctx, p.maintenance, { day: ctx.day1.id, starts_at: '09:00' })
    const scoring = await place(ctx, p.scoring, { day: ctx.day1.id, starts_at: '09:30' })
    return { maintenance, scoring }
  }

  it('creates maintenance and scoring phases for every new round', async () => {
    const ctx = await setup()
    const p = await phases(ctx)
    expect(p.maintenance.duration_minutes).toBe(30)
    expect(p.scoring.duration_minutes).toBe(60)
    expect(p.check).toBeUndefined()
    expect(p.scoring.starts_at).toBe('')

    // A round without a testing phase has no maintenance phase.
    const r2 = await createRound(ctx.manager, ctx.category.id, 'R2', 0, 20)
    const p2 = await phases(ctx, r2.id)
    expect(p2.maintenance).toBeUndefined()
    expect(p2.scoring.duration_minutes).toBe(20)
  })

  it('M4-14-T01: places maintenance and scoring independently', async () => {
    const ctx = await setup()
    await placeT01(ctx)
    const data = await planner(ctx.manager, ctx.event.id)
    const placed = data.phases.filter((p) => p.round === ctx.round.id)
    expect(placed.map((p) => [p.phase, p.starts_at]).sort()).toEqual([
      ['maintenance', '09:00'],
      ['scoring', '09:30'],
    ])
    expect(data.issues).toEqual([])
    // The scoring day is the round's day (M5/M6 keep working).
    expect(data.rounds.find((r) => r.id === ctx.round.id)?.day).toBe(ctx.day1.id)
  })

  it('M4-14-T02/T03: moving or resizing one block changes only that block', async () => {
    const ctx = await setup()
    const { maintenance, scoring } = await placeT01(ctx)
    const moved = await place(ctx, scoring, { starts_at: '10:00' })
    expect(moved.starts_at).toBe('10:00')
    const resized = await place(ctx, moved, { duration_minutes: 75 })
    expect(resized.duration_minutes).toBe(75)
    const p = await phases(ctx)
    expect(p.maintenance.starts_at).toBe('09:00')
    expect(p.maintenance.updated).toBe(maintenance.updated)
    // Durations are mirrored into the round.
    const round = await ctx.manager.pb.collection('rounds').getOne(ctx.round.id)
    expect(round.scoring_minutes).toBe(75)
  })

  it('M4-14-T04/T26: overlapping or reversed phases produce phase_order', async () => {
    const ctx = await setup()
    const { maintenance, scoring } = await placeT01(ctx)
    await place(ctx, maintenance, { duration_minutes: 45 })
    let data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['phase_order'])
    expect(data.issues[0]!.items.map((i) => i.id).sort()).toEqual(
      [maintenance.id, scoring.id].sort(),
    )
    const round = await ctx.manager.pb.collection('rounds').getOne(ctx.round.id)
    expect(round.testing_minutes).toBe(45)

    // Scoring before maintenance (also across days).
    const p = await phases(ctx)
    await place(ctx, p.maintenance, { day: ctx.day2.id })
    data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['phase_order'])
  })

  it('M4-14-T05: rejects too short blocks and blocks past midnight', async () => {
    const ctx = await setup()
    const p = await phases(ctx)
    await expectFieldError(place(ctx, p.scoring, { duration_minutes: 0 }), 'duration_minutes')
    await expectFieldError(
      place(ctx, p.scoring, { day: ctx.day1.id, starts_at: '23:30' }),
      'duration_minutes',
      'crosses_midnight',
    )
    await expectFieldError(
      ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day1.id,
        starts_at: '12:00',
        duration_minutes: 4,
        title: 'Too short',
      }),
      'duration_minutes',
    )
    // A start time needs a day.
    const fresh = await phases(ctx)
    const r2 = await createRound(ctx.manager, ctx.category.id, 'R2', 0, 10)
    const unplacedDay = (await phases(ctx, r2.id)).scoring
    expect(unplacedDay.day).toBe('')
    await expectFieldError(place(ctx, unplacedDay, { starts_at: '10:00' }), 'day', 'required')
    expect(fresh.scoring.duration_minutes).toBe(60)
  })

  it('M4-14-T06/T07: custom blocks store their details and can move', async () => {
    const ctx = await setup()
    const block = await ctx.manager.pb.collection('schedule_blocks').create({
      event: ctx.event.id,
      day: ctx.day1.id,
      starts_at: '12:00',
      duration_minutes: 60,
      title: 'Lunch',
      place: 'Cafeteria',
      color: 'green',
      responsibility: 'Catering team',
      public: true,
    })
    expect(block.categories).toEqual([])
    const other = await fx.category(ctx.event.id)
    const moved = await ctx.manager.pb.collection('schedule_blocks').update(block.id, {
      day: ctx.day2.id,
      starts_at: '12:30',
      categories: [other.id],
      expected_updated: block.updated,
    })
    expect([moved.day, moved.starts_at, moved.categories]).toEqual([
      ctx.day2.id,
      '12:30',
      [other.id],
    ])
    // Categories and days of other events are rejected.
    const foreign = await setup()
    await expectFieldError(
      ctx.manager.pb.collection('schedule_blocks').update(block.id, {
        categories: [foreign.category.id],
        expected_updated: moved.updated,
      }),
      'categories',
    )
    await expectFieldError(
      ctx.manager.pb.collection('schedule_blocks').update(block.id, {
        day: foreign.day1.id,
        expected_updated: moved.updated,
      }),
      'day',
    )
  })

  it('M4-14-T08: moving scoring to another day moves the round, games stay', async () => {
    const ctx = await setup()
    const judgeTable = await ctx.manager.pb.collection('tables').create({
      event: ctx.event.id,
      name: 'T1',
      active: true,
      judge: ctx.judge.id,
    })
    const team = await fx.team(ctx.event.id, ctx.category.id, { status: 'approved' })
    const game = await ctx.manager.pb.collection('games').create({
      round: ctx.round.id,
      team: team.id,
      status: 'scheduled',
      table: judgeTable.id,
      sequence: 1,
    })
    const { scoring } = await placeT01(ctx)
    await place(ctx, scoring, { day: ctx.day2.id })
    const round = await ctx.manager.pb.collection('rounds').getOne(ctx.round.id)
    expect(round.day).toBe(ctx.day2.id)
    const p = await phases(ctx)
    expect([p.maintenance.day, p.scoring.day, p.scoring.starts_at]).toEqual([
      ctx.day1.id,
      ctx.day2.id,
      '09:30',
    ])
    const stored = await ctx.manager.pb.collection('games').getOne(game.id)
    expect([stored.table, stored.sequence]).toEqual([judgeTable.id, 1])

    // The other direction: changing the round's day in its settings moves the scoring phase.
    await ctx.manager.pb.collection('rounds').update(ctx.round.id, { day: ctx.day1.id })
    expect((await phases(ctx)).scoring.day).toBe(ctx.day1.id)
    // And changing the round's durations updates the phases (maintenance removed at 0).
    await ctx.manager.pb
      .collection('rounds')
      .update(ctx.round.id, { testing_minutes: 0, scoring_minutes: 40 })
    const after = await phases(ctx)
    expect(after.maintenance).toBeUndefined()
    expect(after.scoring.duration_minutes).toBe(40)
  })

  it('M4-14-T11: overlapping rounds of one category produce round_overlap', async () => {
    const ctx = await setup()
    await placeT01(ctx)
    const r2 = await createRound(ctx.manager, ctx.category.id, 'R2', 0, 30)
    await place(ctx, (await phases(ctx, r2.id)).scoring, { day: ctx.day1.id, starts_at: '10:00' })
    const data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['round_overlap'])
    // Another day: no conflict.
    await place(ctx, (await phases(ctx, r2.id)).scoring, { day: ctx.day2.id })
    expect((await planner(ctx.manager, ctx.event.id)).issues).toEqual([])
  })

  it('M4-14-T12: overlapping scoring on a shared table produces table_overlap', async () => {
    const ctx = await setup()
    const other = await fx.category(ctx.event.id)
    const table = await ctx.manager.pb.collection('tables').create({
      event: ctx.event.id,
      name: 'Shared',
      active: true,
      judge: ctx.judge.id,
    })
    const r2 = await createRound(ctx.manager, other.id, 'X1', 0, 60)
    for (const [round, category] of [
      [ctx.round.id, ctx.category.id],
      [r2.id, other.id],
    ] as const) {
      const team = await fx.team(ctx.event.id, category, { status: 'approved' })
      await ctx.manager.pb
        .collection('games')
        .create({ round, team: team.id, status: 'scheduled', table: table.id, sequence: 1 })
    }
    await placeT01(ctx)
    await place(ctx, (await phases(ctx, r2.id)).scoring, { day: ctx.day1.id, starts_at: '10:00' })
    const data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['table_overlap'])
    // Also part of schedule validation.
    const validation = await ctx.manager.pb.send<{ planner_issues: Issue[] }>(
      `/api/events/${ctx.event.id}/schedule/validation`,
      { method: 'GET' },
    )
    expect(codes(validation.planner_issues)).toEqual(['table_overlap'])
  })

  it('M4-14-23: the same judge on two tables at once produces judge_overlap', async () => {
    const ctx = await setup()
    const other = await fx.category(ctx.event.id)
    const tables = []
    for (const name of ['A', 'B']) {
      tables.push(
        await ctx.manager.pb
          .collection('tables')
          .create({ event: ctx.event.id, name, active: true, judge: ctx.judge.id }),
      )
    }
    const r2 = await createRound(ctx.manager, other.id, 'X1', 0, 60)
    for (const [round, category, table] of [
      [ctx.round.id, ctx.category.id, tables[0]!.id],
      [r2.id, other.id, tables[1]!.id],
    ] as const) {
      const team = await fx.team(ctx.event.id, category, { status: 'approved' })
      await ctx.manager.pb
        .collection('games')
        .create({ round, team: team.id, status: 'scheduled', table, sequence: 1 })
    }
    await placeT01(ctx)
    await place(ctx, (await phases(ctx, r2.id)).scoring, { day: ctx.day1.id, starts_at: '10:00' })
    expect(codes((await planner(ctx.manager, ctx.event.id)).issues)).toEqual(['judge_overlap'])
  })

  it('M4-14-T13/T14: blocks outside the day window are flagged, not rejected', async () => {
    const ctx = await setup()
    const { scoring } = await placeT01(ctx)
    await place(ctx, scoring, { starts_at: '17:30' })
    let data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['outside_day'])
    expect(data.days[0]).toMatchObject({ starts_at: '08:00', ends_at: '18:00' })

    // Shrinking the window keeps the blocks and flags them.
    await place(ctx, (await phases(ctx)).scoring, { starts_at: '09:30' })
    await ctx.manager.pb
      .collection('competition_days')
      .update(ctx.day1.id, { starts_at: '10:00', ends_at: '15:00' })
    data = await planner(ctx.manager, ctx.event.id)
    expect(codes(data.issues)).toEqual(['outside_day', 'outside_day'])
    await expectFieldError(
      ctx.manager.pb
        .collection('competition_days')
        .update(ctx.day1.id, { starts_at: '15:00', ends_at: '10:00' }),
      'ends_at',
      'invalid_range',
    )
  })

  it('M4-14-T15: a stale write is refused with 409', async () => {
    const ctx = await setup()
    const p = await phases(ctx)
    await place(ctx, p.scoring, { day: ctx.day1.id, starts_at: '10:00' })
    const stale = place(ctx, p.scoring, { starts_at: '11:00' })
    const error = await stale.then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)
  })

  it('M4-14-T16: overlapping custom blocks cause no issue', async () => {
    const ctx = await setup()
    for (const title of ['Briefing', 'Registration']) {
      await ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day1.id,
        starts_at: '08:30',
        duration_minutes: 60,
        title,
      })
    }
    await placeT01(ctx)
    expect((await planner(ctx.manager, ctx.event.id)).issues).toEqual([])
  })

  it('M4-14-T17/T21/T23: unplanning and robot checks leave other phases alone', async () => {
    const ctx = await setup()
    const { maintenance, scoring } = await placeT01(ctx)
    const check = await ctx.manager.pb.collection('round_phases').create<Phase>({
      round: ctx.round.id,
      phase: 'check',
      duration_minutes: 10,
    })
    expect([check.day, check.starts_at]).toEqual(['', ''])
    // Only one check per round.
    await expectDenied(
      ctx.manager.pb
        .collection('round_phases')
        .create({ round: ctx.round.id, phase: 'check', duration_minutes: 10 }),
    )
    // Maintenance and scoring cannot be added or removed over the API.
    await expectDenied(
      ctx.manager.pb
        .collection('round_phases')
        .create({ round: ctx.round.id, phase: 'scoring', duration_minutes: 10 }),
    )
    await expectDenied(ctx.manager.pb.collection('round_phases').delete(scoring.id))
    await expectDenied(
      ctx.manager.pb
        .collection('round_phases')
        .update(scoring.id, { phase: 'check', expected_updated: scoring.updated }),
    )

    await ctx.manager.pb.collection('round_phases').delete(check.id)
    const unplanned = await place(ctx, scoring, { starts_at: '' })
    expect([unplanned.starts_at, unplanned.day]).toEqual(['', ctx.day1.id])
    const p = await phases(ctx)
    expect(p.maintenance.updated).toBe(maintenance.updated)
    expect(p.check).toBeUndefined()
  })

  it('M4-14-T22: a lunch between check and scoring is fine', async () => {
    const ctx = await setup()
    const { maintenance } = await placeT01(ctx)
    expect(maintenance.starts_at).toBe('09:00')
    await ctx.manager.pb.collection('schedule_blocks').create({
      event: ctx.event.id,
      day: ctx.day1.id,
      starts_at: '11:30',
      duration_minutes: 60,
      title: 'Lunch',
    })
    await ctx.manager.pb.collection('round_phases').create({
      round: ctx.round.id,
      phase: 'check',
      day: ctx.day1.id,
      starts_at: '12:30',
      duration_minutes: 10,
    })
    await place(ctx, (await phases(ctx)).scoring, { starts_at: '12:45' })
    expect((await planner(ctx.manager, ctx.event.id)).issues).toEqual([])
  })

  it('M4-14-T18/T19: visitors and judges cannot edit; internal blocks stay internal', async () => {
    const ctx = await setup()
    const visitor = await fx.user()
    for (const [title, isPublic] of [
      ['Lunch', true],
      ['Judges briefing', false],
    ] as const) {
      await ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day1.id,
        starts_at: '12:00',
        duration_minutes: 30,
        title,
        public: isPublic,
      })
    }
    const p = await phases(ctx)

    const judgeView = await planner(ctx.judge, ctx.event.id)
    expect([judgeView.internal, judgeView.can_edit, judgeView.blocks.length]).toEqual([
      true,
      false,
      2,
    ])
    const visitorView = await planner(visitor, ctx.event.id)
    expect([visitorView.internal, visitorView.can_edit]).toEqual([false, false])
    expect(visitorView.blocks.map((b) => b.title)).toEqual(['Lunch'])
    expect(visitorView.issues).toEqual([])
    const managerView = await planner(ctx.manager, ctx.event.id)
    expect(managerView.can_edit).toBe(true)

    // Collection rules agree with the endpoint.
    const visitorBlocks = await visitor.pb
      .collection('schedule_blocks')
      .getFullList({ filter: `event = "${ctx.event.id}"` })
    expect(visitorBlocks.map((b) => b.title)).toEqual(['Lunch'])

    for (const user of [visitor, ctx.judge]) {
      await expectDenied(
        user.pb
          .collection('round_phases')
          .update(p.scoring.id, { starts_at: '10:00', expected_updated: p.scoring.updated }),
      )
      await expectDenied(
        user.pb.collection('schedule_blocks').create({
          event: ctx.event.id,
          day: ctx.day1.id,
          starts_at: '09:00',
          duration_minutes: 30,
          title: 'Nope',
        }),
      )
    }

    // Public payload: public blocks only.
    const res = await fetch(`${server.url}/api/public/events/${ctx.event.id}`)
    const body = (await res.json()) as { planner: PlannerPayload; days: { starts_at: string }[] }
    expect(body.planner.blocks.map((b) => b.title)).toEqual(['Lunch'])
    expect(body.planner.phases.length).toBe(2)
    expect(body.days[0]!.starts_at).toBe('08:00')
  })

  it('hides draft events from users without a role', async () => {
    const ctx = await setup({ status: 'draft' })
    const outsider = await fx.user()
    await expectDenied(planner(outsider, ctx.event.id))
    await expectDenied(
      outsider.pb.collection('round_phases').getOne((await phases(ctx)).scoring.id),
    )
  })

  it('M4-14-T20: planner changes increase the live revision', async () => {
    const ctx = await setup()
    const revision = async () => {
      const list = await fx.su
        .collection('live_revisions')
        .getFullList({ filter: `event = "${ctx.event.id}"` })
      return (list[0]?.revision as number | undefined) ?? 0
    }
    const before = await revision()
    await ctx.manager.pb.collection('schedule_blocks').create({
      event: ctx.event.id,
      day: ctx.day1.id,
      starts_at: '12:00',
      duration_minutes: 30,
      title: 'Lunch',
    })
    const afterBlock = await revision()
    expect(afterBlock).toBeGreaterThan(before)
    const p = await phases(ctx)
    await place(ctx, p.maintenance, { day: ctx.day1.id, starts_at: '08:00' })
    expect(await revision()).toBeGreaterThan(afterBlock)
  })

  it('archived events are read-only', async () => {
    const ctx = await setup()
    const p = await phases(ctx)
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(
      ctx.manager.pb
        .collection('round_phases')
        .update(p.scoring.id, { day: ctx.day1.id, expected_updated: p.scoring.updated }),
    )
    expect((await planner(ctx.manager, ctx.event.id)).can_edit).toBe(false)
  })

  describe('M4-14-33 custom columns', () => {
    const column = (ctx: Ctx, name: string, data: Record<string, unknown> = {}) =>
      ctx.manager.pb
        .collection('schedule_columns')
        .create({ event: ctx.event.id, name, position: 0, public: true, ...data })

    it('M4-14-T28: blocks can be placed in custom columns next to the categories', async () => {
      const ctx = await setup()
      const visitors = await column(ctx, 'Visitors', { position: 1 })
      const judges = await column(ctx, 'Judges', { position: 0 })
      const block = await ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day1.id,
        starts_at: '10:00',
        duration_minutes: 60,
        title: 'Judges meeting',
        columns: [judges.id],
      })
      expect(block.columns).toEqual([judges.id])
      const data = await planner(ctx.manager, ctx.event.id)
      expect(data.columns.map((c) => c.name)).toEqual(['Judges', 'Visitors'])
      expect(data.blocks[0]!.columns).toEqual([judges.id])
      expect(visitors.public).toBe(true)

      // Columns of other events are rejected, and names are unique per event.
      const foreign = await setup()
      const other = await column(foreign, 'Visitors')
      await expectFieldError(
        ctx.manager.pb.collection('schedule_blocks').update(block.id, {
          columns: [other.id],
          expected_updated: block.updated,
        }),
        'columns',
        'invalid_column',
      )
      await expectDenied(column(ctx, 'Visitors'))
    })

    it('M4-14-T29: a column with blocks cannot be deleted', async () => {
      const ctx = await setup()
      const visitors = await column(ctx, 'Visitors')
      const block = await ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day1.id,
        starts_at: '10:00',
        duration_minutes: 60,
        title: 'Open house',
        columns: [visitors.id],
      })
      await expectDenied(ctx.manager.pb.collection('schedule_columns').delete(visitors.id))
      await ctx.manager.pb.collection('schedule_blocks').delete(block.id)
      await ctx.manager.pb.collection('schedule_columns').delete(visitors.id)
      // Deleting the event removes its columns and blocks.
      await column(ctx, 'Judges')
      await fx.su.collection('events').delete(ctx.event.id)
    })

    it('M4-14-T30: internal columns are staff only; only managers edit columns', async () => {
      const ctx = await setup()
      await column(ctx, 'Visitors')
      await column(ctx, 'Judges', { public: false })
      const visitor = await fx.user()
      expect((await planner(ctx.judge, ctx.event.id)).columns.map((c) => c.name)).toEqual([
        'Judges',
        'Visitors',
      ])
      expect((await planner(visitor, ctx.event.id)).columns.map((c) => c.name)).toEqual([
        'Visitors',
      ])
      const res = await fetch(`${server.url}/api/public/events/${ctx.event.id}`)
      const body = (await res.json()) as { planner: PlannerPayload }
      expect(body.planner.columns.map((c) => c.name)).toEqual(['Visitors'])
      const visitorList = await visitor.pb
        .collection('schedule_columns')
        .getFullList({ filter: `event = "${ctx.event.id}"` })
      expect(visitorList.map((c) => c.name)).toEqual(['Visitors'])
      for (const user of [visitor, ctx.judge]) {
        await expectDenied(
          user.pb.collection('schedule_columns').create({ event: ctx.event.id, name: 'Nope' }),
        )
      }
    })
  })
})
