import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError, type RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

interface Ctx {
  event: RecordModel
  category: RecordModel
  manager: TestUser
  judge: TestUser
  round: RecordModel
  tables: Record<string, RecordModel>
}

interface SetupOptions {
  tables?: string[]
  assignJudge?: boolean
  testingMinutes?: number
  scoringMinutes?: number
}

describe('M5 round and table scheduling', () => {
  let server: TestServer
  let fx: Fixtures
  let coach: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    coach = await fx.user()
  })
  afterAll(() => server?.dispose())

  async function setup(options: SetupOptions = {}): Promise<Ctx> {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: options.testingMinutes ?? 20,
      scoring_minutes: options.scoringMinutes ?? 10,
    })
    const tables: Record<string, RecordModel> = {}
    for (const name of options.tables ?? ['T1', 'T2']) {
      tables[name] = await manager.pb.collection('tables').create({
        event: event.id,
        name,
        active: true,
        position: Object.keys(tables).length,
        judge: options.assignJudge === false ? '' : judge.id,
      })
    }
    return { event, category, manager, judge, round, tables }
  }

  const team = (ctx: Ctx, data: Record<string, unknown> = {}) =>
    fx.team(ctx.event.id, ctx.category.id, { status: 'approved', ...data })

  const game = (ctx: Ctx, t: RecordModel, data: Record<string, unknown> = {}) =>
    ctx.manager.pb.collection('games').create({
      round: ctx.round.id,
      team: t.id,
      status: 'scheduled',
      ...data,
    })

  const assign = (ctx: Ctx, record: RecordModel, table: string, sequence: number) =>
    ctx.manager.pb.collection('games').update(record.id, {
      table: ctx.tables[table]!.id,
      sequence,
      expected_updated: record.updated,
    })

  const generate = (ctx: Ctx, body: Record<string, unknown> = {}) =>
    ctx.manager.pb.send<{
      status: string
      placements?: { gameId: string; table: string; sequence: number }[]
      unplaced?: { label?: string; reasons: string[] }[]
      created_games?: number
      dry_run?: boolean
    }>(`/api/events/${ctx.event.id}/schedule/generate`, { method: 'POST', body })

  it('rounds store shared testing and scoring durations', async () => {
    const ctx = await setup({ testingMinutes: 25, scoringMinutes: 12 })
    expect(ctx.round).toMatchObject({ testing_minutes: 25, scoring_minutes: 12 })
  })

  it('tables require an event judge and retain category restrictions', async () => {
    const ctx = await setup({ tables: [] })
    const created = await ctx.manager.pb.collection('tables').create({
      event: ctx.event.id,
      name: 'Table A',
      active: true,
      categories: [ctx.category.id],
      judge: ctx.judge.id,
    })
    expect(created.judge).toBe(ctx.judge.id)
    const outsider = await fx.user()
    await expectFieldError(
      ctx.manager.pb.collection('tables').create({
        event: ctx.event.id,
        name: 'Invalid Table',
        active: true,
        judge: outsider.id,
      }),
      'judge',
      'invalid_judge',
    )
    const another = await fx.category(ctx.event.id, { code: 'OTHER' })
    await ctx.manager.pb.collection('tables').update(created.id, { categories: [another.id] })
    await expectFieldError(
      game(ctx, await team(ctx), { table: created.id, sequence: 1 }),
      'table',
      'incompatible_category',
    )
  })

  it('games can be assigned a table and a unique per-round sequence', async () => {
    const ctx = await setup({ tables: ['T1'] })
    const first = await game(ctx, await team(ctx))
    const second = await game(ctx, await team(ctx))
    await assign(ctx, first, 'T1', 1)
    await expectFieldError(assign(ctx, second, 'T1', 1), 'sequence', 'sequence_in_use')
    const assigned = await assign(ctx, second, 'T1', 2)
    expect(assigned).toMatchObject({ table: ctx.tables.T1!.id, sequence: 2 })
  })

  it('schedule generation previews and atomically creates and assigns missing games', async () => {
    const ctx = await setup()
    const teams = [await team(ctx), await team(ctx), await team(ctx)]
    const secondRound = await ctx.manager.pb.collection('rounds').create({
      category: ctx.category.id,
      key: 'R2',
      name: 'Round 2',
      position: 2,
      testing_minutes: 15,
      scoring_minutes: 8,
    })
    const preview = await generate(ctx, { dry_run: true })
    expect(preview).toMatchObject({ status: 'complete', dry_run: true, created_games: 6 })
    expect(preview.placements).toHaveLength(6)
    expect(await ctx.manager.pb.collection('games').getFullList()).toHaveLength(0)

    const result = await generate(ctx)
    expect(result).toMatchObject({ status: 'complete', created_games: 6 })
    const games = await ctx.manager.pb.collection('games').getFullList()
    expect(games).toHaveLength(6)
    expect(games.every((record) => record.table && record.sequence > 0)).toBe(true)
    for (const t of teams) {
      expect(
        games
          .filter((record) => record.team === t.id)
          .map((record) => record.round)
          .sort(),
      ).toEqual([ctx.round.id, secondRound.id].sort())
    }
    expect(await generate(ctx)).toMatchObject({ status: 'complete', created_games: 0 })
    expect(await ctx.manager.pb.collection('games').getFullList()).toHaveLength(6)
  })

  it('infeasible generation reports unassigned teams without creating games', async () => {
    const ctx = await setup({ tables: [], assignJudge: false })
    const t = await team(ctx)
    const error = await generate(ctx).then(
      () => null,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)
    expect((error as ClientResponseError).response).toMatchObject({
      status: 'infeasible',
      unplaced: [expect.objectContaining({ label: t.name, reasons: ['no_active_table'] })],
    })
    expect(await ctx.manager.pb.collection('games').getFullList()).toHaveLength(0)
  })

  it('generation requires a judge on a compatible table', async () => {
    const ctx = await setup({ assignJudge: false })
    await team(ctx)
    const result = await generate(ctx).then(
      () => null,
      (e: unknown) => e,
    )
    expect(result).toBeInstanceOf(ClientResponseError)
    expect((result as ClientResponseError).response).toMatchObject({
      status: 'infeasible',
      unplaced: [expect.objectContaining({ reasons: ['missing_table_judge'] })],
    })
    expect(await ctx.manager.pb.collection('games').getFullList()).toHaveLength(0)
  })

  it('table and sequence changes reject stale versions', async () => {
    const ctx = await setup({ tables: ['T1', 'T2'] })
    const record = await game(ctx, await team(ctx))
    await assign(ctx, record, 'T1', 1)
    const stale = await ctx.manager.pb.collection('games').getOne(record.id)
    await assign(ctx, stale, 'T2', 1)
    const error = await ctx.manager.pb
      .collection('games')
      .update(record.id, {
        table: ctx.tables.T1!.id,
        sequence: 2,
        expected_updated: stale.updated,
      })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)
  })

  it('only event managers can schedule; event staff may view the validation list', async () => {
    const ctx = await setup()
    const judge = await fx.user({ roles: [{ role: 'head_judge', event: ctx.event.id }] })
    await expectDenied(
      judge.pb.send(`/api/events/${ctx.event.id}/schedule/generate`, {
        method: 'POST',
        body: {},
      }),
    )
    expect(
      await judge.pb.send<{ issues: unknown[] }>(
        `/api/events/${ctx.event.id}/schedule/validation`,
        {
          method: 'GET',
        },
      ),
    ).toMatchObject({ issues: [] })
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(generate(ctx))
  })

  it('reports unassigned games during validation', async () => {
    const ctx = await setup()
    await game(ctx, await team(ctx))
    const result = await ctx.manager.pb.send<{ issues: { code: string }[] }>(
      `/api/events/${ctx.event.id}/schedule/validation`,
      { method: 'GET' },
    )
    expect(result.issues).toEqual([expect.objectContaining({ code: 'missing_table' })])
  })

  it('lets coaches read only their own scheduled games', async () => {
    const ctx = await setup()
    const coach = await fx.user()
    const ownTeam = await team(ctx, { coach: coach.id })
    await generate(ctx)

    const schedule = await coach.pb.send<
      {
        team: string
        sequence: number
        expand: { team: { name: string }; table: { name: string } }
      }[]
    >(`/api/users/${coach.id}/schedule`, { method: 'GET' })
    expect(schedule).toHaveLength(1)
    expect(schedule[0]).toMatchObject({
      team: ownTeam.id,
      sequence: 1,
      expand: { team: { name: ownTeam.name }, table: { name: 'T1' } },
    })

    const other = await fx.user()
    await expectDenied(other.pb.send(`/api/users/${coach.id}/schedule`, { method: 'GET' }))
  })
})
