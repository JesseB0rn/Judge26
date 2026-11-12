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
    coach_email: 'contact@test.local',
    status: 'approved',
    members: validMembers(),
    ...extra,
  })

  it('M8-03: imports all rows atomically as active teams; contacts get no access', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const admin = await fx.admin()
    const contact = await fx.user()

    const batch = admin.pb.createBatch()
    batch
      .collection('teams')
      .create(row(event.id, category.id, 'Imported 1', { coach_email: contact.email }))
    batch.collection('teams').create(row(event.id, category.id, 'Imported 2', { coach_email: '' }))
    await batch.send()

    const teams = await admin.pb
      .collection('teams')
      .getFullList({ filter: `event = "${event.id}"`, sort: 'name' })
    expect(teams.map((t) => [t.name, t.status, t.coach])).toEqual([
      ['Imported 1', 'approved', ''],
      ['Imported 2', 'approved', ''],
    ])
    expect(await contact.pb.collection('teams').getFullList()).toHaveLength(0)
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
    const user = await fx.user()
    const batch = user.pb.createBatch()
    batch.collection('teams').create(row(event.id, category.id, 'Sneaky'))
    await expectDenied(batch.send())
  })
})
