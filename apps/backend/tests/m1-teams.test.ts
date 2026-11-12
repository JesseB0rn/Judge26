import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import {
  expectDenied,
  expectFieldError,
  Fixtures,
  validMembers,
  type TestUser,
} from './support/fixtures'

// Teams (M1-12, M8-A): event managers create and import them; teams are active (approved) or
// withdrawn. Nobody owns a team and other users cannot read or write them.
describe('M1 / M8-A teams', () => {
  let server: TestServer
  let fx: Fixtures
  let event: RecordModel
  let category: RecordModel
  let admin: TestUser
  let manager: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    event = await fx.event({ status: 'published' })
    category = await fx.category(event.id)
    admin = await fx.admin()
    manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
  })
  afterAll(() => server?.dispose())

  let n = 0
  const create = (user: TestUser, data: Record<string, unknown> = {}) =>
    user.pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: `Team ${++n}`,
      status: 'approved',
      members: validMembers(),
      ...data,
    })

  it('M8-03: managers create active teams; the contact is optional', async () => {
    const team = await create(manager)
    expect(team).toMatchObject({ status: 'approved', coach: '', coach_email: '' })
    const withContact = await create(manager, {
      coach_name: 'Grace Hopper',
      coach_email: 'grace@test.local',
    })
    expect(withContact).toMatchObject({
      coach: '',
      coach_name: 'Grace Hopper',
      coach_email: 'grace@test.local',
    })
  })

  it('M8-02: other users cannot create teams, even in an open event', async () => {
    const user = await fx.user()
    await expectDenied(create(user))
    await expectDenied(create(user, { status: 'draft', coach: user.id }))
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    await expectDenied(create(judge))
  })

  it('M8-04: a contact with an account does not get access to the team', async () => {
    const contact = await fx.user()
    const team = await create(manager, { coach_email: contact.email })
    expect(team.coach).toBe('')
    await expectDenied(contact.pb.collection('teams').getOne(team.id))
    await expectDenied(contact.pb.collection('teams').update(team.id, { name: 'Changed' }))
    expect(await contact.pb.collection('teams').getFullList()).toHaveLength(0)
  })

  it('M8-04: a team linked to an account before M8-A grants that account nothing', async () => {
    const former = await fx.user()
    const team = await fx.team(event.id, category.id, { coach: former.id })
    await expectDenied(former.pb.collection('teams').getOne(team.id))
    await expectDenied(former.pb.collection('teams').update(team.id, { status: 'withdrawn' }))
    await expectDenied(former.pb.collection('teams').delete(team.id))
  })

  it('event staff read the teams of their event', async () => {
    const team = await create(manager)
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    expect((await judge.pb.collection('teams').getOne(team.id)).id).toBe(team.id)
    await expectDenied(judge.pb.collection('teams').update(team.id, { name: 'Changed' }))
  })

  it('active teams must be complete; withdrawn ones may be incomplete', async () => {
    await expectFieldError(
      create(manager, { members: [validMembers()[0]] }),
      'members',
      'incomplete_team',
    )
    await expectFieldError(
      create(manager, {
        members: [
          { first_name: 'Too', last_name: 'Young', birth_year: 2020 },
          { first_name: 'Ok', last_name: 'Member', birth_year: 2013 },
        ],
      }),
      'members',
      'incomplete_team',
    )
    const team = await create(manager)
    const withdrawn = await manager.pb
      .collection('teams')
      .update(team.id, { status: 'withdrawn', members: [] })
    expect(withdrawn.status).toBe('withdrawn')
  })

  it('validates member data', async () => {
    await expectFieldError(
      create(manager, { members: [{ first_name: '', last_name: 'X', birth_year: 2013.5 }] }),
      'members',
      'invalid_members',
    )
    await expectFieldError(
      create(manager, { members: { not: 'a list' } }),
      'members',
      'invalid_members',
    )
  })

  it('managers edit, withdraw and reactivate teams', async () => {
    const team = await create(manager)
    const edited = await manager.pb
      .collection('teams')
      .update(team.id, { organization: 'Edited by staff' })
    expect(edited.organization).toBe('Edited by staff')
    const withdrawn = await manager.pb.collection('teams').update(team.id, { status: 'withdrawn' })
    expect(withdrawn.status).toBe('withdrawn')
    const active = await manager.pb.collection('teams').update(team.id, { status: 'approved' })
    expect(active).toMatchObject({ status: 'approved', reviewed_by: manager.id })
  })

  it('teams registered before M8-A can be activated or withdrawn', async () => {
    for (const status of ['draft', 'submitted']) {
      const team = await fx.team(event.id, category.id, { status })
      const active = await admin.pb.collection('teams').update(team.id, { status: 'approved' })
      expect(active.status).toBe('approved')
    }
    const draft = await fx.team(event.id, category.id, { status: 'draft' })
    const withdrawn = await admin.pb.collection('teams').update(draft.id, { status: 'withdrawn' })
    expect(withdrawn.status).toBe('withdrawn')
  })

  it('enforces the status workflow', async () => {
    const team = await create(manager)
    for (const status of ['draft', 'submitted', 'rejected']) {
      await expectFieldError(
        admin.pb.collection('teams').update(team.id, { status, review_note: 'n/a' }),
        'status',
        'invalid_transition',
      )
    }
    await expectFieldError(
      create(admin, { status: 'rejected', review_note: 'n/a' }),
      'status',
      'invalid_status',
    )
  })

  it('only admins delete teams', async () => {
    const team = await create(manager)
    await expectDenied(manager.pb.collection('teams').delete(team.id))
    await admin.pb.collection('teams').delete(team.id)
  })

  it('team names are unique per category (case-insensitive)', async () => {
    await create(manager, { name: 'Robo Rangers' })
    await expectDenied(create(manager, { name: 'robo rangers' }))
  })

  it('rejects a category from another event', async () => {
    const otherEvent = await fx.event()
    const foreign = await fx.category(otherEvent.id)
    await expectFieldError(create(admin, { category: foreign.id }), 'category', 'invalid_category')
  })

  it('enforces the maximum number of active teams per category', async () => {
    const cat = await fx.category(event.id, { max_teams: 1 })
    await create(manager, { category: cat.id })
    await expectFieldError(create(manager, { category: cat.id }), 'status', 'category_full')
    const legacy = await fx.team(event.id, cat.id, { status: 'draft' })
    await expectFieldError(
      manager.pb.collection('teams').update(legacy.id, { status: 'approved' }),
      'status',
      'category_full',
    )
  })
})
