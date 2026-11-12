import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// Points are entered directly (no ruleset), which keeps the scoring part of these tests short.
const RANKING = {
  schemaVersion: 1,
  precision: 0,
  rounds: [{ key: 'R1' }, { key: 'R2' }],
  calculations: [
    {
      id: 'total',
      label: 'Total',
      op: 'ADD',
      operands: [{ round: 'R1' }, { round: 'R2' }],
    },
  ],
  ranking: {
    keys: [{ source: { calc: 'total' }, field: 'points', order: 'desc', label: 'Total' }],
  },
}

interface PublicGame {
  id: string
  category: string
  round: string
  team: { id: string; name: string; organization: string; country: string }
  table: string
  sequence: number
  state: 'upcoming' | 'scoring' | 'in_review' | 'done'
}

interface PublicEvent {
  revision: number
  event: { id: string; name: string; status: string }
  days: { id: string; date: string; label: string }[]
  categories: {
    id: string
    name: string
    live: boolean
    official: { id: string; title: string; published_at: string } | null
  }[]
  tables: { id: string; name: string }[]
  rounds: { id: string; key: string; day: string; category: string }[]
  games: PublicGame[]
}

interface RankingEntry {
  team: string
  name: string
  rank: number | null
  provisional: boolean
  values: (number | null)[]
}

interface PublicRanking {
  revision: number
  category: { id: string; name: string }
  official: { title: string; fingerprint: string; result: { entries: RankingEntry[] } } | null
  live: { result: { entries: RankingEntry[] } } | null
  progress: { total: number; done: number; in_review: number }
  teams: Record<string, { name: string; organization: string; country: string }>
}

interface Ctx {
  event: RecordModel
  category: RecordModel
  days: RecordModel[]
  rounds: RecordModel[]
  teams: RecordModel[]
  /** games[round][team] */
  games: RecordModel[][]
  manager: TestUser
  headJudge: TestUser
  judge: TestUser
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ClientResponseError)
  expect((error as ClientResponseError).status).toBe(status)
}

