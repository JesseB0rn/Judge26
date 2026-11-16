import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { ClientResponseError, RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// M10-B: robot check, parts check and round file (M10-08 – M10-17, tests M10-T12 – M10-T26).
// See docs/specifications/M10-checks.md.

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

interface TableState {
  round: { check_mode: string; released_at: string; release_reason: string }
  ready: { at: string; by: { name: string } } | null
  parts_check: { id: string; title: string } | null
  teams: {
    id: string
    name: string
    checked: boolean
    checked_at: string
    checked_by: { name: string } | null
    scoring_started: boolean
  }[]
  file: { name: string; kind: string } | null
  can_release: boolean
}

interface Progress {
  rounds: {
    id: string
    check_mode: string
    released_at: string
    checks_recorded: boolean
    tables: { id: string; name: string; checked: number; total: number; ready: unknown }[]
  }[]
  parts_checks: {
    id: string
    completed_at: string
    tables: { name: string; confirmed_at: string }[]
  }[]
}

// A 1×1 PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

describe('M10-B robot check, parts check and round file', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  /** An event with two tables of two teams each in one round on one day. */
  async function setup(round: Record<string, unknown> = {}) {
    const event = await fx.event()
    const category = await fx.category(event.id, { code: `C${Date.now() % 100000}` })
    const other = await fx.category(event.id, { code: `O${Date.now() % 100000}` })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({
      name: 'Hedda',
      roles: [{ role: 'head_judge', event: event.id }],
    })
    const judge = await fx.user({ name: 'Judy', roles: [{ role: 'judge', event: event.id }] })
    const judge2 = await fx.user({ name: 'Jo', roles: [{ role: 'judge', event: event.id }] })
    const day = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Saturday' })
    const r1 = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      day: day.id,
      ...round,
    })
    await fx.su
      .collection('rulesets')
      .create({ category: category.id, status: 'published', definition: RULESET })
    const tables: RecordModel[] = []
    for (const [i, j] of [judge, judge2].entries()) {
      tables.push(
        await fx.su.collection('tables').create({
          event: event.id,
          name: `Table ${i + 1}`,
          active: true,
          position: i + 1,
          categories: [category.id],
          judges: [j.id],
        }),
      )
    }
    const teams: RecordModel[] = []
    const games: RecordModel[] = []
    for (const [i, name] of ['Alpha', 'Bravo', 'Charlie', 'Delta'].entries()) {
      const team = await fx.team(event.id, category.id, { name, status: 'approved' })
      teams.push(team)
      games.push(
        await fx.su.collection('games').create({
          round: r1.id,
          team: team.id,
          status: 'scheduled',
          table: tables[Math.floor(i / 2)]!.id,
          sequence: (i % 2) + 1,
        }),
      )
    }
    return {
      event,
      category,
      other,
      manager,
      headJudge,
      judge,
      judge2,
      day,
      round: r1,
      tables,
      teams,
      games,
    }
  }
  type Ctx = Awaited<ReturnType<typeof setup>>

  const state = (user: TestUser, ctx: Ctx, table = ctx.tables[0]!) =>
    user.pb.send<TableState>(`/api/rounds/${ctx.round.id}/checks?table=${table.id}`, {})
  const check = (user: TestUser, ctx: Ctx, team: RecordModel, body: Record<string, unknown> = {}) =>
    user.pb.send<{ team: TableState['teams'][number]; stale: boolean }>(
      `/api/rounds/${ctx.round.id}/checks`,
      { method: 'PUT', body: { team: team.id, checked: true, ...body } },
    )
  const ready = (user: TestUser, ctx: Ctx, table: RecordModel, value = true) =>
    user.pb.send<TableState>(`/api/rounds/${ctx.round.id}/checks/ready`, {
      method: 'POST',
      body: { table: table.id, ready: value },
    })
  const release = (user: TestUser, ctx: Ctx, body: Record<string, unknown> = {}) =>
    user.pb.send(`/api/rounds/${ctx.round.id}/release`, { method: 'POST', body })
  const progress = (user: TestUser, ctx: Ctx) =>
    user.pb.send<Progress>(`/api/events/${ctx.event.id}/checks`, {})
  const submit = (user: TestUser, game: RecordModel, body: Record<string, unknown> = {}) =>
    user.pb.send(`/api/games/${game.id}/sheet/submit`, {
      method: 'POST',
      body: { values: { flag: true }, team_confirmation: 'confirmed', ...body },
    })
  const draft = (user: TestUser, game: RecordModel) =>
    user.pb.send(`/api/games/${game.id}/sheet`, {
      method: 'PUT',
      body: { values: { flag: true }, client_saved_at: Date.now() },
    })

  /** The `{ field: code }` of a refused request, and its HTTP status. */
  async function refusal(promise: Promise<unknown>) {
    const error = (await promise.then(
      () => {
        throw new Error('Expected the request to be refused.')
      },
      (e: unknown) => e,
    )) as ClientResponseError
    const data = error.response.data as Record<string, { code: string }>
    const codes = Object.fromEntries(
      Object.entries(data)
        .filter(([k]) => k !== '_error')
        .map(([k, v]) => [k, v.code]),
    )
    return { status: error.status, codes, message: error.message }
  }

  describe('M10-08 / M10-09 mode per round', () => {
    it('M10-T12: new rounds have a synchronous check with a check phase', async () => {
      const ctx = await setup()
      expect(ctx.round.check_mode).toBe('synchronous')
      const phases = await fx.su
        .collection('round_phases')
        .getFullList({ filter: `round = "${ctx.round.id}"` })
      expect(phases.map((p) => p.phase).sort()).toEqual(['check', 'scoring'])
      // Off removes the phase; adding the check in the planner turns it on again.
      await ctx.manager.pb.collection('rounds').update(ctx.round.id, { check_mode: 'off' })
      expect(
        (
          await fx.su
            .collection('round_phases')
            .getFullList({ filter: `round = "${ctx.round.id}" && phase = "check"` })
        ).length,
      ).toBe(0)
      await ctx.manager.pb
        .collection('round_phases')
        .create({ round: ctx.round.id, phase: 'check', duration_minutes: 10 })
      expect((await fx.su.collection('rounds').getOne(ctx.round.id)).check_mode).toBe('synchronous')
    })

    it('M10-09: head judges choose the mode until the first check; only managers turn it off', async () => {
      const ctx = await setup()
      await ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/check-mode`, {
        method: 'PUT',
        body: { mode: 'asynchronous' },
      })
      expect((await fx.su.collection('rounds').getOne(ctx.round.id)).check_mode).toBe(
        'asynchronous',
      )
      await expectDenied(
        ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/check-mode`, {
          method: 'PUT',
          body: { mode: 'off' },
        }),
      )
      await expectDenied(
        ctx.judge.pb.send(`/api/rounds/${ctx.round.id}/check-mode`, {
          method: 'PUT',
          body: { mode: 'synchronous' },
        }),
      )
      await check(ctx.judge, ctx, ctx.teams[0]!)
      const locked = await refusal(
        ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/check-mode`, {
          method: 'PUT',
          body: { mode: 'synchronous' },
        }),
      )
      expect(locked.codes).toEqual({ check_mode: 'checks_recorded' })
      await expectDenied(
        ctx.manager.pb.collection('rounds').update(ctx.round.id, { check_mode: 'synchronous' }),
      )
    })

    it('release fields cannot be set through the record API', async () => {
      const ctx = await setup()
      await expectDenied(
        ctx.manager.pb
          .collection('rounds')
          .update(ctx.round.id, { released_at: '2026-06-13 08:00:00.000Z' }),
      )
    })
  })

  describe('M10-10 checks stored', () => {
    it('M10-T13: checks are shared between devices with judge and time', async () => {
      const ctx = await setup()
      await check(ctx.judge, ctx, ctx.teams[0]!)
      await check(ctx.judge, ctx, ctx.teams[1]!)
      // The head judge (another device) sees the same state.
      const seen = await state(ctx.headJudge, ctx)
      expect(seen.teams.map((t) => [t.name, t.checked, t.checked_by?.name])).toEqual([
        ['Alpha', true, 'Judy'],
        ['Bravo', true, 'Judy'],
      ])
      expect(seen.teams[0]!.checked_at).not.toBe('')
    })

    it('an older offline change does not overwrite a newer one; reopening stops at scoring', async () => {
      const ctx = await setup({ check_mode: 'asynchronous' })
      const now = Date.now()
      await check(ctx.judge, ctx, ctx.teams[0]!, { client_saved_at: now })
      const stale = await check(ctx.judge, ctx, ctx.teams[0]!, {
        checked: false,
        client_saved_at: now - 60_000,
      })
      expect([stale.stale, stale.team.checked]).toEqual([true, true])
      // Reopen, check again, then scoring starts: no more reopening.
      await check(ctx.judge, ctx, ctx.teams[0]!, { checked: false, client_saved_at: now + 1 })
      await check(ctx.judge, ctx, ctx.teams[0]!, { client_saved_at: now + 2 })
      await draft(ctx.judge, ctx.games[0]!)
      const refused = await refusal(
        check(ctx.judge, ctx, ctx.teams[0]!, { checked: false, client_saved_at: now + 3 }),
      )
      expect([refused.status, refused.codes]).toEqual([409, { check: 'scoring_started' }])
    })

    it('judges of other tables cannot check a team; head judges can', async () => {
      const ctx = await setup()
      await expectDenied(check(ctx.judge2, ctx, ctx.teams[0]!))
      await expectDenied(state(ctx.judge2, ctx))
      expect((await check(ctx.headJudge, ctx, ctx.teams[0]!)).team.checked_by?.name).toBe('Hedda')
    })
  })

  describe('M10-11 synchronous mode', () => {
    it('M10-T14: no sheet is started or submitted before the release', async () => {
      const ctx = await setup()
      expect(await refusal(draft(ctx.judge, ctx.games[0]!))).toMatchObject({
        status: 409,
        codes: { round: 'not_released' },
      })
      expect(await refusal(submit(ctx.judge, ctx.games[0]!))).toMatchObject({
        status: 409,
        codes: { round: 'not_released' },
      })
      const sheet = await ctx.judge.pb.send<{ gate: string }>(
        `/api/games/${ctx.games[0]!.id}/sheet`,
        {},
      )
      expect(sheet.gate).toBe('not_released')
    })

    it('M10-T15: all tables ready, the head judge releases and every sheet unlocks', async () => {
      const ctx = await setup()
      for (const [i, judge] of [ctx.judge, ctx.judge2].entries()) {
        await check(judge, ctx, ctx.teams[i * 2]!)
        await check(judge, ctx, ctx.teams[i * 2 + 1]!)
        await ready(judge, ctx, ctx.tables[i]!)
      }
      await release(ctx.headJudge, ctx)
      const rows = await ctx.judge2.pb.send<{ gate: string }[]>('/api/judging/assignments', {})
      expect(rows.map((r) => r.gate)).toEqual(['', ''])
      await submit(ctx.judge2, ctx.games[3]!)
      // Not ready again after the release is refused.
      expect((await refusal(ready(ctx.judge, ctx, ctx.tables[0]!, false))).codes).toEqual({
        round: 'released',
      })
    })

    it('M10-T16: releasing with a table not ready needs a reason and is audited', async () => {
      const ctx = await setup()
      await ready(ctx.judge, ctx, ctx.tables[0]!)
      const refused = await refusal(release(ctx.headJudge, ctx))
      expect([refused.status, refused.codes]).toEqual([400, { reason: 'required' }])
      await release(ctx.headJudge, ctx, { reason: 'Table 2 judge is late' })
      const round = await fx.su.collection('rounds').getOne(ctx.round.id)
      expect([round.release_reason, round.released_by]).toEqual([
        'Table 2 judge is late',
        ctx.headJudge.id,
      ])
      const audit = await fx.su.collection('audit_log').getFullList({
        filter: `action = "round.release" && record = "${ctx.round.id}"`,
      })
      expect(audit).toHaveLength(1)
      expect(audit[0]!.summary).toContain('Table 2')
      expect(audit[0]!.summary).toContain('Table 2 judge is late')
    })

    it('M10-T17: table judges cannot release', async () => {
      const ctx = await setup()
      const refused = await refusal(release(ctx.judge, ctx, { reason: 'x' }))
      expect(refused.status).toBe(403)
    })

    it('a release is withdrawn while nothing was scored', async () => {
      const ctx = await setup()
      await release(ctx.headJudge, ctx, { reason: 'Test' })
      await ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/release`, { method: 'DELETE' })
      expect((await fx.su.collection('rounds').getOne(ctx.round.id)).released_at).toBe('')
      await release(ctx.headJudge, ctx, { reason: 'Test' })
      await draft(ctx.judge, ctx.games[0]!)
      expect(
        (
          await refusal(
            ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/release`, { method: 'DELETE' }),
          )
        ).codes,
      ).toEqual({ round: 'scoring_started' })
    })
  })

  describe('M10-12 asynchronous mode', () => {
    it('M10-T18: an unchecked team is blocked; its check unlocks it', async () => {
      const ctx = await setup({ check_mode: 'asynchronous' })
      expect((await refusal(draft(ctx.judge, ctx.games[0]!))).codes).toEqual({
        check: 'not_confirmed',
      })
      await check(ctx.judge, ctx, ctx.teams[0]!)
      await draft(ctx.judge, ctx.games[0]!)
      await submit(ctx.judge, ctx.games[0]!)
      // The other team is still blocked, but its absence can be recorded.
      expect((await refusal(submit(ctx.judge, ctx.games[1]!))).codes).toEqual({
        check: 'not_confirmed',
      })
      await submit(ctx.judge, ctx.games[1]!, { outcome: 'absent', team_confirmation: '' })
    })
  })

  describe('M10-13 head judge progress', () => {
    it('M10-T19: counts and ready states per table', async () => {
      const ctx = await setup()
      await check(ctx.judge, ctx, ctx.teams[0]!)
      await check(ctx.judge2, ctx, ctx.teams[2]!)
      await check(ctx.judge2, ctx, ctx.teams[3]!)
      await ready(ctx.judge2, ctx, ctx.tables[1]!)
      const before = (
        await fx.su.collection('live_revisions').getFirstListItem(`event = "${ctx.event.id}"`)
      ).revision as number
      await check(ctx.judge, ctx, ctx.teams[1]!)
      const after = (
        await fx.su.collection('live_revisions').getFirstListItem(`event = "${ctx.event.id}"`)
      ).revision as number
      expect(after).toBeGreaterThan(before)
      const round = (await progress(ctx.headJudge, ctx)).rounds.find((r) => r.id === ctx.round.id)!
      expect(round.tables.map((t) => [t.name, t.checked, t.total, !!t.ready])).toEqual([
        ['Table 1', 2, 2, false],
        ['Table 2', 2, 2, true],
      ])
      expect(round.checks_recorded).toBe(true)
      await expectDenied(progress(ctx.judge, ctx))
    })
  })

  describe('M10-14 round without check', () => {
    it('M10-T20: no check on the judge timeline and scoring is open', async () => {
      const ctx = await setup({ check_mode: 'off' })
      const rows = await ctx.judge.pb.send<{ check: unknown; gate: string }[]>(
        '/api/judging/assignments',
        {},
      )
      expect(rows.map((r) => [r.check, r.gate])).toEqual([
        [null, ''],
        [null, ''],
      ])
      await submit(ctx.judge, ctx.games[0]!)
      expect((await refusal(check(ctx.judge, ctx, ctx.teams[1]!))).codes).toEqual({ check: 'off' })
    })
  })

  describe('M10-15 / M10-16 parts check', () => {
    async function partsCheck(ctx: Ctx, data: Record<string, unknown> = {}) {
      return ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day.id,
        starts_at: '08:00',
        duration_minutes: 30,
        title: 'Parts check',
        kind: 'parts_check',
        categories: [ctx.category.id],
        ...data,
      })
    }
    const confirm = (user: TestUser, block: RecordModel, table: RecordModel) =>
      user.pb.send(`/api/parts-checks/${block.id}/tables/${table.id}`, {
        method: 'POST',
        body: { confirmed: true },
      })
    const complete = (user: TestUser, block: RecordModel, body: Record<string, unknown> = {}) =>
      user.pb.send(`/api/parts-checks/${block.id}/complete`, { method: 'POST', body })

    it('M10-T21: stored without a round; placing it after the first scoring run warns', async () => {
      const ctx = await setup()
      const scoring = await fx.su
        .collection('round_phases')
        .getFirstListItem(`round = "${ctx.round.id}" && phase = "scoring"`)
      await ctx.manager.pb.collection('round_phases').update(scoring.id, {
        day: ctx.day.id,
        starts_at: '09:00',
        expected_updated: scoring.updated,
      })
      const block = await partsCheck(ctx, { starts_at: '09:30' })
      expect([block.kind, block.blocks_first_round]).toEqual(['parts_check', true])
      const planner = await ctx.manager.pb.send<{
        issues: { code: string; items: { kind: string; id: string }[] }[]
      }>(`/api/events/${ctx.event.id}/planner`, {})
      const issue = planner.issues.find((i) => i.code === 'parts_check_late')
      expect(issue?.items).toContainEqual({ kind: 'block', id: block.id })
      // Before the scoring run: no warning.
      await ctx.manager.pb.collection('schedule_blocks').update(block.id, {
        starts_at: '08:00',
        expected_updated: block.updated,
      })
      const fixed = await ctx.manager.pb.send<{ issues: { code: string }[] }>(
        `/api/events/${ctx.event.id}/planner`,
        {},
      )
      expect(fixed.issues.some((i) => i.code === 'parts_check_late')).toBe(false)
    })

    it('M10-T22: while open, the first round’s check and scoring are refused in covered categories only', async () => {
      const ctx = await setup()
      await partsCheck(ctx)
      expect((await refusal(check(ctx.judge, ctx, ctx.teams[0]!))).codes).toEqual({
        parts_check: 'open',
      })
      await release(ctx.headJudge, ctx, { reason: 'Test' })
      expect(await refusal(draft(ctx.judge, ctx.games[0]!))).toMatchObject({
        status: 409,
        codes: { parts_check: 'open' },
      })
      // A round of another category on that day is not gated.
      const otherRound = await fx.su.collection('rounds').create({
        category: ctx.other.id,
        key: 'R1',
        name: 'Other',
        position: 1,
        day: ctx.day.id,
        check_mode: 'off',
      })
      const team = await fx.team(ctx.event.id, ctx.other.id, { status: 'approved' })
      const table = await fx.su.collection('tables').create({
        event: ctx.event.id,
        name: 'Table 9',
        active: true,
        position: 9,
        categories: [ctx.other.id],
        judges: [ctx.judge.id],
      })
      const game = await fx.su.collection('games').create({
        round: otherRound.id,
        team: team.id,
        status: 'scheduled',
        table: table.id,
        sequence: 1,
      })
      await draft(ctx.judge, game)
      // A later round of the covered category is not gated either.
      const r2 = await fx.su.collection('rounds').create({
        category: ctx.category.id,
        key: 'R2',
        name: 'Round 2',
        position: 2,
        day: ctx.day.id,
        check_mode: 'off',
      })
      const later = await fx.su.collection('games').create({
        round: r2.id,
        team: ctx.teams[0]!.id,
        status: 'scheduled',
        table: ctx.tables[0]!.id,
        sequence: 1,
      })
      await draft(ctx.judge, later)
    })

    it('M10-T23: all tables confirm, the head judge completes and the first round unlocks', async () => {
      const ctx = await setup({ check_mode: 'off' })
      const block = await partsCheck(ctx)
      const judges = await ctx.judge.pb.send<{ id: string; table: { name: string } }[]>(
        '/api/judging/parts-checks',
        {},
      )
      expect(judges.map((p) => [p.id, p.table.name])).toEqual([[block.id, 'Table 1']])
      await expectDenied(confirm(ctx.judge, block, ctx.tables[1]!))
      await confirm(ctx.judge, block, ctx.tables[0]!)
      await confirm(ctx.judge2, block, ctx.tables[1]!)
      await expectDenied(complete(ctx.judge, block))
      await complete(ctx.headJudge, block)
      await submit(ctx.judge, ctx.games[0]!)
      const audit = await fx.su.collection('audit_log').getFullList({
        filter: `action = "parts_check.complete" && record = "${block.id}"`,
      })
      expect(audit).toHaveLength(1)
      const shown = (await progress(ctx.headJudge, ctx)).parts_checks[0]!
      expect(shown.completed_at).not.toBe('')
      expect(shown.tables.every((t) => t.confirmed_at)).toBe(true)
    })

    it('M10-T24: completing with a table open names it, then is audited; days without the block are not gated', async () => {
      const ctx = await setup({ check_mode: 'off' })
      const block = await partsCheck(ctx)
      await confirm(ctx.judge, block, ctx.tables[0]!)
      const refused = await refusal(complete(ctx.headJudge, block))
      expect([refused.status, refused.codes]).toEqual([409, { tables: 'open' }])
      expect(refused.message).toContain('Table 2')
      await complete(ctx.headJudge, block, { force: true })
      const audit = await fx.su
        .collection('audit_log')
        .getFirstListItem(`action = "parts_check.complete" && record = "${block.id}"`)
      expect(audit.summary).toContain('Table 2')
      // A day without the block.
      const other = await setup({ check_mode: 'off' })
      await submit(other.judge, other.games[0]!)
    })

    it('without "blocks the first round" nothing is gated', async () => {
      const ctx = await setup({ check_mode: 'off' })
      await partsCheck(ctx, { blocks_first_round: false })
      await submit(ctx.judge, ctx.games[0]!)
    })
  })

  describe('M10-17 round file', () => {
    const upload = (user: TestUser, ctx: Ctx, file: Blob, name: string) => {
      const form = new FormData()
      form.append('file', file, name)
      return user.pb.send<{ file: { name: string } }>(`/api/rounds/${ctx.round.id}/file`, {
        method: 'POST',
        body: form,
      })
    }
    const fetchFile = (ctx: Ctx, user?: TestUser) =>
      fetch(`${server.url}/api/rounds/${ctx.round.id}/file`, {
        headers: user ? { Authorization: user.pb.authStore.token } : {},
      })

    it('M10-T25: shown only once the check is confirmed (synchronous and asynchronous)', async () => {
      const sync = await setup()
      await upload(sync.headJudge, sync, new Blob([PNG], { type: 'image/png' }), 'Field R1.png')
      expect((await fetchFile(sync, sync.judge)).status).toBe(409)
      expect((await state(sync.judge, sync)).file).toBeNull()
      expect((await fetchFile(sync, sync.headJudge)).status).toBe(200)
      await release(sync.headJudge, sync, { reason: 'Test' })
      const res = await fetchFile(sync, sync.judge)
      expect(res.status).toBe(200)
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
      expect((await state(sync.judge, sync)).file).toEqual(
        expect.objectContaining({ name: 'Field R1.png', kind: 'image' }),
      )
      const sheet = await sync.judge.pb.send<{ round_file: { name: string } | null }>(
        `/api/games/${sync.games[0]!.id}/sheet`,
        {},
      )
      expect(sheet.round_file?.name).toBe('Field R1.png')

      const async = await setup({ check_mode: 'asynchronous' })
      await upload(async.headJudge, async, new Blob([PNG], { type: 'image/png' }), 'Field.png')
      await check(async.judge, async, async.teams[0]!)
      expect((await fetchFile(async, async.judge)).status).toBe(409)
      await ready(async.judge, async, async.tables[0]!)
      expect((await fetchFile(async, async.judge)).status).toBe(200)
      // The other table is not complete yet.
      expect((await fetchFile(async, async.judge2)).status).toBe(409)

      const off = await setup({ check_mode: 'off' })
      await upload(off.headJudge, off, new Blob([PNG], { type: 'image/png' }), 'Field.png')
      expect((await fetchFile(off, off.judge)).status).toBe(200)
    })

    it('M10-T26: too large, wrong type, table judges and anonymous requests are refused', async () => {
      const ctx = await setup()
      const big = new Uint8Array(12 * 1024 * 1024)
      big.set(PNG)
      const large = await refusal(
        upload(ctx.headJudge, ctx, new Blob([big], { type: 'image/png' }), 'big.png'),
      )
      expect(large.status).toBe(400)
      expect(Object.keys(large.codes)).toEqual(['file'])
      const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(0)])
      const wrong = await refusal(
        upload(ctx.headJudge, ctx, new Blob([zip], { type: 'application/zip' }), 'a.zip'),
      )
      expect([wrong.status, Object.keys(wrong.codes)]).toEqual([400, ['file']])
      const judge = await refusal(
        upload(ctx.judge, ctx, new Blob([PNG], { type: 'image/png' }), 'a.png'),
      )
      expect(judge.status).toBe(403)
      await upload(ctx.headJudge, ctx, new Blob([PNG], { type: 'image/png' }), 'a.png')
      expect((await fetchFile(ctx)).status).toBe(404)
      const outsider = await fx.user()
      expect((await fetchFile(ctx, outsider)).status).toBe(404)
      // Replace and remove.
      const replaced = await upload(
        ctx.headJudge,
        ctx,
        new Blob([PNG], { type: 'image/png' }),
        'b.png',
      )
      expect(replaced.file.name).toBe('b.png')
      await ctx.headJudge.pb.send(`/api/rounds/${ctx.round.id}/file`, { method: 'DELETE' })
      expect((await fetchFile(ctx, ctx.headJudge)).status).toBe(404)
    })
  })

  it('templates carry the check mode and parts check blocks', async () => {
    const ctx = await setup({ check_mode: 'asynchronous' })
    await ctx.manager.pb.collection('schedule_blocks').create({
      event: ctx.event.id,
      day: ctx.day.id,
      starts_at: '08:00',
      duration_minutes: 30,
      title: 'Parts check',
      kind: 'parts_check',
      blocks_first_round: false,
    })
    const template = await ctx.manager.pb.send<{
      categories: { rounds: { check_mode: string }[] }[]
      blocks: { kind: string; blocks_first_round: boolean }[]
    }>(`/api/events/${ctx.event.id}/template`, {})
    const own = template.categories.find((c) => c.rounds.length)!
    expect(own.rounds[0]!.check_mode).toBe('asynchronous')
    expect(template.blocks.map((b) => [b.kind, b.blocks_first_round])).toEqual([
      ['parts_check', false],
    ])
  })
})
