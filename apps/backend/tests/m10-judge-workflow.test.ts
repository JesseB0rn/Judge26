import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { ClientResponseError, RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// M10-A: judge workflow at the table — team sign-off (M10-06) and head judges stepping in at a
// table (M10-07). See docs/specifications/M5-judging.md.

const RULESET = {
  schemaVersion: 1,
  root: {
    id: 'root',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'flag', label: 'Flag', type: 'boolean', points: 10 }],
  },
}

interface Sheet {
  status: string
  team_confirmed_at: string
  team_refused_at: string
  team_refusal_reason: string
  judge: { id: string }
  submitted_by: { id: string }
}

describe('M10-A judge workflow', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(eventData: Record<string, unknown> = {}) {
    const event = await fx.event(eventData)
    const category = await fx.category(event.id, { code: 'RMJ' })
    const headJudge = await fx.user({
      name: 'Hedda',
      roles: [{ role: 'head_judge', event: event.id }],
    })
    const judge = await fx.user({ name: 'Judy', roles: [{ role: 'judge', event: event.id }] })
    const round = await fx.su
      .collection('rounds')
      .create({ category: category.id, key: 'R1', name: 'Round 1', position: 1 })
    await fx.su
      .collection('rulesets')
      .create({ category: category.id, status: 'published', definition: RULESET })
    const table = await fx.su.collection('tables').create({
      event: event.id,
      name: 'Table 3',
      active: true,
      position: 1,
      categories: [category.id],
      judges: [judge.id],
    })
    const games: RecordModel[] = []
    for (const [i, name] of ['Alpha', 'Bravo'].entries()) {
      const team = await fx.team(event.id, category.id, { name, status: 'approved' })
      games.push(
        await fx.su.collection('games').create({
          round: round.id,
          team: team.id,
          status: 'scheduled',
          table: table.id,
          sequence: i + 1,
        }),
      )
    }
    return { event, category, headJudge, judge, round, table, games }
  }
  type Ctx = Awaited<ReturnType<typeof setup>>

  const submit = (user: TestUser, game: RecordModel, body: Record<string, unknown>) =>
    user.pb.send<{ sheet: Sheet }>(`/api/games/${game.id}/sheet/submit`, {
      method: 'POST',
      body: { outcome: 'completed', values: { flag: true }, time_ms: 1000, ...body },
    })
  const action = (user: TestUser, game: RecordModel, name: string, body = {}) =>
    user.pb.send<{ sheet: Sheet }>(`/api/games/${game.id}/sheet/${name}`, {
      method: 'POST',
      body,
    })

  async function refusal(promise: Promise<unknown>) {
    const error = (await expectDenied(promise)) as ClientResponseError
    expect(error.status).toBe(400)
    return Object.fromEntries(
      Object.entries(error.response.data as Record<string, { code: string }>).map(([k, v]) => [
        k,
        v.code,
      ]),
    )
  }

  describe('M10-06 team sign-off', () => {
    it('M10-T07: a submission without confirmation or refusal is refused', async () => {
      const ctx = await setup()
      expect(await refusal(submit(ctx.judge, ctx.games[0]!, {}))).toEqual({
        team_confirmation: 'required',
      })
      // Absent teams cannot sign; no confirmation is needed.
      const absent = await submit(ctx.judge, ctx.games[1]!, { outcome: 'absent' })
      expect(absent.sheet.status).toBe('submitted')
    })

    it('M10-T08: a confirmed submission stores the time; a mulligan clears it', async () => {
      const ctx = await setup()
      const before = Date.now()
      const { sheet } = await submit(ctx.judge, ctx.games[0]!, { team_confirmation: 'confirmed' })
      expect(new Date(sheet.team_confirmed_at.replace(' ', 'T')).getTime()).toBeGreaterThanOrEqual(
        before - 2000,
      )
      const after = await action(ctx.headJudge, ctx.games[0]!, 'mulligan', {
        reason: 'Field fault',
      })
      expect(after.sheet.team_confirmed_at).toBe('')
    })

    it('M10-T09: refusals need the event setting and a reason', async () => {
      const off = await setup()
      expect(
        await refusal(
          submit(off.judge, off.games[0]!, { team_confirmation: 'refused', refusal_reason: 'No' }),
        ),
      ).toEqual({ refusal: 'not_allowed' })

      const on = await setup({ allow_team_refusal: true })
      expect(
        await refusal(submit(on.judge, on.games[0]!, { team_confirmation: 'refused' })),
      ).toEqual({ reason: 'required' })
      const { sheet } = await submit(on.judge, on.games[0]!, {
        team_confirmation: 'refused',
        refusal_reason: 'Team disputes the flag',
      })
      expect([sheet.status, sheet.team_refusal_reason, sheet.team_confirmed_at]).toEqual([
        'submitted',
        'Team disputes the flag',
        '',
      ])
      expect(sheet.team_refused_at).not.toBe('')
      // Returned to the judge: the team signs again on resubmission.
      const returned = await action(on.headJudge, on.games[0]!, 'reject', { reason: 'Recount' })
      expect([returned.sheet.team_refused_at, returned.sheet.team_refusal_reason]).toEqual(['', ''])
    })

    it('the sheet payload tells the app whether refusals are allowed', async () => {
      const ctx = await setup({ allow_team_refusal: true })
      const payload = await ctx.judge.pb.send<{ event: { allow_team_refusal: boolean } }>(
        `/api/games/${ctx.games[0]!.id}/sheet`,
        {},
      )
      expect(payload.event.allow_team_refusal).toBe(true)
    })
  })

  describe('M10-07 head judge at a table', () => {
    interface TableRow {
      id: string
      name: string
      category: { code: string } | null
      judges: { name: string }[]
      progress: { done: number; total: number }
    }
    const tables = (user: TestUser) => user.pb.send<TableRow[]>('/api/judging/tables', {})
    const atTable = (user: TestUser, ctx: Ctx) =>
      user.pb.send<{ id: string; team: { name: string } }[]>(
        `/api/judging/assignments?table=${ctx.table.id}`,
        {},
      )

    it('lists the event’s tables with category, judges and progress', async () => {
      const ctx = await setup()
      await submit(ctx.judge, ctx.games[0]!, { team_confirmation: 'confirmed' })
      const rows = (await tables(ctx.headJudge)).filter((r) => r.id === ctx.table.id)
      expect(rows).toEqual([
        {
          id: ctx.table.id,
          name: 'Table 3',
          event: { id: ctx.event.id, name: ctx.event.name },
          category: { id: ctx.category.id, name: ctx.category.name, code: 'RMJ' },
          judges: [{ id: ctx.judge.id, name: 'Judy' }],
          progress: { done: 1, total: 2 },
        },
      ])
    })

    it('M10-T10: the head judge scores at the table; the board stays unchanged', async () => {
      const ctx = await setup()
      const games = await atTable(ctx.headJudge, ctx)
      expect(games.map((g) => g.team.name)).toEqual(['Alpha', 'Bravo'])
      const { sheet } = await submit(ctx.headJudge, ctx.games[1]!, {
        team_confirmation: 'confirmed',
      })
      expect([sheet.judge.id, sheet.submitted_by.id]).toEqual([ctx.headJudge.id, ctx.headJudge.id])
      const table = await fx.su.collection('tables').getOne(ctx.table.id)
      expect(table.judges).toEqual([ctx.judge.id])
    })

    it('M10-T11: judges and head judges of other events cannot step in', async () => {
      const ctx = await setup()
      const other = await setup()
      await expectDenied(atTable(ctx.judge, ctx))
      await expectDenied(atTable(other.headJudge, ctx))
      expect((await tables(other.headJudge)).some((r) => r.id === ctx.table.id)).toBe(false)
      expect(await tables(ctx.judge)).toEqual([])
      // An archived event is left out and refused.
      await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
      expect((await tables(ctx.headJudge)).some((r) => r.id === ctx.table.id)).toBe(false)
      await expectDenied(atTable(ctx.headJudge, ctx))
    })
  })
})