describe('M6 live competition and public interface', () => {
  let server: TestServer
  let fx: Fixtures
  let guest: PocketBase

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    guest = server.client()
  })
  afterAll(() => server?.dispose())

  /** Two days (R1 on Saturday, R2 on Sunday), two teams, every game placed on one table. */
  async function setup(eventData: Record<string, unknown> = {}): Promise<Ctx> {
    const event = await fx.event(eventData)
    const category = await fx.category(event.id, { ranking: RANKING })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const days = [
      await fx.su
        .collection('competition_days')
        .create({ event: event.id, date: '2026-06-13', label: 'Saturday' }),
      await fx.su
        .collection('competition_days')
        .create({ event: event.id, date: '2026-06-14', label: 'Sunday' }),
    ]
    const table = await fx.su
      .collection('tables')
      .create({ event: event.id, name: 'Table A', active: true, judges: [judge.id] })
    const rounds = []
    for (const [i, key] of ['R1', 'R2'].entries()) {
      rounds.push(
        await fx.su.collection('rounds').create({
          category: category.id,
          key,
          name: `Round ${i + 1}`,
          position: i + 1,
          scoring_minutes: 10,
          day: days[i]!.id,
        }),
      )
    }
    const teams = [
      await fx.team(event.id, category.id, {
        status: 'approved',
        name: 'Alpha',
        organization: 'School A',
        country: 'CH',
        coach_email: 'secret-coach@test.local',
      }),
      await fx.team(event.id, category.id, { status: 'approved', name: 'Bravo' }),
    ]
    const games: RecordModel[][] = []
    for (const round of rounds) {
      const row = []
      for (const [i, team] of teams.entries()) {
        row.push(
          await fx.su.collection('games').create({
            round: round.id,
            team: team.id,
            status: 'scheduled',
            table: table.id,
            sequence: i + 1,
          }),
        )
      }
      games.push(row)
    }
    return { event, category, days, rounds, teams, games, manager, headJudge, judge }
  }

  const publicEvent = (id: string, pb = guest) =>
    pb.send<PublicEvent>(`/api/public/events/${id}`, { method: 'GET' })
  const publicRanking = (ctx: Ctx, pb = guest) =>
    pb.send<PublicRanking>(`/api/public/categories/${ctx.category.id}/ranking`, { method: 'GET' })

  async function score(ctx: Ctx, game: RecordModel, points: number) {
    const body = { outcome: 'completed', values: {}, time_ms: 0, points }
    await ctx.judge.pb.send(`/api/games/${game.id}/sheet/submit`, { method: 'POST', body })
  }
  async function approve(ctx: Ctx, game: RecordModel) {
    await ctx.headJudge.pb.send(`/api/games/${game.id}/sheet/approve`, { method: 'POST' })
  }
  async function finalize(ctx: Ctx, game: RecordModel, points: number) {
    await score(ctx, game, points)
    await approve(ctx, game)
  }

  const publish = (ctx: Ctx, data: Record<string, unknown>) =>
    ctx.manager.pb.collection('categories').update(ctx.category.id, data)

  async function snapshot(ctx: Ctx, title: string) {
    return ctx.manager.pb.send<RecordModel>(
      `/api/categories/${ctx.category.id}/ranking/snapshots`,
      { method: 'POST', body: { title } },
    )
  }

  const names = (r: { result: { entries: RankingEntry[] } } | null) =>
    r?.result.entries.map((e) => [e.name, e.rank, e.values[0]])

  it('migration: publication fields and one revision record per event', async () => {
    const categories = await fx.su.collections.getOne('categories')
    expect(categories.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'public_live',
        'published_snapshot',
        'results_published_at',
        'results_published_by',
      ]),
    )
    const revisions = await fx.su.collections.getOne('live_revisions')
    expect(revisions.indexes).toEqual([
      expect.stringContaining('UNIQUE INDEX `idx_live_revisions_event`'),
    ])
    const event = await fx.event()
    await expectDenied(fx.su.collection('live_revisions').create({ event: event.id, revision: 9 }))
  })

  it('M6-T04: results are hidden from the public until published; draft events are not public', async () => {
    const ctx = await setup()
    await finalize(ctx, ctx.games[0]![0]!, 40)
    const ranking = await publicRanking(ctx)
    expect(ranking.official).toBeNull()
    expect(ranking.live).toBeNull()
    // The raw data stays restricted.
    await expectDenied(guest.collection('games').getOne(ctx.games[0]![0]!.id))
    expect(await guest.collection('ranking_snapshots').getFullList()).toHaveLength(0)
    expect(await guest.collection('teams').getFullList()).toHaveLength(0)

    const draft = await setup({ status: 'draft' })
    await expectStatus(publicEvent(draft.event.id), 404)
    await expectStatus(publicRanking(draft), 404)
    const events = await guest.send<{ id: string }[]>('/api/public/events', { method: 'GET' })
    expect(events.map((e) => e.id)).toContain(ctx.event.id)
    expect(events.map((e) => e.id)).not.toContain(draft.event.id)
  })

  it('M6-04 / M6-08: the public schedule lists games with table, sequence and state, without private data', async () => {
    const ctx = await setup()
    await finalize(ctx, ctx.games[0]![0]!, 40)
    await score(ctx, ctx.games[0]![1]!, 30)
    const payload = await publicEvent(ctx.event.id)
    expect(payload.event.name).toBe(ctx.event.name)
    expect(payload.days.map((d) => d.label)).toEqual(['Saturday', 'Sunday'])
    expect(payload.tables.map((t) => t.name)).toEqual(['Table A'])
    expect(payload.rounds.map((r) => [r.key, r.day])).toEqual([
      ['R1', ctx.days[0]!.id],
      ['R2', ctx.days[1]!.id],
    ])
    const state = Object.fromEntries(payload.games.map((g) => [g.id, g.state]))
    expect(state).toEqual({
      [ctx.games[0]![0]!.id]: 'done',
      [ctx.games[0]![1]!.id]: 'in_review',
      [ctx.games[1]![0]!.id]: 'upcoming',
      [ctx.games[1]![1]!.id]: 'upcoming',
    })
    const alpha = payload.games.find((g) => g.id === ctx.games[0]![0]!.id)!
    expect(alpha).toMatchObject({ sequence: 1, team: { name: 'Alpha', organization: 'School A' } })
    // No results, values or contact data in the public payload.
    const text = JSON.stringify(payload)
    expect(text).not.toContain('secret-coach')
    expect(text).not.toContain('Lovelace')
    expect(text).not.toContain('"points"')
    expect(payload.categories[0]).toMatchObject({ live: false, official: null })
  })

  it('M6-01 / M6-T01 / M6-02: the live ranking updates after a finalized score and marks incomplete results', async () => {
    const ctx = await setup()
    await publish(ctx, { public_live: true })
    let ranking = await publicRanking(ctx)
    expect(ranking.progress).toEqual({ total: 4, done: 0, in_review: 0 })
    expect(ranking.live!.result.entries.every((e) => e.provisional)).toBe(true)

    // A submitted score is not counted before approval.
    await score(ctx, ctx.games[0]![1]!, 30)
    ranking = await publicRanking(ctx)
    expect(ranking.progress).toMatchObject({ done: 0, in_review: 1 })
    // Missing rounds count as zero (policy default): everyone shares rank 1.
    expect(names(ranking.live)).toEqual([
      ['Alpha', 1, 0],
      ['Bravo', 1, 0],
    ])

    await approve(ctx, ctx.games[0]![1]!)
    ranking = await publicRanking(ctx)
    expect(ranking.progress).toMatchObject({ done: 1, in_review: 0 })
    expect(names(ranking.live)).toEqual([
      ['Bravo', 1, 30],
      ['Alpha', 2, 0],
    ])
    expect(ranking.live!.result.entries.every((e) => e.provisional)).toBe(true)
    expect(ranking.teams[ctx.teams[0]!.id]).toMatchObject({ organization: 'School A' })

    for (const game of [ctx.games[0]![0]!, ...ctx.games[1]!]) await finalize(ctx, game, 25)
    ranking = await publicRanking(ctx)
    expect(ranking.progress).toEqual({ total: 4, done: 4, in_review: 0 })
    expect(names(ranking.live)).toEqual([
      ['Bravo', 1, 55],
      ['Alpha', 2, 50],
    ])
    expect(ranking.live!.result.entries.some((e) => e.provisional)).toBe(false)
  })

  it('M6-T02: an authorized correction recalculates the live ranking', async () => {
    const ctx = await setup()
    await publish(ctx, { public_live: true })
    await finalize(ctx, ctx.games[0]![0]!, 40)
    await finalize(ctx, ctx.games[0]![1]!, 30)
    expect(names((await publicRanking(ctx)).live)?.[0]).toEqual(['Alpha', 1, 40])
    await ctx.headJudge.pb.send(`/api/games/${ctx.games[0]![0]!.id}/sheet/correct`, {
      method: 'POST',
      body: { reason: 'Miscounted', outcome: 'completed', values: {}, time_ms: 0, points: 10 },
    })
    expect(names((await publicRanking(ctx)).live)).toEqual([
      ['Bravo', 1, 30],
      ['Alpha', 2, 10],
    ])
  })

  it('M6-10 / M6-T03: a manager publishes an official ranking; later corrections do not change it', async () => {
    const ctx = await setup()
    await finalize(ctx, ctx.games[0]![0]!, 40)
    await finalize(ctx, ctx.games[0]![1]!, 30)
    const snap = await snapshot(ctx, 'Official day 1')
    // Snapshots alone are not public.
    expect((await publicRanking(ctx)).official).toBeNull()

    const updated = await publish(ctx, { published_snapshot: snap.id })
    expect(updated.results_published_by).toBe(ctx.manager.id)
    expect(updated.results_published_at).not.toBe('')
    const ranking = await publicRanking(ctx)
    expect(ranking.official).toMatchObject({
      title: 'Official day 1',
      fingerprint: snap.fingerprint,
    })
    expect(names(ranking.official)).toEqual([
      ['Alpha', 1, 40],
      ['Bravo', 2, 30],
    ])
    expect(ranking.live).toBeNull()
    const event = await publicEvent(ctx.event.id)
    expect(event.categories[0]!.official).toMatchObject({ id: snap.id, title: 'Official day 1' })

    await ctx.headJudge.pb.send(`/api/games/${ctx.games[0]![0]!.id}/sheet/correct`, {
      method: 'POST',
      body: { reason: 'Miscounted', outcome: 'completed', values: {}, time_ms: 0, points: 10 },
    })
    expect(names((await publicRanking(ctx)).official)?.[0]).toEqual(['Alpha', 1, 40])

    // Unpublishing hides it again.
    const hidden = await publish(ctx, { published_snapshot: '' })
    expect(hidden.results_published_at).toBe('')
    expect((await publicRanking(ctx)).official).toBeNull()
  })

  it('M6-10: only managers publish, only snapshots of the category, timestamps are set by the server', async () => {
    const ctx = await setup()
    const other = await setup()
    const own = await snapshot(ctx, 'Mine')
    const foreign = await snapshot(other, 'Other')
    await expectFieldError(
      publish(ctx, { published_snapshot: foreign.id }),
      'published_snapshot',
      'invalid_snapshot',
    )
    for (const user of [ctx.judge, ctx.headJudge]) {
      await expectDenied(
        user.pb.collection('categories').update(ctx.category.id, { published_snapshot: own.id }),
      )
      await expectDenied(
        user.pb.collection('categories').update(ctx.category.id, { public_live: true }),
      )
    }
    const forged = await publish(ctx, {
      public_live: true,
      results_published_at: '2020-01-01 00:00:00.000Z',
      results_published_by: ctx.judge.id,
    })
    expect(forged.results_published_at).toBe('')
    expect(forged.results_published_by).toBe('')
  })

  it('realtime: committed changes increase the public revision of the event', async () => {
    const ctx = await setup()
    const rev = async () =>
      (await guest.collection('live_revisions').getFirstListItem(`event = "${ctx.event.id}"`))
        .revision as number
    const start = await rev()
    expect(start).toBeGreaterThan(0)
    expect((await publicEvent(ctx.event.id)).revision).toBe(start)

    await ctx.judge.pb.send(`/api/games/${ctx.games[0]![0]!.id}/sheet`, {
      method: 'PUT',
      body: { outcome: 'completed', values: {}, points: 1, client_saved_at: 1 },
    })
    const afterFirstSave = await rev()
    expect(afterFirstSave).toBeGreaterThan(start)
    // Further autosaves of the draft change nothing public.
    await ctx.judge.pb.send(`/api/games/${ctx.games[0]![0]!.id}/sheet`, {
      method: 'PUT',
      body: { outcome: 'completed', values: {}, points: 2, client_saved_at: 2 },
    })
    expect(await rev()).toBe(afterFirstSave)

    await finalize(ctx, ctx.games[0]![0]!, 40)
    expect(await rev()).toBeGreaterThan(afterFirstSave)

    // Revisions of draft events are not readable by guests; nobody can write them.
    const draft = await setup({ status: 'draft' })
    expect(
      await guest
        .collection('live_revisions')
        .getFullList({ filter: `event = "${draft.event.id}"` }),
    ).toHaveLength(0)
    const record = await ctx.manager.pb
      .collection('live_revisions')
      .getFirstListItem(`event = "${ctx.event.id}"`)
    await expectDenied(
      ctx.manager.pb.collection('live_revisions').update(record.id, { revision: 0 }),
    )
  })

  it('M6-T09: refreshing returns the same published data', async () => {
    const ctx = await setup()
    await finalize(ctx, ctx.games[0]![0]!, 40)
    const snap = await snapshot(ctx, 'Official')
    await publish(ctx, { published_snapshot: snap.id, public_live: true })
    const first = await publicRanking(ctx)
    const second = await publicRanking(ctx)
    expect(second).toEqual(first)
    expect(await publicEvent(ctx.event.id)).toEqual(await publicEvent(ctx.event.id))
  })

  it('M6-09 / M6-T08: the competition resumes after a restart with all results preserved', async () => {
    const restartServer = await startPocketBase()
    try {
      const rfx = await Fixtures.create(restartServer)
      const event = await rfx.event()
      const category = await rfx.category(event.id, { ranking: RANKING })
      const manager = await rfx.user({ roles: [{ role: 'event_manager', event: event.id }] })
      const team = await rfx.team(event.id, category.id, { status: 'approved', name: 'Alpha' })
      const r1 = await rfx.su.collection('rounds').create({
        category: category.id,
        key: 'R1',
        name: 'Round 1',
        position: 1,
        scoring_minutes: 5,
      })
      const r2 = await rfx.su.collection('rounds').create({
        category: category.id,
        key: 'R2',
        name: 'Round 2',
        position: 2,
        scoring_minutes: 5,
      })
      await rfx.su
        .collection('games')
        .create({ round: r1.id, team: team.id, status: 'completed', points: 40 })
      const open = await rfx.su
        .collection('games')
        .create({ round: r2.id, team: team.id, status: 'scheduled' })
      const snap = await manager.pb.send<RecordModel>(
        `/api/categories/${category.id}/ranking/snapshots`,
        { method: 'POST', body: { title: 'Day 1' } },
      )
      await manager.pb
        .collection('categories')
        .update(category.id, { published_snapshot: snap.id, public_live: true })
      const url = `/api/public/categories/${category.id}/ranking`
      const before = await restartServer.client().send<PublicRanking>(url, { method: 'GET' })

      // Overnight break.
      await restartServer.stop()
      const resumed = await startPocketBase({ dataDir: restartServer.dataDir })
      try {
        const after = await resumed.client().send<PublicRanking>(url, { method: 'GET' })
        expect(after).toEqual(before)
        expect(after.progress).toEqual({ total: 2, done: 1, in_review: 0 })

        // Day 2 continues where day 1 stopped.
        const su = await resumed.superuserClient()
        await su.collection('games').update(open.id, { status: 'completed', points: 20 })
        const next = await resumed.client().send<PublicRanking>(url, { method: 'GET' })
        expect(names(next.live)).toEqual([['Alpha', 1, 60]])
        expect(names(next.official)).toEqual([['Alpha', 1, 40]])
        expect(next.revision).toBeGreaterThan(before.revision)
      } finally {
        await resumed.dispose()
      }
    } finally {
      await restartServer.dispose()
    }
  })
})
