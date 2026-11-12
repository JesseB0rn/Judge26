import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, validMembers } from './support/fixtures'

describe('M1 events and competition days', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  it('M1-06: admins create, edit and archive events', async () => {
    const admin = await fx.admin()
    const event = await admin.pb
      .collection('events')
      .create({ name: 'WRO Swiss Final', season: 2026, status: 'draft', venue: 'Bern' })
    const edited = await admin.pb.collection('events').update(event.id, { venue: 'Zurich' })
    expect(edited.venue).toBe('Zurich')
    const archived = await admin.pb.collection('events').update(event.id, { status: 'archived' })
    expect(archived.status).toBe('archived')
  })

  it('event managers edit their event but cannot create events', async () => {
    const event = await fx.event()
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    await manager.pb.collection('events').update(event.id, { venue: 'Basel' })
    await expectDenied(
      manager.pb.collection('events').create({ name: 'Other', season: 2026, status: 'draft' }),
    )
    await expectDenied(manager.pb.collection('events').delete(event.id))
  })

  it('draft events are hidden from regular users; published events are visible', async () => {
    const draft = await fx.event({ status: 'draft' })
    const published = await fx.event({ status: 'published' })
    const user = await fx.user()
    await expectDenied(user.pb.collection('events').getOne(draft.id))
    expect((await user.pb.collection('events').getOne(published.id)).id).toBe(published.id)
  })

  it('validates the registration window', async () => {
    await expectFieldError(
      fx.event({
        registration_opens_at: '2026-03-01 00:00:00.000Z',
        registration_closes_at: '2026-02-01 00:00:00.000Z',
      }),
      'registration_closes_at',
      'invalid_range',
    )
  })

  it('M1-T06 / M1-07: stores an event with two competition days', async () => {
    const admin = await fx.admin()
    const event = await admin.pb
      .collection('events')
      .create({ name: 'Two-day final', season: 2026, status: 'draft' })
    await admin.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Day 1' })
    await admin.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-14', label: 'Day 2' })

    const days = await admin.pb
      .collection('competition_days')
      .getFullList({ filter: `event = "${event.id}"`, sort: 'date' })
    expect(days.map((d) => [d.date, d.label])).toEqual([
      ['2026-06-13', 'Day 1'],
      ['2026-06-14', 'Day 2'],
    ])
  })

  it('rejects invalid and duplicate competition days', async () => {
    const event = await fx.event()
    await expectFieldError(
      fx.su.collection('competition_days').create({ event: event.id, date: '2026-02-30' }),
      'date',
      'invalid_date',
    )
    await expectFieldError(
      fx.su.collection('competition_days').create({ event: event.id, date: '13.06.2026' }),
      'date',
    )
    await fx.su.collection('competition_days').create({ event: event.id, date: '2026-06-13' })
    await expectDenied(
      fx.su.collection('competition_days').create({ event: event.id, date: '2026-06-13' }),
    )
  })

  it('M1-T12: archived events stay readable for event staff and become read-only', async () => {
    const event = await fx.event({ status: 'published' })
    const category = await fx.category(event.id)
    const outsider = await fx.user()
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const team = await fx.team(event.id, category.id, { name: 'Archivists', status: 'approved' })
    await fx.su.collection('competition_days').create({ event: event.id, date: '2026-06-13' })

    await fx.su.collection('events').update(event.id, { status: 'archived' })

    // Historical records remain accessible to the event's staff.
    for (const user of [judge, manager]) {
      expect((await user.pb.collection('events').getOne(event.id)).status).toBe('archived')
    }
    expect((await judge.pb.collection('teams').getOne(team.id)).name).toBe('Archivists')
    expect((await judge.pb.collection('categories').getOne(category.id)).id).toBe(category.id)
    expect(
      await judge.pb
        .collection('competition_days')
        .getFullList({ filter: `event = "${event.id}"` }),
    ).toHaveLength(1)

    // Not visible to unrelated users.
    await expectDenied(outsider.pb.collection('events').getOne(event.id))

    // Read-only, also for structural changes by the manager.
    await expectDenied(judge.pb.collection('teams').update(team.id, { name: 'Renamed' }))
    await expectDenied(
      manager.pb.collection('competition_days').create({ event: event.id, date: '2026-06-14' }),
    )
    await expectDenied(manager.pb.collection('categories').update(category.id, { name: 'Renamed' }))
  })

  // Regression: deleting an event cascades through teams (required category relation) and
  // finalized games (whose ruleset and table disappear in the same transaction).
  it('admins delete a fully used event, including its teams, tables and finalized scores', async () => {
    const admin = await fx.admin()
    const { event, category, manager, team, notify } = await fx.scheduledTeam()
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const day = await manager.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Saturday' })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R2',
      name: 'Round 2',
      position: 2,
      testing_minutes: 0,
      scoring_minutes: 10,
      day: day.id,
    })
    const draft = await manager.pb.collection('rulesets').create({
      category: category.id,
      status: 'draft',
      definition: {
        schemaVersion: 1,
        precision: 0,
        root: {
          id: 'total',
          label: 'Total',
          type: 'group',
          aggregate: 'sum',
          children: [{ id: 'flag', label: 'Flag', type: 'boolean', points: 10, required: true }],
        },
      },
    })
    await manager.pb.collection('rulesets').update(draft.id, { status: 'published' })
    const table = await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'B', active: true, position: 2, judges: [judge.id] })
    const game = await manager.pb.collection('games').create({
      round: round.id,
      team: team.id,
      status: 'scheduled',
      table: table.id,
      sequence: 1,
    })
    await judge.pb.send(`/api/games/${game.id}/sheet/submit`, {
      method: 'POST',
      body: { outcome: 'completed', values: { flag: true }, time_ms: 1000 },
    })
    await headJudge.pb.send(`/api/games/${game.id}/sheet/approve`, { method: 'POST', body: {} })
    expect((await fx.su.collection('games').getOne(game.id)).status).toBe('completed')
    expect((await notify()).queued).toBe(1)
    await fx.su.collection('events').update(event.id, { status: 'archived' })

    await admin.pb.collection('events').delete(event.id)

    await expectDenied(fx.su.collection('events').getOne(event.id))
    const byEvent = `event = "${event.id}"`
    for (const name of ['categories', 'teams', 'tables', 'competition_days', 'role_assignments']) {
      expect(await fx.su.collection(name).getFullList({ filter: byEvent }), name).toHaveLength(0)
    }
    const byCategory = `category = "${category.id}"`
    for (const name of ['rounds', 'rulesets', 'game_rules']) {
      expect(await fx.su.collection(name).getFullList({ filter: byCategory }), name).toHaveLength(0)
    }
    expect(
      await fx.su.collection('games').getFullList({ filter: `team = "${team.id}"` }),
    ).toHaveLength(0)
    expect(
      await fx.su.collection('score_sheets').getFullList({ filter: `game = "${game.id}"` }),
    ).toHaveLength(0)
  })
})
