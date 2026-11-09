import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures } from './support/fixtures'

describe('M1 roles and permissions', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  it('M1-T04: a judge cannot use admin operations', async () => {
    const event = await fx.event()
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const other = await fx.user()

    await expectDenied(
      judge.pb.collection('events').create({ name: 'X', season: 2026, status: 'draft' }),
    )
    await expectDenied(judge.pb.collection('events').update(event.id, { name: 'Hijacked' }))
    await expectDenied(judge.pb.collection('events').delete(event.id))
    await expectDenied(
      judge.pb.collection('role_assignments').create({ user: other.id, role: 'admin' }),
    )
    await expectDenied(
      judge.pb.send('/api/role-assignments/by-email', {
        method: 'POST',
        body: { email: other.email, role: 'judge', event: event.id },
      }),
    )
    expect((await fx.su.collection('events').getOne(event.id)).name).toBe(event.name)
  })

  it('M1-T05: a judge cannot access another event', async () => {
    const eventA = await fx.event({ status: 'draft' })
    const eventB = await fx.event({ status: 'draft' })
    const catB = await fx.category(eventB.id)
    const teamB = await fx.team(eventB.id, catB.id)
    await fx.su.collection('competition_days').create({ event: eventB.id, date: '2026-05-01' })
    const judge = await fx.user({ roles: [{ role: 'judge', event: eventA.id }] })

    const events = await judge.pb
      .collection('events')
      .getFullList({ filter: `id = "${eventA.id}" || id = "${eventB.id}"` })
    expect(events.map((e) => e.id)).toEqual([eventA.id])
    await expectDenied(judge.pb.collection('events').getOne(eventB.id))
    await expectDenied(judge.pb.collection('teams').getOne(teamB.id))
    await expectDenied(judge.pb.collection('categories').getOne(catB.id))
    expect(
      await judge.pb
        .collection('competition_days')
        .getFullList({ filter: `event = "${eventB.id}"` }),
    ).toHaveLength(0)
  })

  it('a judge can read teams of their own event', async () => {
    const event = await fx.event()
    const cat = await fx.category(event.id)
    const team = await fx.team(event.id, cat.id)
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    expect((await judge.pb.collection('teams').getOne(team.id)).id).toBe(team.id)
    await expectDenied(judge.pb.collection('teams').update(team.id, { name: 'Changed' }))
  })

  it('M1-05: users can hold multiple roles, each scoped to its event', async () => {
    const eventA = await fx.event({ status: 'draft' })
    const eventB = await fx.event({ status: 'draft' })
    const user = await fx.user({
      roles: [
        { role: 'judge', event: eventA.id },
        { role: 'event_manager', event: eventB.id },
      ],
    })

    const roles = await user.pb.collection('role_assignments').getFullList()
    expect(roles.map((r) => r.role).sort()).toEqual(['event_manager', 'judge'])

    // Manager in B: may edit B. Only judge in A: may not edit A.
    await user.pb.collection('events').update(eventB.id, { venue: 'Hall 2' })
    await expectDenied(user.pb.collection('events').update(eventA.id, { venue: 'Hall 2' }))
  })

  it('validates role scoping', async () => {
    const event = await fx.event()
    const user = await fx.user()
    await expectFieldError(
      fx.su
        .collection('role_assignments')
        .create({ user: user.id, role: 'admin', event: event.id }),
      'event',
      'not_allowed',
    )
    await expectFieldError(
      fx.su.collection('role_assignments').create({ user: user.id, role: 'judge' }),
      'event',
      'required',
    )
    await fx.su
      .collection('role_assignments')
      .create({ user: user.id, role: 'judge', event: event.id })
    await expectDenied(
      fx.su
        .collection('role_assignments')
        .create({ user: user.id, role: 'judge', event: event.id }),
    )
  })

  it('admins assign roles by email', async () => {
    const event = await fx.event()
    const admin = await fx.admin()
    const user = await fx.user()

    const assignment = await admin.pb.send('/api/role-assignments/by-email', {
      method: 'POST',
      body: { email: user.email, role: 'head_judge', event: event.id },
    })
    expect(assignment).toMatchObject({ user: user.id, role: 'head_judge', event: event.id })

    await expectFieldError(
      admin.pb.send('/api/role-assignments/by-email', {
        method: 'POST',
        body: { email: 'nobody@test.local', role: 'judge', event: event.id },
      }),
      'email',
      'not_found',
    )
  })

  it('users see only their own role assignments; admins see all', async () => {
    const event = await fx.event()
    const a = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const b = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const admin = await fx.admin()

    const own = await a.pb.collection('role_assignments').getFullList()
    expect(own.every((r) => r.user === a.id)).toBe(true)
    const all = await admin.pb
      .collection('role_assignments')
      .getFullList({ filter: `event = "${event.id}"` })
    expect(all.map((r) => r.user).sort()).toEqual([a.id, b.id].sort())
  })

  it('admins search users by name or email; others cannot', async () => {
    const admin = await fx.admin()
    const target = await fx.user({ name: 'Searchable Person' })
    const other = await fx.user()
    type Result = { total: number; items: { id: string; email: string }[] }
    const search = (pb: typeof admin.pb, q: string) =>
      pb.send<Result>('/api/admin/users', { query: { q } })

    const byEmail = await search(admin.pb, target.email)
    expect(byEmail.items).toEqual([expect.objectContaining({ id: target.id, email: target.email })])
    expect(byEmail.total).toBe(1)
    const byName = await search(admin.pb, 'Searchable')
    expect(byName.items.map((u) => u.id)).toContain(target.id)

    await expectDenied(search(other.pb, target.email))
  })

  it('an unverified admin has no admin access', async () => {
    const user = await fx.user({ verified: false, roles: [{ role: 'admin' }] })
    await expectDenied(
      user.pb.collection('events').create({ name: 'X', season: 2026, status: 'draft' }),
    )
  })
})
