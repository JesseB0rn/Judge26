import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { pb } from '@/shared/api/pocketbase'
import { makeRole, makeUser, mountView } from '@/test/utils'
import AppShell from '@/shared/components/AppShell.vue'
import { useSessionStore } from '../session'
import { isViewAsHotkey, storedViewAs, type ViewSession } from '../viewAs'

type AsyncFn = (...args: unknown[]) => Promise<unknown>

const users = { authRefresh: vi.fn<AsyncFn>(), update: vi.fn<AsyncFn>() }
const roleAssignments = { getFullList: vi.fn<AsyncFn>() }

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const token = (sub: string) =>
  `${b64({ alg: 'HS256' })}.${b64({ id: sub, exp: 4102444800, type: 'auth' })}.sig`

const SESSION: ViewSession = {
  id: 's1',
  role: 'judge',
  event: { id: 'e1', name: 'Swiss Final' },
  persona: null,
  read_only: false,
  admin: { id: 'admin1', name: 'Ada', email: 'ada@example.com' },
  expires_at: '2026-11-12 16:00:00.000Z',
}
const admin = makeUser({ id: 'admin1', name: 'Ada' })
const standIn = makeUser({ id: 'stand1', name: 'Ada (preview)' })

describe('admin view as (M8-C)', () => {
  let send: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    pb.authStore.clear()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.spyOn(pb, 'collection').mockImplementation(((name: string) =>
      name === 'users' ? users : roleAssignments) as unknown as typeof pb.collection)
    send = vi.spyOn(pb, 'send').mockImplementation((async (path: string) => {
      if (path === '/api/view-as/end') return undefined
      if (path === '/api/view-as')
        return { token: token('stand1'), record: standIn, session: SESSION }
      throw new Error(`unexpected ${path}`)
    }) as never)
    setActivePinia(createPinia())
  })
  // Unmount shells, or their hotkey listeners would act on later tests.
  const mounted: { unmount(): void }[] = []
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    document.body.replaceChildren()
  })

  it('M8-13/M8-15: switches to the stand-in token and back to the admin', async () => {
    pb.authStore.save(token('admin1'), admin)
    roleAssignments.getFullList.mockResolvedValueOnce([makeRole('judge', 'e1')])
    const session = useSessionStore()
    session.roles = [makeRole('admin')]
    expect(session.canViewAs).toBe(true)

    await session.startViewAs({ event: 'e1', role: 'judge' })
    expect(send).toHaveBeenCalledWith('/api/view-as', {
      method: 'POST',
      body: { event: 'e1', role: 'judge' },
    })
    expect(pb.authStore.record?.id).toBe('stand1')
    expect(session.viewAs?.role).toBe('judge')
    expect(session.isAdmin).toBe(false)
    expect(session.canViewAs).toBe(false)
    expect(session.rolesFor('e1')).toEqual(['judge'])
    expect(storedViewAs()?.admin.record?.id).toBe('admin1')

    users.authRefresh.mockResolvedValueOnce({})
    roleAssignments.getFullList.mockResolvedValueOnce([makeRole('admin')])
    await session.stopViewAs()
    expect(send).toHaveBeenCalledWith('/api/view-as/end', { method: 'POST' })
    expect(pb.authStore.record?.id).toBe('admin1')
    expect(session.viewAs).toBeNull()
    expect(session.isAdmin).toBe(true)
    expect(storedViewAs()).toBeNull()
  })

  it('does not refresh the switched token or save the language on page load', async () => {
    pb.authStore.save(token('admin1'), admin)
    roleAssignments.getFullList.mockResolvedValue([makeRole('judge', 'e1')])
    await useSessionStore().startViewAs({ event: 'e1', role: 'judge' })

    setActivePinia(createPinia())
    send.mockImplementation((async () => ({ session: SESSION })) as never)
    const session = useSessionStore()
    await session.ensureInitialized()
    expect(users.authRefresh).not.toHaveBeenCalled()
    expect(users.update).not.toHaveBeenCalled()
    expect(session.viewAs?.id).toBe('s1')
  })

  it('returns to the admin when the session ended while away', async () => {
    pb.authStore.save(token('admin1'), admin)
    roleAssignments.getFullList.mockResolvedValue([makeRole('judge', 'e1')])
    await useSessionStore().startViewAs({ event: 'e1', role: 'judge' })

    setActivePinia(createPinia())
    send.mockImplementation((async () => {
      throw new Error('ended')
    }) as never)
    users.authRefresh.mockResolvedValue({})
    roleAssignments.getFullList.mockResolvedValue([makeRole('admin')])
    const session = useSessionStore()
    await session.ensureInitialized()
    expect(pb.authStore.record?.id).toBe('admin1')
    expect(session.viewAs).toBeNull()
  })

  it('M8-15: shows the banner while switched and exits with the hotkey', async () => {
    pb.authStore.save(token('stand1'), standIn)
    const { wrapper, session } = await mountView(AppShell, {
      session: { user: standIn, roles: [makeRole('judge', 'e1')] },
      setup: (s) => (s.viewAs = { ...SESSION, persona: { id: 'j1', name: 'Jane', email: 'j@x' } }),
    })
    mounted.push(wrapper)
    const banner = wrapper.get('[data-testid=view-as-banner]')
    expect(banner.text()).toContain('Jane')
    expect(banner.text()).toContain('Swiss Final')
    expect(wrapper.find('[data-testid=view-as-open]').exists()).toBe(false)

    const stop = vi.spyOn(session, 'stopViewAs').mockResolvedValue()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyV', altKey: true, shiftKey: true }),
    )
    expect(stop).toHaveBeenCalled()
  })

  it('M8-13: admins get the switch button and the hotkey opens the dialog; others do not', async () => {
    send.mockImplementation((async () => []) as never)
    vi.spyOn(pb, 'collection').mockImplementation((() => ({
      getFullList: vi.fn<() => Promise<unknown[]>>(async () => []),
    })) as unknown as typeof pb.collection)
    const { wrapper } = await mountView(AppShell, { session: { roles: [makeRole('admin')] } })
    mounted.push(wrapper)
    expect(wrapper.find('[data-testid=view-as-banner]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=view-as-open]').exists()).toBe(true)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyV', altKey: true, shiftKey: true }),
    )
    await vi.waitFor(() =>
      expect(document.querySelector('[role=dialog]')?.textContent).toContain('View the app as'),
    )

    const other = await mountView(AppShell, {
      session: { roles: [makeRole('event_manager', 'e1')] },
    })
    mounted.push(other.wrapper)
    expect(other.wrapper.find('[data-testid=view-as-open]').exists()).toBe(false)
  })

  it('recognizes only Alt+Shift+V', () => {
    const key = (init: KeyboardEventInit) => isViewAsHotkey(new KeyboardEvent('keydown', init))
    expect(key({ code: 'KeyV', altKey: true, shiftKey: true })).toBe(true)
    expect(key({ code: 'KeyV', altKey: true })).toBe(false)
    expect(key({ code: 'KeyV', altKey: true, shiftKey: true, metaKey: true })).toBe(false)
  })
})
