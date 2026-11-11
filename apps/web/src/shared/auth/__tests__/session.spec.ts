import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { pb } from '@/shared/api/pocketbase'
import { makeRole, makeUser } from '@/test/utils'
import { locale, setLocale } from '@/i18n'
import { useSessionStore } from '../session'

type AsyncFn = (...args: unknown[]) => Promise<unknown>

const users = {
  authWithPassword: vi.fn<AsyncFn>(),
  authRefresh: vi.fn<AsyncFn>(),
  create: vi.fn<AsyncFn>(),
  update: vi.fn<AsyncFn>(),
  requestVerification: vi.fn<AsyncFn>(),
  confirmVerification: vi.fn<AsyncFn>(),
  requestPasswordReset: vi.fn<AsyncFn>(),
  confirmPasswordReset: vi.fn<AsyncFn>(),
}
const roleAssignments = { getFullList: vi.fn<AsyncFn>() }

vi.spyOn(pb, 'collection').mockImplementation(((name: string) =>
  name === 'users' ? users : roleAssignments) as unknown as typeof pb.collection)

// authStore.isValid checks the JWT expiry, so use a structurally valid token.
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ exp: 4102444800, type: 'auth' })}.sig`

function signIn(user = makeUser()) {
  pb.authStore.save(TOKEN, user)
}

describe('session store', () => {
  beforeEach(() => {
    pb.authStore.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('M1-03: logs in, loads scoped roles and logs out', async () => {
    users.authWithPassword.mockImplementation(async () => signIn())
    roleAssignments.getFullList.mockResolvedValue([
      makeRole('judge', 'e1'),
      makeRole('event_manager', 'e2'),
    ])
    const session = useSessionStore()

    await session.login('coach@example.com', 'secret')
    expect(session.isAuthenticated).toBe(true)
    expect(session.rolesFor('e1')).toEqual(['judge'])
    expect(session.canManageEvent('e2')).toBe(true)
    expect(session.canManageEvent('e1')).toBe(false)
    expect(session.isEventStaff('e1')).toBe(true)
    expect(session.isAdmin).toBe(false)

    session.logout()
    expect(session.isAuthenticated).toBe(false)
    expect(session.roles).toEqual([])
  })

  it('admins can manage every event', async () => {
    users.authWithPassword.mockImplementation(async () => signIn())
    roleAssignments.getFullList.mockResolvedValue([makeRole('admin')])
    const session = useSessionStore()
    await session.login('a@example.com', 'secret')
    expect(session.isAdmin).toBe(true)
    expect(session.canManageEvent('any')).toBe(true)
  })

  it('does not load roles for unverified users', async () => {
    users.authWithPassword.mockImplementation(async () => signIn(makeUser({ verified: false })))
    const session = useSessionStore()
    await session.login('u@example.com', 'secret')
    expect(session.isVerified).toBe(false)
    expect(roleAssignments.getFullList).not.toHaveBeenCalled()
  })

  it('M1-01: registers, signs in and requests verification', async () => {
    users.authWithPassword.mockImplementation(async () => signIn(makeUser({ verified: false })))
    const session = useSessionStore()
    await session.register({ name: 'New', email: 'new@example.com', password: 'password1' })
    expect(users.create).toHaveBeenCalledWith({
      name: 'New',
      email: 'new@example.com',
      password: 'password1',
      passwordConfirm: 'password1',
      language: 'en',
    })
    expect(users.requestVerification).toHaveBeenCalledWith('new@example.com')
  })

  it('clears an invalid stored session on initialization', async () => {
    signIn()
    users.authRefresh.mockRejectedValue(new Error('expired'))
    const session = useSessionStore()
    await session.ensureInitialized()
    expect(session.isAuthenticated).toBe(false)
  })

  it('refreshes a stored session once', async () => {
    signIn()
    users.authRefresh.mockResolvedValue({})
    roleAssignments.getFullList.mockResolvedValue([])
    const session = useSessionStore()
    await Promise.all([session.ensureInitialized(), session.ensureInitialized()])
    expect(users.authRefresh).toHaveBeenCalledTimes(1)
  })

  it('M1-04: forwards password reset requests', async () => {
    const session = useSessionStore()
    await session.requestPasswordReset('a@example.com')
    await session.confirmPasswordReset('tok', 'new-password')
    expect(users.confirmPasswordReset).toHaveBeenCalledWith('tok', 'new-password', 'new-password')
  })

  describe('language (i18n)', () => {
    beforeEach(() => setLocale('en'))

    it('applies the language saved on the account when signing in', async () => {
      users.authWithPassword.mockImplementation(async () => signIn(makeUser({ language: 'fr' })))
      roleAssignments.getFullList.mockResolvedValue([])
      await useSessionStore().login('a@b.c', 'pw')
      expect(locale.value).toBe('fr')
      expect(users.update).not.toHaveBeenCalled()
    })

    it('saves the current language on an account without one', async () => {
      const user = makeUser()
      users.authWithPassword.mockImplementation(async () => signIn(user))
      roleAssignments.getFullList.mockResolvedValue([])
      setLocale('it')
      await useSessionStore().login('a@b.c', 'pw')
      expect(users.update).toHaveBeenCalledWith(user.id, { language: 'it' })
    })

    it('switching the language saves it on the account', async () => {
      const user = makeUser({ language: 'en' })
      signIn(user)
      const session = useSessionStore()
      await session.setLanguage('de')
      expect(locale.value).toBe('de')
      expect(users.update).toHaveBeenCalledWith(user.id, { language: 'de' })
    })
  })
})
