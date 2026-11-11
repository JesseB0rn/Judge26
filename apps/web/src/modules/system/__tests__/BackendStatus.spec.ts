import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import BackendStatus from '../components/BackendStatus.vue'
import { fetchAppInfo, fetchHealth } from '../api'

vi.mock('../api', () => ({
  fetchAppInfo: vi.fn<typeof fetchAppInfo>(),
  fetchHealth: vi.fn<typeof fetchHealth>(),
}))
const fetchAppInfoMock = vi.mocked(fetchAppInfo)
const fetchHealthMock = vi.mocked(fetchHealth)

describe('BackendStatus', () => {
  beforeEach(() => {
    fetchAppInfoMock.mockReset()
    fetchHealthMock.mockReset().mockResolvedValue('ok')
  })

  it('shows online status and environment when the backend responds', async () => {
    fetchAppInfoMock.mockResolvedValue({
      name: 'judge26',
      environment: 'test',
      version: '1.2.0',
      commit: '0123456789abcdef',
    })
    const wrapper = mount(BackendStatus)
    await flushPromises()

    expect(wrapper.get('[data-testid="backend-status-badge"]').text()).toBe('online')
    expect(wrapper.text()).toContain('test')
    expect(wrapper.get('[data-testid="backend-version"]').text()).toBe('1.2.0 (0123456)')
    expect(wrapper.get('[data-testid="backend-health"]').text()).toBe('all checks OK')
  })

  it('M7-13: shows a degraded health status, and stays online without one', async () => {
    fetchAppInfoMock.mockResolvedValue({ name: 'judge26', environment: 'production' })
    fetchHealthMock.mockResolvedValueOnce('degraded')
    const wrapper = mount(BackendStatus)
    await flushPromises()
    expect(wrapper.get('[data-testid="backend-health"]').text()).toBe('needs attention')

    fetchHealthMock.mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="backend-status-badge"]').text()).toBe('online')
    expect(wrapper.find('[data-testid="backend-health"]').exists()).toBe(false)
  })

  it('shows offline status and a normalized message when the backend is unreachable', async () => {
    fetchAppInfoMock.mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
    const wrapper = mount(BackendStatus)
    await flushPromises()

    expect(wrapper.get('[data-testid="backend-status-badge"]').text()).toBe('offline')
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be reached')
  })

  it('retries on demand', async () => {
    fetchAppInfoMock.mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
    fetchAppInfoMock.mockResolvedValueOnce({ name: 'judge26', environment: 'test' })
    const wrapper = mount(BackendStatus)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(fetchAppInfoMock).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="backend-status-badge"]').text()).toBe('online')
  })
})
