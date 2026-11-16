import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import type { Ranking, RankingConfig } from '@judge26/ranking-engine'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// M10-C: time for zero-point runs and run time precision (docs/specifications/M10-times.md).

const RANKING: RankingConfig = {
  schemaVersion: 1,
  rounds: [{ key: 'R1' }],
  ranking: {
    keys: [
      { source: { round: 'R1' }, field: 'points', order: 'desc', label: 'Points' },
      { source: { round: 'R1' }, field: 'time', order: 'asc', label: 'Time' },
    ],
  },
}

const definition = (extra: object = {}) => ({
  schemaVersion: 1,
  ...extra,
  root: {
    id: 'root',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'flag', label: 'Flag', type: 'boolean', points: 10 }],
  },
})

describe('M10-C run times', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(eventData: Record<string, unknown> = {}) {
    const event = await fx.event(eventData)
    const category = await fx.category(event.id, { ranking: RANKING, public_live: true })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const round = await fx.su.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
    })
    const table = await fx.su
      .collection('tables')
      .create({ event: event.id, name: 'A', active: true, position: 1, judges: [judge.id] })
    return { event, category, manager, headJudge, judge, round, table }
  }
  type Ctx = Awaited<ReturnType<typeof setup>>

  const publishRuleset = (ctx: Ctx, extra: object = {}) =>
    fx.su
      .collection('rulesets')
      .create({ category: ctx.category.id, status: 'published', definition: definition(extra) })

  async function playedGame(ctx: Ctx, name: string, sequence: number) {
    const team = await fx.team(ctx.event.id, ctx.category.id, { name, status: 'approved' })
    return fx.su.collection('games').create({
      round: ctx.round.id,
      team: team.id,
      status: 'scheduled',
      table: ctx.table.id,
      sequence,
    })
  }

  /** The judge submits, the head judge approves (M5). */
  async function finalize(ctx: Ctx, game: RecordModel, flag: boolean, timeMs: number) {
    await ctx.judge.pb.send(`/api/games/${game.id}/sheet/submit`, {
      method: 'POST',
      body: { outcome: 'completed', values: { flag }, time_ms: timeMs },
    })
    await ctx.headJudge.pb.send(`/api/games/${game.id}/sheet/approve`, { method: 'POST', body: {} })
    return fx.su.collection('games').getOne(game.id)
  }

  const sheetOf = (user: TestUser, game: RecordModel) =>
    user.pb.send<{
      event: { time_decimals: number }
      sheet: { time_ms: number }
      history: { action: string; after: { time_ms: number } | null }[]
    }>(`/api/games/${game.id}/sheet`, {})

  const liveRanking = (ctx: Ctx) =>
    fx.su.send<{ live: { config: RankingConfig; result: Ranking } }>(
      `/api/public/categories/${ctx.category.id}/ranking`,
      {},
    )

  describe('M10-18 time for zero-point runs', () => {
    it('M10-T27: a zero-point run counts with 120 s; the sheet keeps the measured 43 s', async () => {
      const ctx = await setup()
      await publishRuleset(ctx, { zeroPointsTimeMs: 120_000 })
      const game = await playedGame(ctx, 'Zero', 1)
      const result = await finalize(ctx, game, false, 43_000)
      expect([result.points, result.time_ms]).toEqual([0, 120_000])
      const sheet = await sheetOf(ctx.headJudge, game)
      expect(sheet.sheet.time_ms).toBe(43_000)
      expect(sheet.history.find((h) => h.action === 'submitted')?.after?.time_ms).toBe(43_000)
    })

    it('M10-T28: with points, or without the option, the measured time counts', async () => {
      const ctx = await setup()
      await publishRuleset(ctx, { zeroPointsTimeMs: 120_000 })
      const scored = await finalize(ctx, await playedGame(ctx, 'Scored', 1), true, 43_000)
      expect([scored.points, scored.time_ms]).toEqual([10, 43_000])

      const off = await setup()
      await publishRuleset(off)
      const zero = await finalize(off, await playedGame(off, 'Zero off', 1), false, 43_000)
      expect([zero.points, zero.time_ms]).toEqual([0, 43_000])
    })

    it('M10-T29: results under an earlier ruleset version do not change', async () => {
      const ctx = await setup()
      const v1 = await publishRuleset(ctx)
      const game = await playedGame(ctx, 'Old', 1)
      const before = await finalize(ctx, game, false, 43_000)
      expect(before.time_ms).toBe(43_000)
      // A newer version turns the option on; the finalized game keeps its version's rule,
      // even when the game is saved again.
      await fx.su
        .collection('rulesets')
        .update(v1.id, { status: 'archived' })
        .catch(() => null)
      await publishRuleset(ctx, { zeroPointsTimeMs: 120_000 })
      await fx.su.collection('games').update(game.id, { attempt: 1 })
      const after = await fx.su.collection('games').getOne(game.id)
      expect([after.ruleset, after.time_ms]).toEqual([v1.id, 43_000])
    })

    it('a ruleset with an invalid option cannot be published (drafts may be incomplete)', async () => {
      const ctx = await setup()
      await expectFieldError(publishRuleset(ctx, { zeroPointsTimeMs: -5 }), 'definition')
    })
  })

  describe('M10-19 / M10-20 time precision', () => {
    async function twoRuns(ctx: Ctx) {
      await publishRuleset(ctx)
      await finalize(ctx, await playedGame(ctx, 'Fast', 1), true, 95_100)
      await finalize(ctx, await playedGame(ctx, 'Slow', 2), true, 95_900)
    }

    it('M10-T31: at whole seconds 95.1 s and 95.9 s tie on time; at tenths they do not', async () => {
      const ctx = await setup()
      await twoRuns(ctx)
      let live = (await liveRanking(ctx)).live
      expect(live.config.timeResolutionMs).toBe(1000)
      expect(live.result.entries.map((e) => [e.name, e.rank, e.values[1]])).toEqual([
        ['Fast', 1, 95_000],
        ['Slow', 1, 95_000],
      ])

      // M10-T32: changing the precision recalculates the live ranking …
      const snap = await ctx.manager.pb.send<
        RecordModel & { config: RankingConfig; result: Ranking }
      >(`/api/categories/${ctx.category.id}/ranking/snapshots`, {
        method: 'POST',
        body: { title: 'Whole seconds' },
      })
      await ctx.manager.pb.collection('events').update(ctx.event.id, { time_decimals: 1 })
      live = (await liveRanking(ctx)).live
      expect(live.config.timeResolutionMs).toBe(100)
      expect(live.result.entries.map((e) => [e.name, e.rank, e.values[1]])).toEqual([
        ['Fast', 1, 95_100],
        ['Slow', 2, 95_900],
      ])
      // … and leaves the snapshot as it was published, with the configuration it used.
      const stored = await fx.su.collection('ranking_snapshots').getOne(snap.id)
      expect(stored.config.timeResolutionMs).toBe(1000)
      expect(stored.result.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 1])
      // The measured milliseconds stay stored.
      const games = await fx.su.collection('games').getFullList({
        filter: `round = "${ctx.round.id}"`,
        sort: 'sequence',
      })
      expect(games.map((g) => g.time_ms)).toEqual([95_100, 95_900])
    })

    it('M10-19: the score sheet and the judge dashboard get the event’s decimals', async () => {
      const ctx = await setup({ time_decimals: 2 })
      const game = await playedGame(ctx, 'Team', 1)
      expect((await sheetOf(ctx.judge, game)).event.time_decimals).toBe(2)
      const rows = await ctx.judge.pb.send<{ event: { time_decimals: number } }[]>(
        '/api/judging/assignments',
        {},
      )
      expect(rows[0]!.event.time_decimals).toBe(2)
    })

    it('M10-19: decimals are 0 to 3; templates carry them', async () => {
      const ctx = await setup()
      await expectFieldError(
        ctx.manager.pb.collection('events').update(ctx.event.id, { time_decimals: 4 }),
        'time_decimals',
      )
      await ctx.manager.pb.collection('events').update(ctx.event.id, { time_decimals: 3 })
      const admin = await fx.admin()
      const template = await admin.pb.send<{ event: { time_decimals: number } }>(
        `/api/events/${ctx.event.id}/template`,
        { method: 'GET' },
      )
      expect(template.event.time_decimals).toBe(3)
      const stored = await admin.pb.send<RecordModel>('/api/event-templates', {
        method: 'POST',
        body: { content: JSON.stringify(template), name: 'Milliseconds' },
      })
      const created = await admin.pb.send<RecordModel>(`/api/event-templates/${stored.id}/events`, {
        method: 'POST',
        body: { name: 'From template', first_day: '2027-05-15' },
      })
      expect(created.time_decimals).toBe(3)
    })
  })
})
