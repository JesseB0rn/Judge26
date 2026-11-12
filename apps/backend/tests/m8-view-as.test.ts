import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, PASSWORD, validMembers, type TestUser } from './support/fixtures'

// M8-C: admins view the app as a role of an event (docs/specifications/M8-view-as.md).

interface Started {
  token: string
  record: { id: string; email: string; name: string; verified: boolean }
  session: {
    id: string
    role: string
    event: { id: string; name: string }
    persona: { id: string; name: string } | null
    read_only: boolean
    admin: { id: string; email: string }
  }
}

describe('M8-C view as', () => {
  let server: TestServer
  let fx: Fixtures
  let event: RecordModel
  let other: RecordModel
  let category: RecordModel
  let admin: TestUser
  let judge: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    event = await fx.event({ name: 'Swiss Final' })
    other = await fx.event({ name: 'Other Event' })
    category = await fx.category(event.id)
    admin = await fx.user({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    judge = await fx.user({ name: 'Jane Judge', roles: [{ role: 'judge', event: event.id }] })
  })
  afterAll(() => server?.dispose())

  const start = (user: TestUser | PocketBase, body: Record<string, unknown>) =>
    ('pb' in user ? user.pb : user).send<Started>('/api/view-as', { method: 'POST', body })

  /** A client signed in with the switched token. */
  function switched(started: Started) {
    const pb = server.client()
    pb.authStore.save(started.token, { ...started.record, collectionName: 'users' } as never)
    return pb
  }
  const end = (pb: PocketBase) => pb.send('/api/view-as/end', { method: 'POST' })

  async function auditOf(action: string, record?: string) {
    const filter = record
      ? fx.su.filter('action = {:a} && record = {:r}', { a: action, r: record })
      : fx.su.filter('action = {:a}', { a: action })
    return fx.su.collection('audit_log').getFullList({ filter, sort: '-created' })
  }

  it('switches an admin to a judge of the event; the session describes itself (M8-13, M8-15)', async () => {
    const started = await start(admin, { event: event.id, role: 'judge' })
    expect(started.session).toMatchObject({
      role: 'judge',
      event: { id: event.id, name: 'Swiss Final' },
      persona: null,
      read_only: false,
      admin: { id: admin.id, email: admin.email },
    })
    expect(started.record.id).not.toBe(admin.id)
    expect(started.record.verified).toBe(true)
    const pb = switched(started)
    const roles = await pb.collection('role_assignments').getFullList({
      filter: pb.filter('user = {:u}', { u: started.record.id }),
    })
    expect(roles.map((r) => [r.role, r.event])).toEqual([['judge', event.id]])
    const current = await pb.send<{ session: Started['session'] }>('/api/view-as', {})
    expect(current.session.id).toBe(started.session.id)
    expect(await auditOf('view_as.start', started.session.id)).toHaveLength(1)
    await end(pb)
  })

  it('applies the role in the API, not the admin rights (M8-09, M8-14)', async () => {
    const started = await start(admin, { event: event.id, role: 'judge' })
    const pb = switched(started)
    // Event manager and admin APIs are denied.
    await expectDenied(pb.send(`/api/events/${event.id}/staff`, {}))
    await expectDenied(pb.send('/api/admin/users', {}))
    await expectDenied(pb.collection('events').update(event.id, { name: 'Renamed' }))
    await expectDenied(
      pb.collection('teams').create({
        event: event.id,
        category: category.id,
        name: 'Sneaky',
        members: validMembers(),
      }),
    )
    // The switch cannot switch again or be used for another role (M8-18).
    await expectDenied(start(pb, { event: event.id, role: 'event_manager' }))
    await end(pb)
  })

  it('records writes under the admin with the effective role (M8-10, M8-17)', async () => {
    const started = await start(admin, { event: event.id, role: 'event_manager' })
    const pb = switched(started)
    const team = await pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: 'Made while switched',
      status: 'approved',
      members: validMembers(),
    })
    // Rights end at the chosen event.
    await expectDenied(pb.collection('events').update(other.id, { name: 'Renamed' }))
    const [entry] = await auditOf('create', team.id)
    expect(entry).toMatchObject({
      actor: admin.id,
      actor_label: admin.email,
      view_as: 'event_manager · Swiss Final',
    })
    await end(pb)
    const [ended] = await auditOf('view_as.end', started.session.id)
    expect(ended).toMatchObject({ actor: admin.id, view_as: 'event_manager · Swiss Final' })
  })

  it('refuses the token once the session ended and removes the role', async () => {
    const started = await start(admin, { event: event.id, role: 'event_manager' })
    const pb = switched(started)
    await pb.send(`/api/events/${event.id}/staff`, {})
    await end(pb)
    await expectDenied(pb.send(`/api/events/${event.id}/staff`, {}))
    const roles = await fx.su.collection('role_assignments').getFullList({
      filter: fx.su.filter('user = {:u}', { u: started.record.id }),
    })
    expect(roles).toEqual([])
  })

  it('starting a new switch ends the previous one', async () => {
    const first = switched(await start(admin, { event: event.id, role: 'event_manager' }))
    const second = switched(await start(admin, { event: event.id, role: 'head_judge' }))
    await expectDenied(first.send('/api/view-as', {}))
    await second.send('/api/view-as', {})
    await end(second)
  })

  it('views as a specific judge, read-only (M8-16)', async () => {
    const started = await start(admin, { event: event.id, role: 'judge', user: judge.id })
    expect(started.record.id).toBe(judge.id)
    expect(started.session).toMatchObject({
      persona: { id: judge.id, name: 'Jane Judge' },
      read_only: true,
    })
    const pb = switched(started)
    const roles = await pb.collection('role_assignments').getFullList({
      filter: pb.filter('user = {:u}', { u: judge.id }),
    })
    expect(roles.map((r) => r.role)).toEqual(['judge'])
    const error = await expectDenied(pb.collection('users').update(judge.id, { name: 'Changed' }))
    expect(error.status).toBe(403)
    // The judge's own sign-in keeps working, and ending the switch does not sign them out.
    await end(pb)
    await expectDenied(pb.send('/api/view-as', {}))
    expect(await judge.pb.collection('users').getOne(judge.id)).toMatchObject({
      name: 'Jane Judge',
    })
  })

  it('only allows people who hold the role in the event', async () => {
    await expectDenied(start(admin, { event: other.id, role: 'judge', user: judge.id }))
    await expectDenied(start(admin, { event: event.id, role: 'head_judge', user: judge.id }))
    await expectDenied(start(admin, { event: event.id, role: 'admin' }))
    await expectDenied(start(admin, { event: 'missing', role: 'judge' }))
    const unverified = await fx.user({
      verified: false,
      roles: [{ role: 'judge', event: event.id }],
    })
    await expectDenied(start(admin, { event: event.id, role: 'judge', user: unverified.id }))
  })

  it('denies non-admins (M8-11, M8-18)', async () => {
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    await expectDenied(start(manager, { event: event.id, role: 'judge' }))
    await expectDenied(start(judge, { event: event.id, role: 'judge', user: judge.id }))
    await expectDenied(start(server.client(), { event: event.id, role: 'judge' }))
  })

  it('keeps stand-in accounts out of sign-in, sign-up, user and staff lists', async () => {
    const started = await start(admin, { event: event.id, role: 'judge' })
    const pb = switched(started)
    const anonymous = server.client()
    await expectDenied(
      anonymous.collection('users').authWithPassword(started.record.email, PASSWORD),
    )
    await expectDenied(
      anonymous.collection('users').create({
        email: `preview-x${Date.now()}@preview.invalid`,
        password: PASSWORD,
        passwordConfirm: PASSWORD,
      }),
    )
    const users = await admin.pb.send<{ items: { id: string }[] }>('/api/admin/users?limit=200', {})
    expect(users.items.map((u) => u.id)).not.toContain(started.record.id)
    const staff = await admin.pb.send<{ user: { id: string } }[]>(
      `/api/events/${event.id}/staff`,
      {},
    )
    expect(staff.map((m) => m.user.id)).not.toContain(started.record.id)
    // A stand-in cannot be handed to someone through an invitation either.
    const invited = await admin.pb.send<{ rows: { status: string }[] }>(
      `/api/events/${event.id}/invitations/preview`,
      { method: 'POST', body: { rows: [{ name: 'X', email: started.record.email }] } },
    )
    expect(invited.rows[0].status).toBe('invalid')
    await end(pb)
  })

  it('reuses one stand-in account per admin', async () => {
    const a = await start(admin, { event: event.id, role: 'judge' })
    await end(switched(a))
    const b = await start(admin, { event: other.id, role: 'event_manager' })
    expect(b.record.id).toBe(a.record.id)
    await end(switched(b))
  })
})
