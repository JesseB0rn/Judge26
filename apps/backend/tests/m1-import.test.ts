import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, validMembers } from './support/fixtures'

// Server side of M1-12 / M1-T10. CSV parsing and row-level reporting are unit-tested
// in the frontend (apps/web/src/modules/teams/import). Valid rows are imported in a
// single batch request, which PocketBase executes in one transaction.
describe('M1 team import (batch)', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  const row = (
    event: string,
    category: string,
    name: string,
    extra: Record<string, unknown> = {},
  ) => ({
    event,
    category,
    name,
    coach_email: 'import-coach@test.local',
    status: 'submitted',
    members: validMembers(),
    ...extra,
  })

  it('imports all rows atomically and links existing coach accounts by email', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const admin = await fx.admin()
    const coach = await fx.user()

    const batch = admin.pb.createBatch()
    batch
      .collection('teams')
      .create(row(event.id, category.id, 'Imported 1', { coach_email: coach.email }))
    batch.collection('teams').create(row(event.id, category.id, 'Imported 2'))
    await batch.send()

    const teams = await admin.pb
      .collection('teams')
      .getFullList({ filter: `event = "${event.id}"`, sort: 'name' })
    expect(teams.map((t) => [t.name, t.status])).toEqual([
      ['Imported 1', 'submitted'],
      ['Imported 2', 'submitted'],
    ])
    expect(teams[0]!.coach).toBe(coach.id)
    expect(teams[1]!.coach).toBe('')
    // The linked coach sees the imported team.
    expect(await coach.pb.collection('teams').getFullList()).toHaveLength(1)
  })

  it('M1-T10: a rejected row rolls back the whole batch', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const admin = await fx.admin()

    const batch = admin.pb.createBatch()
    batch.collection('teams').create(row(event.id, category.id, 'Valid'))
    batch.collection('teams').create(row(event.id, category.id, 'Invalid', { members: [] }))
    await expectDenied(batch.send())

    expect(
      await admin.pb.collection('teams').getFullList({ filter: `event = "${event.id}"` }),
    ).toHaveLength(0)
  })

  it('non-staff users cannot import teams', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const coach = await fx.user()
    const batch = coach.pb.createBatch()
    batch.collection('teams').create(row(event.id, category.id, 'Sneaky'))
    await expectDenied(batch.send())
  })
})
