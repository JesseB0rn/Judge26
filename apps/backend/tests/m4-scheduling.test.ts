import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError, type RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 14, 9, 0) // 2026-11-14 09:00 UTC
const at = (minutes: number) => new Date(T0 + minutes * MIN).toISOString()

interface Ctx {
  event: RecordModel
  category: RecordModel
  manager: TestUser
  round: RecordModel
  tables: Record<string, RecordModel>
}

interface SetupOptions {
  eventData?: Record<string, unknown>
  tables?: string[]
  play?: [number, number][]
  breaks?: [number, number][]
  roundMinutes?: number
}

describe('M4 tables and scheduling', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser
  let coach: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
    coach = await fx.user()
  })
  afterAll(() => server?.dispose())

  /** A published event with a manager, a round, tables and availability. */
  async function setup(options: SetupOptions = {}): Promise<Ctx> {
    const event = await fx.event(options.eventData ?? {})
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      duration_minutes: options.roundMinutes ?? 15,
    })
    const tables: Record<string, RecordModel> = {}
    for (const name of options.tables ?? ['T1', 'T2']) {
      tables[name] = await manager.pb
        .collection('tables')
        .create({ event: event.id, name, active: true, position: 0 })
    }
    for (const [start, end] of options.play ?? [[0, 120]]) {
      await manager.pb.collection('time_slots').create({
        event: event.id,
        kind: 'play',
        starts_at: at(start),
        ends_at: at(end),
      })
    }
    for (const [start, end] of options.breaks ?? []) {
      await manager.pb.collection('time_slots').create({
        event: event.id,
        kind: 'break',
        label: 'Lunch',
        starts_at: at(start),
        ends_at: at(end),
      })
    }
    return { event, category, manager, round, tables }
  }

  const team = (ctx: Ctx) => fx.team(ctx.event.id, ctx.category.id, { status: 'approved' })

  /** A scheduled game; `placement` may be omitted for an unplaced game. */
  const scheduled = (
    ctx: Ctx,
    t: RecordModel,
    placement: {
      table?: string
      start?: number
      judges?: string[]
      locked?: boolean
      attempt?: number
    } = {},
  ) =>
    ctx.manager.pb.collection('games').create({
      round: ctx.round.id,
      team: t.id,
      attempt: placement.attempt ?? 0,
      status: 'scheduled',
      table: placement.table ? ctx.tables[placement.table]!.id : '',
      starts_at: placement.start === undefined ? '' : at(placement.start),
      judges: placement.judges ?? [],
      locked: placement.locked ?? false,
    })

  const place = (
    ctx: Ctx,
    game: RecordModel,
    placement: { table?: string; start?: number; judges?: string[] },
  ) =>
    ctx.manager.pb.collection('games').update(game.id, {
      table: placement.table ? ctx.tables[placement.table]!.id : '',
      starts_at: placement.start === undefined ? '' : at(placement.start),
      judges: placement.judges ?? game.judges ?? [],
      expected_updated: game.updated,
    })

  const generate = (ctx: Ctx, body: Record<string, unknown> = {}) =>
    ctx.manager.pb.send<{ status: string; placements?: unknown[]; unplaced?: unknown[] }>(
      `/api/events/${ctx.event.id}/schedule/generate`,
      { method: 'POST', body },
    )

  it('M4-01: managers create, edit and deactivate tables; others cannot', async () => {
    const ctx = await setup({ tables: [] })
    const created = await ctx.manager.pb
      .collection('tables')
      .create({ event: ctx.event.id, name: 'Table A', active: true })
    await ctx.manager.pb.collection('tables').update(created.id, { name: 'Table A1' })
    // Table names are unique per event (database index).
    await expectDenied(
      ctx.manager.pb.collection('tables').create({ event: ctx.event.id, name: 'Table A1' }),
    )
    await expectDenied(coach.pb.collection('tables').create({ event: ctx.event.id, name: 'Nope' }))
    await ctx.manager.pb.collection('tables').update(created.id, { active: false })
    expect(
      await coach.pb.collection('tables').getFullList({ filter: `event = "${ctx.event.id}"` }),
    ).toHaveLength(1)
  })

  it('M4-02: a table restricted to categories rejects other categories', async () => {
    const ctx = await setup({ tables: ['Main'] })
    const other = await fx.category(ctx.event.id, { code: 'MS' })
    await ctx.manager.pb
      .collection('tables')
      .update(ctx.tables.Main!.id, { categories: [other.id] })
    const t = await team(ctx)
    await expectFieldError(
      scheduled(ctx, t, { table: 'Main', start: 0 }),
      'table',
      'incompatible_category',
    )
    await ctx.manager.pb
      .collection('tables')
      .update(ctx.tables.Main!.id, { categories: [other.id, ctx.category.id] })
    await scheduled(ctx, t, { table: 'Main', start: 0 })
  })

  it('M4-03: time slots must end after they start; the event is visible to coaches', async () => {
    const ctx = await setup()
    await expectFieldError(
      ctx.manager.pb.collection('time_slots').create({
        event: ctx.event.id,
        kind: 'play',
        starts_at: at(60),
        ends_at: at(30),
      }),
      'ends_at',
      'invalid_period',
    )
    expect(
      await coach.pb.collection('time_slots').getFullList({ filter: `event = "${ctx.event.id}"` }),
    ).toHaveLength(1)
  })

  it('M4-04 / M4-T05: a game overlapping a lunch break is rejected', async () => {
    const ctx = await setup({ breaks: [[60, 90]] })
    const t = await team(ctx)
    await expectFieldError(
      scheduled(ctx, t, { table: 'T1', start: 50 }),
      'starts_at',
      'unavailable',
    )
    await scheduled(ctx, t, { table: 'T1', start: 45 })
  })

  it('M4-05: a game can be assigned manually to a table and time (M4-T01)', async () => {
    const ctx = await setup()
    const game = await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    expect(game).toMatchObject({ table: ctx.tables.T1!.id })
    expect(game.starts_at).toMatch(/^2026-11-14 09:00:00/)
  })

  it('M4-T02: two simultaneous games on one table are rejected', async () => {
    const ctx = await setup()
    await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    await expectFieldError(
      scheduled(ctx, await team(ctx), { table: 'T1', start: 10 }),
      'table',
      'table_conflict',
    )
    // Back-to-back games on the same table are fine.
    await scheduled(ctx, await team(ctx), { table: 'T1', start: 15 })
  })

  it('M4-T03: one team in two simultaneous games is a conflict', async () => {
    const ctx = await setup()
    const t = await team(ctx)
    await scheduled(ctx, t, { table: 'T1', start: 0 })
    await expectFieldError(
      scheduled(ctx, t, { table: 'T2', start: 0 }),
      'starts_at',
      'team_conflict',
    )
  })

  it('M4-T04: a judge in two overlapping games is a conflict; judges need a judge role', async () => {
    const ctx = await setup()
    const judge = await fx.user({ roles: [{ role: 'judge', event: ctx.event.id }] })
    const outsider = await fx.user()
    await scheduled(ctx, await team(ctx), { table: 'T1', start: 0, judges: [judge.id] })
    await expectFieldError(
      scheduled(ctx, await team(ctx), { table: 'T2', start: 5, judges: [judge.id] }),
      'judges',
      'judge_conflict',
    )
    await expectFieldError(
      scheduled(ctx, await team(ctx), { table: 'T2', start: 5, judges: [outsider.id] }),
      'judges',
      'invalid_judge',
    )
    await scheduled(ctx, await team(ctx), { table: 'T2', start: 20, judges: [judge.id] })
  })

  it('M4-T07: the minimum rest interval of an event is respected', async () => {
    const ctx = await setup({ eventData: { min_rest_minutes: 10 } })
    const t = await team(ctx)
    await scheduled(ctx, t, { table: 'T1', start: 0 })
    await expectFieldError(
      scheduled(ctx, t, { table: 'T2', start: 20 }),
      'starts_at',
      'rest_interval',
    )
    // A second attempt of the same team in the same round is a separate game (M3-02).
    await scheduled(ctx, t, { table: 'T2', start: 25, attempt: 2 })
  })

  it('M4-T11: moving a game re-evaluates its conflicts', async () => {
    const ctx = await setup()
    await scheduled(ctx, await team(ctx), { table: 'T2', start: 0 })
    const game = await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    await expectFieldError(place(ctx, game, { table: 'T2', start: 0 }), 'table', 'table_conflict')
    await place(ctx, game, { table: 'T2', start: 30 })
  })

  it('M4-T12: two administrators editing one game: the stale change is refused', async () => {
    const ctx = await setup()
    const game = await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    await place(ctx, game, { table: 'T1', start: 30 }) // first editor succeeds
    // \`game.updated\` is still the value the second editor loaded.
    const error = await place(ctx, game, { table: 'T2', start: 30 }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)

    // Scores are not schedule changes and need no version check.
    await ctx.manager.pb.collection('games').update(game.id, { notes: 'checked' })
  })

  it('M4-11: a table with scheduled games cannot be deactivated or deleted', async () => {
    const ctx = await setup()
    await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    await expectFieldError(
      ctx.manager.pb.collection('tables').update(ctx.tables.T1!.id, { active: false }),
      'active',
      'table_in_use',
    )
    await expectDenied(ctx.manager.pb.collection('tables').delete(ctx.tables.T1!.id))
  })

  it('M4-06 / M4-F01: generation produces a valid schedule for the fairness fixture', async () => {
    const ctx = await setup({
      tables: ['T1', 'T2', 'T3'],
      play: [[0, 120]],
    })
    const teams: RecordModel[] = []
    for (let i = 0; i < 12; i++) teams.push(await team(ctx))
    for (const round of ['R1', 'R2']) {
      const r =
        round === 'R1'
          ? ctx.round
          : await ctx.manager.pb.collection('rounds').create({
              category: ctx.category.id,
              key: round,
              name: round,
              position: 2,
              duration_minutes: 15,
            })
      for (const t of teams) {
        await ctx.manager.pb.collection('games').create({
          round: r.id,
          team: t.id,
          status: 'scheduled',
        })
      }
    }

    const result = await generate(ctx)
    expect(result.status).toBe('complete')
    expect(result.placements).toHaveLength(24)

    const games = await ctx.manager.pb
      .collection('games')
      .getFullList({ filter: `round.category = "${ctx.category.id}"` })
    expect(games.every((g) => g.table && g.starts_at)).toBe(true)
    const issues = await ctx.manager.pb.send<{ issues: unknown[] }>(
      `/api/events/${ctx.event.id}/schedule/validation`,
      { method: 'GET' },
    )
    expect(issues.issues).toEqual([])
  })

  it('M4-T08: insufficient capacity returns a report and changes nothing', async () => {
    const ctx = await setup({ tables: ['T1'], play: [[0, 30]] })
    const games = []
    for (let i = 0; i < 3; i++) games.push(await scheduled(ctx, await team(ctx)))

    const error = await generate(ctx).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)
    const data = (error as ClientResponseError).response as { status: string; unplaced: unknown[] }
    expect(data.status).toBe('infeasible')
    expect(data.unplaced).toHaveLength(1)

    for (const g of games) {
      expect((await ctx.manager.pb.collection('games').getOne(g.id)).table).toBe('')
    }
  })

  it('a dry run returns the placements but stores nothing', async () => {
    const ctx = await setup()
    const game = await scheduled(ctx, await team(ctx))
    const result = await generate(ctx, { dry_run: true })
    expect(result).toMatchObject({ status: 'complete', dry_run: true })
    expect((await ctx.manager.pb.collection('games').getOne(game.id)).starts_at).toBe('')
  })

  it('M4-T09: regeneration keeps locked games unchanged', async () => {
    const ctx = await setup({ tables: ['T1'], play: [[0, 60]] })
    const locked = await scheduled(ctx, await team(ctx), { table: 'T1', start: 30, locked: true })
    const free = await scheduled(ctx, await team(ctx))
    const result = await generate(ctx)
    expect(result.status).toBe('complete')
    expect(result.placements).toHaveLength(1)
    const after = await ctx.manager.pb.collection('games').getOne(locked.id)
    expect(after.starts_at).toBe(locked.starts_at)
    const placed = await ctx.manager.pb.collection('games').getOne(free.id)
    expect(placed.starts_at).not.toBe('')
  })

  it('M4-T10: games on two days keep their correct dates', async () => {
    const ctx = await setup({
      play: [
        [0, 60],
        [24 * 60, 24 * 60 + 60],
      ],
    })
    const day2 = (minutes: number) => new Date(T0 + (24 * 60 + minutes) * MIN).toISOString()
    const game = await scheduled(ctx, await team(ctx), { table: 'T1', start: 0 })
    const later = await ctx.manager.pb.collection('games').create({
      round: ctx.round.id,
      team: (await team(ctx)).id,
      status: 'scheduled',
      table: ctx.tables.T1!.id,
      starts_at: day2(0),
    })
    expect(game.starts_at).toMatch(/^2026-11-14/)
    expect(later.starts_at).toMatch(/^2026-11-15 09:00:00/)
    expect(
      (
        await ctx.manager.pb.send<{ issues: unknown[] }>(
          `/api/events/${ctx.event.id}/schedule/validation`,
          { method: 'GET' },
        )
      ).issues,
    ).toEqual([])
  })

  it('only event managers may generate, and never for an archived event', async () => {
    const ctx = await setup()
    await expectDenied(
      coach.pb.send(`/api/events/${ctx.event.id}/schedule/generate`, { method: 'POST', body: {} }),
    )
    await expectDenied(
      coach.pb.send(`/api/events/${ctx.event.id}/schedule/validation`, { method: 'GET' }),
    )
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(generate(ctx))
  })
})
