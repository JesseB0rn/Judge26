import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError, type RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// Required: flag (10), blocks (number, 5 each), parking exactly one of full (15) / partial (5).
const RULESET = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [
      { id: 'flag', label: 'Flag', type: 'boolean', points: 10, required: true },
      {
        id: 'blocks',
        label: 'Blocks',
        type: 'number',
        integer: true,
        min: 0,
        max: 6,
        pointsPerUnit: 5,
        required: true,
      },
      {
        id: 'parking',
        label: 'Parking',
        type: 'group',
        aggregate: 'sum',
        selection: { min: 1, max: 1 },
        children: [
          { id: 'full', label: 'Full', type: 'boolean', points: 15 },
          { id: 'partial', label: 'Partial', type: 'boolean', points: 5 },
        ],
      },
    ],
  },
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ClientResponseError)
  expect((error as ClientResponseError).status).toBe(status)
  return error as ClientResponseError
}

const COMPLETE = { flag: true, blocks: 3, full: true }

interface Ctx {
  event: RecordModel
  category: RecordModel
  round: RecordModel
  team: RecordModel
  game: RecordModel
  ruleset: RecordModel
  manager: TestUser
  headJudge: TestUser
  judge: TestUser
  otherJudge: TestUser
}

interface SheetResponse {
  sheet: {
    status: string
    points: number
    time_ms: number
    review_note: string
    corrections: number
    mulligans: number
    mulligan_reason: string
    values: Record<string, unknown>
  }
  stale?: boolean
}

