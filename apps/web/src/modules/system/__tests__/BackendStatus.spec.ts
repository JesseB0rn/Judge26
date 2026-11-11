import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import BackendStatus from '../components/BackendStatus.vue'
import { fetchAppInfo } from '../api'

vi.mock('../api', () => ({ fetchAppInfo: vi.fn<typeof fetchAppInfo>() }))
const fetchAppInfoMock = vi.mocked(fetchAppInfo)

describe('BackendStatus', () => {
  beforeEach(() => fetchAppInfoMock.mockReset())

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
