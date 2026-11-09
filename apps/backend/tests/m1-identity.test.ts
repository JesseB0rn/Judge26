import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { startPocketBase, TEST_APP_URL, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, PASSWORD, tokenFromMail } from './support/fixtures'

describe('M1 identity', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  const register = (email: string, password = PASSWORD) =>
    server.client().collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name: 'New Coach',
    })

  it('M1-T01 / M1-01: registers with valid credentials as unverified', async () => {
    const user = await register('t01@test.local')
    expect(user.id).toBeTruthy()
    expect(user.verified).toBe(false)
  })

  it('M1-T02: rejects registration with an existing email', async () => {
    await register('t02@test.local')
    const error = await expectDenied(register('t02@test.local'))
    expect(error.status).toBe(400)
    expect(Object.keys(error.response.data)).toContain('email')
  })

  it('rejects passwords shorter than 8 characters', async () => {
    await expectDenied(register('short@test.local', 'short'))
  })

  it('M1-T03: denies login with an invalid password', async () => {
    await register('t03@test.local')
    const error = await expectDenied(
      server.client().collection('users').authWithPassword('t03@test.local', 'wrong-password'),
    )
    expect(error.status).toBe(400)
  })

  it('M1-03: logs in and returns an auth token', async () => {
    await register('m103@test.local')
    const pb = server.client()
    const auth = await pb.collection('users').authWithPassword('m103@test.local', PASSWORD)
    expect(auth.token).toBeTruthy()
    expect(pb.authStore.isValid).toBe(true)
    pb.authStore.clear()
    expect(pb.authStore.isValid).toBe(false)
  })

  it('M1-02: unverified accounts cannot access protected data until verified', async () => {
    const event = await fx.event({ status: 'published' })
    const email = 'm102@test.local'
    await register(email)
    const pb = server.client()
    await pb.collection('users').authWithPassword(email, PASSWORD)

    // Protected data is hidden and protected actions are denied while unverified.
    expect((await pb.collection('events').getList()).totalItems).toBe(0)
    await expectDenied(pb.collection('events').getOne(event.id))

    // Verification email links to the frontend.
    await pb.collection('users').requestVerification(email)
    const { url, token } = await tokenFromMail(server, email, '/auth/verify-email')
    expect(url.startsWith(`${TEST_APP_URL}/auth/verify-email?token=`)).toBe(true)

    await server.client().collection('users').confirmVerification(token)
    await pb.collection('users').authRefresh()
    expect(pb.authStore.record?.verified).toBe(true)
    expect((await pb.collection('events').getOne(event.id)).id).toBe(event.id)
  })

  it('M1-04: resets the password through an emailed link', async () => {
    const email = 'm104@test.local'
    await register(email)
    await server.client().collection('users').requestPasswordReset(email)
    const { url, token } = await tokenFromMail(server, email, '/auth/reset-password')
    expect(url.startsWith(`${TEST_APP_URL}/auth/reset-password?token=`)).toBe(true)

    await server
      .client()
      .collection('users')
      .confirmPasswordReset(token, 'new-password-99', 'new-password-99')

    await expectDenied(server.client().collection('users').authWithPassword(email, PASSWORD))
    const auth = await server
      .client()
      .collection('users')
      .authWithPassword(email, 'new-password-99')
    expect(auth.record.email).toBe(email)
  })

  it('users can only read their own account; admins can read all including email', async () => {
    const a = await fx.user()
    const b = await fx.user()
    const admin = await fx.admin()

    const own = await a.pb.collection('users').getFullList()
    expect(own.map((u) => u.id)).toEqual([a.id])
    await expectDenied(a.pb.collection('users').getOne(b.id))

    const seen = await admin.pb.collection('users').getOne(b.id)
    expect(seen.email).toBe(b.email)
  })

  it('users cannot verify themselves', async () => {
    await register('selfverify@test.local')
    const pb = server.client()
    await pb.collection('users').authWithPassword('selfverify@test.local', PASSWORD)
    const id = pb.authStore.record!.id
    await pb
      .collection('users')
      .update(id, { verified: true })
      .catch((e: ClientResponseError) => e)
    const fresh = await fx.su.collection('users').getOne(id)
    expect(fresh.verified).toBe(false)
  })
})
