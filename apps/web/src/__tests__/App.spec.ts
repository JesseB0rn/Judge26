import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'
import { systemRoutes } from '@/modules/system/routes'
import type { fetchAppInfo } from '@/modules/system/api'

vi.mock('@/modules/system/api', () => ({
  fetchAppInfo: vi.fn<typeof fetchAppInfo>(() =>
    Promise.resolve({ name: 'judge26', environment: 'test' }),
  ),
}))

async function mountAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: systemRoutes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('App routing', () => {
  it('renders the home view with backend status', async () => {
    const wrapper = await mountAt('/')
    expect(wrapper.text()).toContain('World Robot Olympiad')
    expect(wrapper.find('[data-testid="backend-status"]').exists()).toBe(true)
  })

  it('renders the not-found view for unknown routes', async () => {
    const wrapper = await mountAt('/does/not/exist')
    expect(wrapper.text()).toContain('Page not found')
  })

  it('shows the environment badge outside production', async () => {
    const wrapper = await mountAt('/')
    expect(wrapper.find('header').text()).toContain('test')
  })
})
