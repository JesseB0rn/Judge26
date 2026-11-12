import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, TEST_APP_URL, type TestServer } from './support/pocketbase'
import {
  expectDenied,
  expectFieldError,
  Fixtures,
  mailsTo,
  PASSWORD,
  tokenFromMail,
  type TestUser,
} from './support/fixtures'

// M8-B: judge invitations (docs/specifications/M8-invitations.md).

interface Row {
  line: number
  name: string
  email: string
  role: string
  status: string
  errors: string[]
}
interface StaffMember {
  id: string
  role: string
  status: string
  user: { id: string; name: string; email: string; verified: boolean }
  invitation: { id: string; status: string; expires_at: string } | null
}

describe('M8-B invitations', () => {
  let server: TestServer
  let fx: Fixtures
  let event: RecordModel
  let manager: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    event = await fx.event({ name: 'Swiss Final' })
    manager = await fx.user({
      name: 'Max Manager',
      roles: [{ role: 'event_manager', event: event.id }],
    })
  })
  afterAll(() => server?.dispose())

  let n = 0
  const email = (prefix = 'judge') => `${prefix}-${Date.now()}-${++n}@test.local`
  const preview = (user: TestUser, rows: unknown[], eventId = event.id) =>
    user.pb.send<{ rows: Row[]; counts: Record<string, number> }>(
      `/api/events/${eventId}/invitations/preview`,
      { method: 'POST', body: { rows } },
    )
  const invite = (user: TestUser, rows: unknown[], eventId = event.id) =>
    user.pb.send<{ rows: Row[]; counts: Record<string, number> }>(
      `/api/events/${eventId}/invitations`,
      { method: 'POST', body: { rows } },
    )
  const staff = (user: TestUser, eventId = event.id) =>
    user.pb.send<StaffMember[]>(`/api/events/${eventId}/staff`, {})
  const member = async (address: string) =>
    (await staff(manager)).find((m) => m.user.email === address)
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${server.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  const lookup = async (token: string) =>
    (await fetch(`${server.url}/api/invitations/lookup?token=${encodeURIComponent(token)}`)).json()
  const accept = (token: string, password = 'new-password-1') =>
    post('/api/invitations/accept', { token, password, passwordConfirm: password })

  it('M8-T04: the preview classifies new, existing, invalid and duplicate rows', async () => {
    const existing = await fx.user({ name: 'Existing Judge' })
    const fresh = email()
    const result = await preview(manager, [
      { name: 'New Judge', email: fresh },
      { name: 'Existing Judge', email: existing.email.toUpperCase(), role: 'head_judge' },
      { name: '', email: 'not-an-email' },
      { name: 'Twice', email: fresh },
      { name: 'Boss', email: email(), role: 'event_manager' },
    ])
    expect(result.rows.map((r) => [r.status, r.errors])).toEqual([
      ['invite', []],
      ['add', []],
      ['invalid', ['name_required', 'invalid_email']],
      ['duplicate', []],
      ['invalid', ['invalid_role']], // managers cannot invite managers
    ])
    expect(result.counts).toMatchObject({ invite: 1, add: 1, invalid: 2, duplicate: 1 })
    // Nothing was created.
    expect(
      await fx.su.collection('users').getFullList({ filter: `email = "${fresh}"` }),
    ).toHaveLength(0)
  })

  it('M8-07 / M8-08: invites new people and adds existing accounts, each with an email', async () => {
    const existing = await fx.user({ name: 'Ada Existing' })
    const fresh = email()
    const result = await invite(manager, [
      { name: 'Grace New', email: fresh },
      { name: 'Ada Existing', email: existing.email, role: 'head_judge' },
      { name: 'Grace Again', email: fresh },
    ])
    expect(result.counts).toMatchObject({ invite: 1, add: 1, duplicate: 1 })

    const user = await fx.su.collection('users').getFirstListItem(`email = "${fresh}"`)
    expect(user).toMatchObject({ name: 'Grace New', verified: false })
    const roles = await fx.su.collection('role_assignments').getFullList({
      filter: `event = "${event.id}" && (user = "${user.id}" || user = "${existing.id}")`,
    })
    expect(roles.map((r) => [r.user, r.role]).sort()).toEqual(
      [
        [user.id, 'judge'],
        [existing.id, 'head_judge'],
      ].sort(),
    )

    const [invitation] = await mailsTo(server, fresh)
    expect(invitation!.subject).toBe('You are invited to Swiss Final')
    expect(invitation!.html).toContain(
      'Max Manager invites you to <strong>Swiss Final</strong> as judge',
    )
    const { url } = await tokenFromMail(server, fresh, '/auth/invitation')
    expect(url.startsWith(`${TEST_APP_URL}/auth/invitation?token=`)).toBe(true)

    const [added] = await mailsTo(server, existing.email)
    expect(added!.subject).toBe('You were added to Swiss Final')
    expect(added!.html).toContain('as head judge')
    expect(added!.html).toContain(`${TEST_APP_URL}/login`)

    // Inviting again changes nothing for people who already have the role.
    const again = await invite(manager, [
      { name: 'Ada Existing', email: existing.email, role: 'head_judge' },
    ])
    expect(again.rows[0]!.status).toBe('already')
  })

  it('M8-09: the staff list shows active, invited and expired members', async () => {
    const fresh = email()
    await invite(manager, [{ name: 'Status Judge', email: fresh }])
    expect(await member(fresh)).toMatchObject({
      role: 'judge',
      status: 'invited',
      user: { name: 'Status Judge', verified: false },
      invitation: { status: 'invited' },
    })
    expect((await member(manager.email))!.status).toBe('active')

    const invitation = await fx.su
      .collection('invitations')
      .getFirstListItem(`event = "${event.id}" && user.email = "${fresh}"`)
    await fx.su
      .collection('invitations')
      .update(invitation.id, { expires_at: '2020-01-01 00:00:00.000Z' })
    expect((await member(fresh))!.status).toBe('expired')
    // The token hash never leaves the server.
    expect(
      (await manager.pb.collection('invitations').getOne(invitation.id)).token_hash,
    ).toBeUndefined()
  })

  it('M8-10 / M8-T05: accepting sets the password, verifies the account and signs in', async () => {
    const fresh = email()
    await invite(manager, [{ name: 'Accepting Judge', email: fresh }])
    const { token } = await tokenFromMail(server, fresh, '/auth/invitation')

    expect(await lookup(token)).toMatchObject({
      status: 'invited',
      name: 'Accepting Judge',
      email: fresh,
      role: 'judge',
      event: { id: event.id, name: 'Swiss Final' },
    })
    await expect(
      server.client().collection('users').authWithPassword(fresh, 'new-password-1'),
    ).rejects.toThrow()

    const short = await post('/api/invitations/accept', {
      token,
      password: 'short',
      passwordConfirm: 'short',
    })
    expect(short.status).toBe(400)
    const accepted = await accept(token)
    expect(accepted).toMatchObject({
      status: 200,
      body: { email: fresh, role: 'judge', event: event.id },
    })

    const pb = server.client()
    const auth = await pb.collection('users').authWithPassword(fresh, 'new-password-1')
    expect(auth.record.verified).toBe(true)
    expect((await member(fresh))!.status).toBe('active')
  })

  it('M8-T06: used, expired, revoked and unknown links are rejected', async () => {
    const used = email()
    await invite(manager, [{ name: 'Used', email: used }])
    const usedToken = (await tokenFromMail(server, used, '/auth/invitation')).token
    await accept(usedToken)
    expect(await lookup(usedToken)).toEqual({ status: 'invalid' })
    expect((await accept(usedToken)).status).toBe(400)

    const expired = email()
    await invite(manager, [{ name: 'Expired', email: expired }])
    const expiredToken = (await tokenFromMail(server, expired, '/auth/invitation')).token
    const record = await fx.su
      .collection('invitations')
      .getFirstListItem(`user.email = "${expired}"`)
    await fx.su
      .collection('invitations')
      .update(record.id, { expires_at: '2020-01-01 00:00:00.000Z' })
    expect(await lookup(expiredToken)).toEqual({ status: 'expired' })
    expect((await accept(expiredToken)).body).toMatchObject({
      data: { _error: { code: 'invitation_expired' } },
    })

    expect(await lookup('x'.repeat(48))).toEqual({ status: 'invalid' })
  })

  it('resending replaces the link; revoking removes the role and the link', async () => {
    const fresh = email()
    await invite(manager, [{ name: 'Resend Judge', email: fresh }])
    const first = (await tokenFromMail(server, fresh, '/auth/invitation')).token
    const invitation = (await member(fresh))!.invitation!

    await manager.pb.send(`/api/invitations/${invitation.id}/resend`, { method: 'POST' })
    await expect.poll(async () => (await mailsTo(server, fresh)).length).toBe(2)
    const second = (await tokenFromMail(server, fresh, '/auth/invitation')).token
    expect(second).not.toBe(first)
    expect(await lookup(first)).toEqual({ status: 'invalid' })
    expect((await lookup(second)).status).toBe('invited')

    await manager.pb.send(`/api/invitations/${invitation.id}/revoke`, { method: 'POST' })
    expect(await lookup(second)).toEqual({ status: 'invalid' })
    const revoked = (await staff(manager)).filter((m) => m.user.email === fresh)
    expect(revoked.map((m) => m.status)).toEqual(['revoked'])
    const user = await fx.su.collection('users').getFirstListItem(`email = "${fresh}"`)
    expect(
      await fx.su.collection('role_assignments').getFullList({ filter: `user = "${user.id}"` }),
    ).toHaveLength(0)

    // Resending a revoked invitation invites again.
    await manager.pb.send(`/api/invitations/${invitation.id}/resend`, { method: 'POST' })
    expect((await member(fresh))!.status).toBe('invited')
  })

  it('an account that was never activated is invited, not just added', async () => {
    const address = email()
    await fx.su.collection('users').create({
      email: address,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: 'Self Registered',
      verified: false,
    })
    const result = await invite(manager, [{ name: 'Real Name', email: address }])
    expect(result.rows[0]!.status).toBe('invite')
    expect(await fx.su.collection('users').getFirstListItem(`email = "${address}"`)).toMatchObject({
      name: 'Real Name',
    })
  })

  it('managers remove judges; only admins invite or remove event managers', async () => {
    const fresh = email()
    await invite(manager, [{ name: 'Removable', email: fresh }])
    const judge = (await member(fresh))!
    await manager.pb.send(`/api/events/${event.id}/staff/${judge.id}`, { method: 'DELETE' })
    expect((await member(fresh))!.status).toBe('revoked')

    const own = (await member(manager.email))!
    await expectDenied(
      manager.pb.send(`/api/events/${event.id}/staff/${own.id}`, { method: 'DELETE' }),
    )

    const admin = await fx.admin()
    const boss = email('manager')
    const result = await invite(admin, [
      { name: 'New Manager', email: boss, role: 'event_manager' },
    ])
    expect(result.rows[0]!.status).toBe('invite')
  })

  it('only the event’s managers and admins manage its staff', async () => {
    const other = await fx.event()
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const otherManager = await fx.user({ roles: [{ role: 'event_manager', event: other.id }] })
    for (const user of [judge, otherManager, await fx.user()]) {
      await expectDenied(staff(user))
      await expectDenied(invite(user, [{ name: 'X', email: email() }]))
      await expectDenied(preview(user, [{ name: 'X', email: email() }]))
    }
    // The invitations collection is read-only through the API and hidden from staff.
    expect(await judge.pb.collection('invitations').getFullList()).toHaveLength(0)
    expect((await manager.pb.collection('invitations').getFullList()).length).toBeGreaterThan(0)
    await expectDenied(
      manager.pb
        .collection('invitations')
        .create({ user: manager.id, event: event.id, role: 'judge' }),
    )
  })

  it('validates the request and rejects archived events', async () => {
    await expectFieldError(invite(manager, []), 'rows', 'invalid_rows')
    await expectFieldError(invite(manager, 'nope' as unknown as unknown[]), 'rows', 'invalid_rows')
    const archived = await fx.event({ status: 'archived' })
    const archivedManager = await fx.user({
      roles: [{ role: 'event_manager', event: archived.id }],
    })
    await expectDenied(invite(archivedManager, [{ name: 'X', email: email() }], archived.id))
  })

  it('invitation emails use the inviter’s language for new accounts', async () => {
    const german = await fx.user({
      name: 'Maria',
      roles: [{ role: 'event_manager', event: event.id }],
    })
    await german.pb.collection('users').update(german.id, { language: 'de' })
    const fresh = email()
    await invite(german, [{ name: 'Hans', email: fresh }])
    const [mail] = await mailsTo(server, fresh)
    expect(mail!.subject).toBe('Einladung zu Swiss Final')
    expect(mail!.html).toContain('als Schiedsrichter/in')
  })
})
