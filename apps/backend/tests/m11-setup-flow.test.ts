import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// M11: event setup flow (docs/specifications/M11-setup-flow.md).

interface Step {
  key: string
  done: boolean
  needs: string[]
  tables_without_judges?: number
  tables_without_judges_names?: string[]
}

describe('M11 event setup flow', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  const steps = async (user: TestUser, id: string) =>
    (await user.pb.send<{ steps: Step[] }>(`/api/events/${id}/setup`, {})).steps
  const daysOf = (eventId: string) =>
    fx.su.collection('competition_days').getFullList({ filter: `event = "${eventId}"` })
  const eventsNamed = (name: string) =>
    fx.su.collection('events').getFullList({ filter: `name = "${name}"` })

  it('M11-T12: a new event is always a draft (superusers excepted)', async () => {
    await expectFieldError(
      admin.pb.collection('events').create({ name: 'Live', season: 2026, status: 'published' }),
      'status',
      'event_create_draft',
    )
    expect(await eventsNamed('Live')).toEqual([])
    const created = await admin.pb.collection('events').create({ name: 'Plain', season: 2026 })
    expect(created.status).toBe('draft')
    const draft = await admin.pb
      .collection('events')
      .create({ name: 'Draft', season: 2026, status: 'draft' })
    expect(draft.status).toBe('draft')
    // Superusers (seeding, restores) may still create any status.
    expect((await fx.event({ status: 'published' })).status).toBe('published')
    // Publishing later stays an update.
    const published = await admin.pb.collection('events').update(draft.id, { status: 'published' })
    expect(published.status).toBe('published')
  })

  it('M11-T13: an empty event is created with its first day; an invalid day creates neither', async () => {
    const created = await admin.pb.collection('events').create({
      name: 'With day',
      season: 2027,
      first_day: { date: '2027-03-06', starts_at: '08:00', ends_at: '18:00' },
    })
    const days = await daysOf(created.id)
    expect(days.map((d) => [d.date, d.starts_at, d.ends_at])).toEqual([
      ['2027-03-06', '08:00', '18:00'],
    ])
    const status = await steps(admin, created.id)
    expect(status.find((s) => s.key === 'days')!.done).toBe(true)

    await expectFieldError(
      admin.pb.collection('events').create({
        name: 'Backwards',
        season: 2027,
        first_day: { date: '2027-03-06', starts_at: '18:00', ends_at: '08:00' },
      }),
      'first_day',
      'invalid_range',
    )
    await expectFieldError(
      admin.pb.collection('events').create({
        name: 'Backwards',
        season: 2027,
        first_day: { date: '2027-02-30' },
      }),
      'first_day',
      'invalid_date',
    )
    expect(await eventsNamed('Backwards')).toEqual([])

    // Without a date no day is created.
    const none = await admin.pb
      .collection('events')
      .create({ name: 'No day', season: 2027, first_day: { date: '' } })
    expect(await daysOf(none.id)).toEqual([])
  })

  it('M11-T09: the rounds step needs days and categories', async () => {
    const event = await fx.event({ status: 'draft' })
    const rounds = (await steps(admin, event.id)).find((s) => s.key === 'rounds')!
    expect(rounds.needs).toEqual(['days', 'categories'])
  })

  it('M11-T11: the tables step names the active tables without a judge', async () => {
    const event = await fx.event({ status: 'draft' })
    const category = await fx.category(event.id)
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const table = (name: string, position: number, extra: object = {}) =>
      fx.su.collection('tables').create({
        event: event.id,
        name,
        position,
        active: true,
        categories: [category.id],
        ...extra,
      })
    await table('Table 3', 3)
    await table('Table 1', 1, { judges: [judge.id] })
    await table('Table 2', 2)
    await table('Table 4', 4, { active: false })
    const tables = (await steps(admin, event.id)).find((s) => s.key === 'tables')!
    expect(tables).toMatchObject({
      done: false,
      tables_without_judges: 2,
      tables_without_judges_names: ['Table 2', 'Table 3'],
    })
  })

  it('M11-T07: a round is timed by updating its scoring phase with its version', async () => {
    const event = await fx.event({ status: 'draft' })
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const day = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', starts_at: '08:00', ends_at: '18:00' })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Run 1',
      position: 1,
      scoring_minutes: 15,
      day: day.id,
    })
    const scoring = () =>
      manager.pb
        .collection('round_phases')
        .getFirstListItem(`round = "${round.id}" && phase = "scoring"`)
    const phase = await scoring()
    expect(phase).toMatchObject({ day: day.id, starts_at: '' })
    const schedule = async () =>
      (await steps(manager, event.id)).find((s) => s.key === 'schedule') as unknown as {
        timed: number
        rounds: number
      }
    expect(await schedule()).toMatchObject({ timed: 0, rounds: 1 })

    await manager.pb
      .collection('round_phases')
      .update(phase.id, { starts_at: '10:00', expected_updated: phase.updated })
    expect((await scoring()).starts_at).toBe('10:00')
    expect(await schedule()).toMatchObject({ timed: 1, rounds: 1 })

    // A version read before a planner move is refused, as in the planner.
    const error = await manager.pb
      .collection('round_phases')
      .update(phase.id, { starts_at: '11:00', expected_updated: phase.updated })
      .catch((e: { status: number }) => e)
    expect((error as { status: number }).status).toBe(409)
  })
})