describe('M5 judge interface and scoring workflow', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(): Promise<Ctx> {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const judge = await fx.user({
      name: 'Table Judge',
      roles: [{ role: 'judge', event: event.id }],
    })
    const otherJudge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const day = await manager.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Saturday' })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 0,
      scoring_minutes: 10,
      day: day.id,
    })
    const draft = await manager.pb
      .collection('rulesets')
      .create({ category: category.id, definition: RULESET, status: 'draft' })
    const ruleset = await manager.pb
      .collection('rulesets')
      .update(draft.id, { status: 'published' })
    const table = await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'Table A', active: true, judges: [judge.id] })
    await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'Table B', active: true, judges: [otherJudge.id] })
    const team = await fx.team(event.id, category.id, { status: 'approved', name: 'Robo Rangers' })
    const game = await manager.pb.collection('games').create({
      round: round.id,
      team: team.id,
      status: 'scheduled',
      table: table.id,
      sequence: 1,
    })
    return { event, category, round, team, game, ruleset, manager, headJudge, judge, otherJudge }
  }

  const sheetUrl = (ctx: Ctx, action = '') =>
    `/api/games/${ctx.game.id}/sheet${action ? '/' + action : ''}`

  const getSheet = (user: TestUser, ctx: Ctx) =>
    user.pb.send<{
      team: { name: string }
      round: { name: string }
      table: { name: string }
      day: { label: string }
      ruleset: { id: string; version: number }
      sheet: SheetResponse['sheet'] | null
      history: { action: string; reason: string; before: unknown; after: unknown }[]
      permissions: {
        canEdit: boolean
        canReview: boolean
        canCorrect: boolean
        canMulligan: boolean
      }
    }>(sheetUrl(ctx), { method: 'GET' })

  const saveDraft = (user: TestUser, ctx: Ctx, body: Record<string, unknown>) =>
    user.pb.send<SheetResponse>(sheetUrl(ctx), { method: 'PUT', body })

  const post = (user: TestUser, ctx: Ctx, action: string, body: Record<string, unknown> = {}) =>
    user.pb.send<SheetResponse>(sheetUrl(ctx, action), { method: 'POST', body })

  const submitted = async (ctx: Ctx) => {
    await post(ctx.judge, ctx, 'submit', {
      outcome: 'completed',
      values: COMPLETE,
      time_ms: 95_370,
    })
  }

  async function finalized(ctx: Ctx) {
    await submitted(ctx)
    await post(ctx.headJudge, ctx, 'approve')
  }

  it('M5-T01 / M5-01: a judge lists the games on their table with team, round, table and day', async () => {
    const ctx = await setup()
    const rows = await ctx.judge.pb.send<
      {
        id: string
        team: { name: string }
        round: { name: string }
        table: { name: string }
        day: { label: string }
        sheet: null
      }[]
    >('/api/judging/assignments', { method: 'GET' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: ctx.game.id,
      sequence: 1,
      team: { name: 'Robo Rangers' },
      round: { name: 'Round 1' },
      table: { name: 'Table A' },
      day: { label: 'Saturday' },
      sheet: null,
    })
    const other = await ctx.otherJudge.pb.send<unknown[]>('/api/judging/assignments', {
      method: 'GET',
    })
    expect(other).toHaveLength(0)
  })

  it('M5-T02 / M5-03: the assigned judge opens the game with its context and ruleset', async () => {
    const ctx = await setup()
    const payload = await getSheet(ctx.judge, ctx)
    expect(payload.team.name).toBe('Robo Rangers')
    expect(payload.round.name).toBe('Round 1')
    expect(payload.table.name).toBe('Table A')
    expect(payload.day.label).toBe('Saturday')
    expect(payload.ruleset).toMatchObject({ id: ctx.ruleset.id, version: 1 })
    expect(payload.sheet).toBeNull()
    expect(payload.permissions).toEqual({
      canEdit: true,
      canReview: false,
      canCorrect: false,
      canMulligan: false,
    })
  })

  it('M5-T03: a judge of another table cannot open or score the game', async () => {
    const ctx = await setup()
    const error = await expectDenied(getSheet(ctx.otherJudge, ctx))
    expect(error.status).toBe(403)
    await expectDenied(saveDraft(ctx.otherJudge, ctx, { values: COMPLETE }))
    await expectDenied(post(ctx.otherJudge, ctx, 'submit', { values: COMPLETE }))
    // Score sheets are not readable through the collection API either.
    await saveDraft(ctx.judge, ctx, { values: { flag: true } })
    expect(await ctx.otherJudge.pb.collection('score_sheets').getFullList()).toHaveLength(0)
    expect(await ctx.judge.pb.collection('score_sheets').getFullList()).toHaveLength(1)
    // And never writable directly.
    await expectDenied(
      ctx.judge.pb.collection('score_sheets').create({ game: ctx.game.id, status: 'finalized' }),
    )
  })

  it('M5-09: drafts are stored with live points; an older offline draft does not overwrite a newer one', async () => {
    const ctx = await setup()
    const first = await saveDraft(ctx.judge, ctx, {
      values: { flag: true, blocks: 2 },
      time_ms: 1000,
      client_saved_at: 2000,
    })
    expect(first.sheet).toMatchObject({ status: 'draft', points: 20, time_ms: 1000 })
    const stale = await saveDraft(ctx.judge, ctx, {
      values: { flag: false },
      client_saved_at: 1000,
    })
    expect(stale.stale).toBe(true)
    expect(stale.sheet.points).toBe(20)
    const payload = await getSheet(ctx.judge, ctx)
    expect(payload.sheet).toMatchObject({ status: 'draft', points: 20 })
  })

  it('M5-T09: submitting incomplete required criteria is rejected', async () => {
    const ctx = await setup()
    await expectFieldError(
      post(ctx.judge, ctx, 'submit', { outcome: 'completed', values: { flag: true } }),
      'values',
      'invalid_score_sheet',
    )
    const payload = await getSheet(ctx.judge, ctx)
    expect(payload.sheet).toBeNull()
  })

  it('M5-T08: submitting a valid sheet sets the status to submitted; the judge can no longer edit', async () => {
    const ctx = await setup()
    const res = await post(ctx.judge, ctx, 'submit', {
      outcome: 'completed',
      values: COMPLETE,
      time_ms: 95_370,
    })
    expect(res.sheet).toMatchObject({ status: 'submitted', points: 40, time_ms: 95_370 })
    const payload = await getSheet(ctx.judge, ctx)
    expect(payload.permissions.canEdit).toBe(false)
    expect(payload.history.map((h) => h.action)).toEqual(['submitted'])
    await expectStatus(saveDraft(ctx.judge, ctx, { values: { flag: false } }), 409)
    // Not yet in the game (and therefore not in the ranking).
    const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
    expect(game.status).toBe('scheduled')
  })

  it('disqualified and absent outcomes need no score sheet values', async () => {
    const ctx = await setup()
    const res = await post(ctx.judge, ctx, 'submit', { outcome: 'absent' })
    expect(res.sheet.status).toBe('submitted')
    await post(ctx.headJudge, ctx, 'approve')
    const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
    expect(game.status).toBe('absent')
  })

  it('M5-T10 / exit criteria: approval finalizes the score and it appears in the ranking', async () => {
    const ctx = await setup()
    await submitted(ctx)
    // Judges cannot approve.
    expect((await expectDenied(post(ctx.judge, ctx, 'approve'))).status).toBe(403)
    const res = await post(ctx.headJudge, ctx, 'approve')
    expect(res.sheet.status).toBe('finalized')

    const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
    expect(game).toMatchObject({
      status: 'completed',
      points: 40,
      time_ms: 95_370,
      ruleset: ctx.ruleset.id,
    })

    await ctx.manager.pb.collection('categories').update(ctx.category.id, {
      ranking: {
        schemaVersion: 1,
        precision: 0,
        rounds: [{ key: 'R1' }],
        calculations: [],
        ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc' }] },
      },
    })
    const snapshot = await ctx.manager.pb.send<{
      result: { entries: { team: string; rank: number; values: number[] }[] }
    }>(`/api/categories/${ctx.category.id}/ranking/snapshots`, {
      method: 'POST',
      body: { title: 'After round 1' },
    })
    expect(snapshot.result.entries).toEqual([
      expect.objectContaining({ team: ctx.team.id, rank: 1, values: [40] }),
    ])
  })

  it('M5-11: a rejected sheet returns to the judge with the reason and can be resubmitted', async () => {
    const ctx = await setup()
    await submitted(ctx)
    await expectFieldError(post(ctx.headJudge, ctx, 'reject', { reason: ' ' }), 'reason')
    const res = await post(ctx.headJudge, ctx, 'reject', { reason: 'Blocks were miscounted.' })
    expect(res.sheet).toMatchObject({ status: 'rejected', review_note: 'Blocks were miscounted.' })

    const payload = await getSheet(ctx.judge, ctx)
    expect(payload.permissions.canEdit).toBe(true)
    await post(ctx.judge, ctx, 'submit', { values: { ...COMPLETE, blocks: 2 } })
    expect((await getSheet(ctx.judge, ctx)).history.map((h) => h.action)).toEqual([
      'submitted',
      'rejected',
      'submitted',
    ])
  })

  it('M5-T11: a judge cannot change a finalized score', async () => {
    const ctx = await setup()
    await finalized(ctx)
    await expectStatus(saveDraft(ctx.judge, ctx, { values: COMPLETE }), 409)
    await expectStatus(post(ctx.judge, ctx, 'submit', { values: COMPLETE }), 409)
    expect(
      (await expectDenied(post(ctx.judge, ctx, 'correct', { values: COMPLETE, reason: 'x' })))
        .status,
    ).toBe(403)
    // Nor through the games API (invariant 1): not even an event manager.
    await expectStatus(
      ctx.manager.pb.collection('games').update(ctx.game.id, { points: 99, ruleset: '' }),
      409,
    )
    await expectDenied(ctx.manager.pb.collection('games').delete(ctx.game.id))
  })

  it('M5-12 / M5-T12: an authorized correction needs a reason and records old and new values', async () => {
    const ctx = await setup()
    await finalized(ctx)
    await expectFieldError(
      post(ctx.headJudge, ctx, 'correct', { values: { ...COMPLETE, blocks: 5 } }),
      'reason',
      'required',
    )
    // A correction must still be a complete score sheet.
    await expectFieldError(
      post(ctx.headJudge, ctx, 'correct', { values: { flag: true }, reason: 'Recount' }),
      'values',
    )
    const res = await post(ctx.headJudge, ctx, 'correct', {
      values: { ...COMPLETE, blocks: 5 },
      time_ms: 95_370,
      reason: 'Video review: five blocks.',
    })
    expect(res.sheet).toMatchObject({ status: 'finalized', points: 50, corrections: 1 })

    const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
    expect(game.points).toBe(50)

    const { history } = await getSheet(ctx.headJudge, ctx)
    expect(history[0]).toMatchObject({
      action: 'corrected',
      reason: 'Video review: five blocks.',
      before: { points: 40, values: COMPLETE },
      after: { points: 50, values: { ...COMPLETE, blocks: 5 } },
    })
  })

  it('M5-13: the audit trail is append-only and visible to the game’s judge and reviewers', async () => {
    const ctx = await setup()
    await finalized(ctx)
    const entries = await ctx.headJudge.pb
      .collection('score_audit')
      .getFullList({ sort: 'created' })
    expect(entries.map((e) => e.action)).toEqual(['submitted', 'approved'])
    expect(await ctx.judge.pb.collection('score_audit').getFullList()).toHaveLength(2)
    expect(await ctx.otherJudge.pb.collection('score_audit').getFullList()).toHaveLength(0)
    await expectDenied(
      ctx.headJudge.pb.collection('score_audit').update(entries[0]!.id, { reason: 'x' }),
    )
    await expectDenied(fx.su.collection('score_audit').update(entries[0]!.id, { reason: 'x' }))
    await expectDenied(
      ctx.headJudge.pb.collection('score_audit').create({ game: ctx.game.id, action: 'approved' }),
    )
  })

  it('M5-13: direct result edits through the games API are audited', async () => {
    const ctx = await setup()
    await ctx.manager.pb
      .collection('games')
      .update(ctx.game.id, { status: 'completed', points: 12, ruleset: '' })
    const entries = await ctx.manager.pb.collection('score_audit').getFullList()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      action: 'manual_edit',
      actor: ctx.manager.id,
      before: expect.objectContaining({ outcome: 'scheduled' }),
      after: expect.objectContaining({ outcome: 'completed', points: 12 }),
    })
  })

  it('M5-T15: synchronizing an outdated draft does not overwrite a finalized score', async () => {
    const ctx = await setup()
    await saveDraft(ctx.judge, ctx, { values: { flag: true }, client_saved_at: 1000 })
    await finalized(ctx)
    const error = await saveDraft(ctx.judge, ctx, {
      values: { flag: false, blocks: 0, partial: true },
      client_saved_at: Date.now(),
    }).catch((e: ClientResponseError) => e)
    expect(error).toBeInstanceOf(ClientResponseError)
    expect((error as ClientResponseError).status).toBe(409)
    expect((error as ClientResponseError).response.data).toMatchObject({
      status: { code: 'finalized' },
    })
    const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
    expect(game.points).toBe(40)
  })

  it('reviewers list all games of the event with their score status', async () => {
    const ctx = await setup()
    await submitted(ctx)
    const rows = await ctx.headJudge.pb.send<{ id: string; sheet: { status: string } }[]>(
      `/api/events/${ctx.event.id}/judging`,
      { method: 'GET' },
    )
    expect(rows).toEqual([
      expect.objectContaining({
        id: ctx.game.id,
        sheet: expect.objectContaining({ status: 'submitted' }),
      }),
    ])
    await expectDenied(ctx.judge.pb.send(`/api/events/${ctx.event.id}/judging`, { method: 'GET' }))
  })

  it('archived events are read-only for scoring', async () => {
    const ctx = await setup()
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(saveDraft(ctx.judge, ctx, { values: { flag: true } }))
    const payload = await getSheet(ctx.headJudge, ctx)
    expect(payload.permissions.canEdit).toBe(false)
  })

  it('M5-02: a round can only be played on a competition day of its event', async () => {
    const ctx = await setup()
    const other = await fx.event()
    const foreign = await fx.su
      .collection('competition_days')
      .create({ event: other.id, date: '2026-06-14' })
    await expectFieldError(
      ctx.manager.pb.collection('rounds').update(ctx.round.id, { day: foreign.id }),
      'day',
      'invalid_day',
    )
  })

  describe('M9-A mulligan runs', () => {
    it('M9-T01 / M9-01 – M9-03: a head judge grants a re-run of a finalized game with a reason', async () => {
      const ctx = await setup()
      await finalized(ctx)
      expect((await getSheet(ctx.headJudge, ctx)).permissions.canMulligan).toBe(true)
      const res = await post(ctx.headJudge, ctx, 'mulligan', { reason: 'Field power cut.' })
      expect(res.sheet).toMatchObject({
        status: 'draft',
        values: {},
        time_ms: 0,
        mulligans: 1,
        mulligan_reason: 'Field power cut.',
      })

      // The discarded run no longer counts.
      const game = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
      expect(game).toMatchObject({ status: 'scheduled', points: 0, time_ms: 0 })

      const payload = await getSheet(ctx.judge, ctx)
      expect(payload.permissions).toMatchObject({ canEdit: true, canMulligan: false })
      expect(payload.history[0]).toMatchObject({
        action: 'mulligan',
        reason: 'Field power cut.',
        before: { status: 'finalized', points: 40, values: COMPLETE, time_ms: 95_370 },
      })

      // M9-05: the re-run goes through the normal workflow.
      await post(ctx.judge, ctx, 'submit', { values: { ...COMPLETE, blocks: 1 }, time_ms: 80_000 })
      await post(ctx.headJudge, ctx, 'approve')
      const rerun = await ctx.manager.pb.collection('games').getOne(ctx.game.id)
      expect(rerun).toMatchObject({ status: 'completed', points: 30, time_ms: 80_000 })
    })

    it('M9-T02: a mulligan needs a reason', async () => {
      const ctx = await setup()
      await submitted(ctx)
      await expectFieldError(post(ctx.headJudge, ctx, 'mulligan', { reason: ' ' }), 'reason')
    })

    it('M9-T03: table judges cannot grant a mulligan; a game without a run has none to replace', async () => {
      const ctx = await setup()
      await expectStatus(post(ctx.headJudge, ctx, 'mulligan', { reason: 'x' }), 409)
      await submitted(ctx)
      expect((await getSheet(ctx.judge, ctx)).permissions.canMulligan).toBe(false)
      await expectStatus(post(ctx.judge, ctx, 'mulligan', { reason: 'Robot fell.' }), 403)
      await expectStatus(post(ctx.otherJudge, ctx, 'mulligan', { reason: 'Robot fell.' }), 403)
      expect(
        (await post(ctx.manager, ctx, 'mulligan', { reason: 'Robot fell.' })).sheet.status,
      ).toBe('draft')
    })

    it('M9-T04: a draft of the discarded run does not overwrite the re-run', async () => {
      const ctx = await setup()
      await saveDraft(ctx.judge, ctx, { values: { flag: true }, client_saved_at: 1000 })
      await post(ctx.headJudge, ctx, 'mulligan', { reason: 'Table bumped.' })
      // A device that loaded the sheet before the mulligan (mulligans: 0), with a newer clock.
      const old = await saveDraft(ctx.judge, ctx, {
        values: { flag: true, blocks: 6 },
        client_saved_at: Date.now() + 60_000,
        mulligans: 0,
      })
      expect(old.stale).toBe(true)
      expect(old.sheet.values).toEqual({})
      // A device that knows about the re-run saves normally.
      const fresh = await saveDraft(ctx.judge, ctx, {
        values: { flag: true },
        client_saved_at: Date.now() + 120_000,
        mulligans: 1,
      })
      expect(fresh.stale).toBe(false)
      expect(fresh.sheet.values).toEqual({ flag: true })
    })
  })

  describe('M9-B program verification', () => {
    const setProgram = (user: TestUser, ctx: Ctx, program_name: unknown) =>
      user.pb.send<{ program_name: string }>(`/api/games/${ctx.game.id}/program`, {
        method: 'PUT',
        body: { program_name },
      })

    it('M9-T05 / M9-06 / M9-07: the judge records the program at the robot check; the sheet shows it', async () => {
      const ctx = await setup()
      // A second attempt of the same team in the round gets the name too.
      const retry = await ctx.manager.pb.collection('games').create({
        round: ctx.round.id,
        team: ctx.team.id,
        status: 'scheduled',
        attempt: 2,
      })
      expect((await setProgram(ctx.judge, ctx, '  mission_v3  ')).program_name).toBe('mission_v3')

      const payload = await ctx.judge.pb.send<{ game: { program_name: string } }>(
        `/api/games/${ctx.game.id}/sheet`,
        { method: 'GET' },
      )
      expect(payload.game.program_name).toBe('mission_v3')
      const rows = await ctx.judge.pb.send<{ id: string; program_name: string }[]>(
        '/api/judging/assignments',
        { method: 'GET' },
      )
      expect(rows.find((r) => r.id === ctx.game.id)?.program_name).toBe('mission_v3')
      expect((await ctx.manager.pb.collection('games').getOne(retry.id)).program_name).toBe(
        'mission_v3',
      )

      await expectFieldError(setProgram(ctx.judge, ctx, 'x'.repeat(201)), 'program_name')
      await expectStatus(setProgram(ctx.otherJudge, ctx, 'other'), 403)
    })

    it('M9-T06 / M9-08: after submission only a reviewer can change the program', async () => {
      const ctx = await setup()
      await setProgram(ctx.judge, ctx, 'mission_v3')
      await submitted(ctx)
      await expectStatus(setProgram(ctx.judge, ctx, 'mission_v4'), 409)
      expect((await setProgram(ctx.headJudge, ctx, 'mission_v4')).program_name).toBe('mission_v4')
    })

    it('M9-09: a mulligan keeps the recorded program', async () => {
      const ctx = await setup()
      await setProgram(ctx.judge, ctx, 'mission_v3')
      await finalized(ctx)
      await post(ctx.headJudge, ctx, 'mulligan', { reason: 'Field fault.' })
      expect((await ctx.manager.pb.collection('games').getOne(ctx.game.id)).program_name).toBe(
        'mission_v3',
      )
    })
  })
})
