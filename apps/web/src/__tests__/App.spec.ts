import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'
import { routes } from '@/router'
import { resolveAccess } from '@/router/guards'
import { useSessionStore } from '@/shared/auth/session'
import type { fetchAppInfo } from '@/modules/system/api'
import { makeRole, makeUser } from '@/test/utils'

vi.mock('@/modules/system/api', () => ({
  fetchAppInfo: vi.fn<typeof fetchAppInfo>(() =>
    Promise.resolve({ name: 'judge26', environment: 'test' }),
  ),
}))

async function mountAt(
  path: string,
  setup?: (session: ReturnType<typeof useSessionStore>) => void,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  setup?.(session)
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach((to) => resolveAccess(to, session))
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('App routing', () => {
  afterEach(() => document.body.replaceChildren())

  it('renders the public status page with backend status', async () => {
    const { wrapper } = await mountAt('/status')
    expect(wrapper.text()).toContain('World Robot Olympiad')
    expect(wrapper.find('[data-testid="backend-status"]').exists()).toBe(true)
  })

  it('renders the not-found view for unknown routes', async () => {
    const { wrapper } = await mountAt('/does/not/exist')
    expect(wrapper.text()).toContain('Page not found')
  })

  it('redirects anonymous users to the login page', async () => {
    const { router, wrapper } = await mountAt('/events')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/events')
    expect(wrapper.text()).toContain('Sign in')
  })

  it('shows the environment badge and admin navigation for admins', async () => {
    const { wrapper } = await mountAt('/', (s) => {
      s.user = makeUser({ name: 'Ada Admin' })
      s.roles = [makeRole('admin')]
    })
    const header = wrapper.find('header').text()
    expect(header).toContain('test')
    expect(header).toContain('Users')
    expect(header).toContain('Ada Admin')
    expect(wrapper.text()).toContain('Welcome, Ada Admin')
  })

  it('hides admin navigation for coaches', async () => {
    const { wrapper } = await mountAt('/', (s) => {
      s.user = makeUser()
    })
    expect(wrapper.find('header').text()).not.toContain('Users')
  })
})
