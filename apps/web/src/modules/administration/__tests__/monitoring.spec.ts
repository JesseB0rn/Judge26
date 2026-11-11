import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { mountView } from '@/test/utils'
import * as api from '../api'
import MonitoringView from '../views/MonitoringView.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const monitoring = (overrides: Partial<api.Monitoring> = {}): api.Monitoring => ({
  status: 'degraded',
  checked_at: '2026-11-11T12:00:00.000Z',
  started_at: '2026-11-11T09:30:00.000Z',
  version: '1.2.0',
  commit: '0123456789abcdef',
  alerts: false,
  checks: [
    { id: 'database', label: 'Database', status: 'ok', detail: 'Reachable' },
    {
      id: 'errors',
      label: 'Errors',
      status: 'warn',
      detail: '1 server error in the last 60 minutes',
    },
    { id: 'mail', label: 'Email delivery', status: 'ok', detail: 'Delivering' },
    { id: 'backups', label: 'Backups', status: 'ok', detail: 'Latest backup 3 hours ago' },
  ],
  recent_errors: [
    {
      id: 'log1',
      created: '2026-11-11 11:58:00.000Z',
      source: 'server',
      message: 'GET /api/events/e1/judging',
      detail: 'TypeError: cannot read property',
      url: '/api/events/e1/judging',
      status: 0,
    },
  ],
  ...overrides,
})

describe('system health (M7-13)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows the overall status, each check and the recent errors', async () => {
    mocked.fetchMonitoring.mockResolvedValue(monitoring())
    const { wrapper } = await mountView(MonitoringView)
    expect(wrapper.get('[data-testid=health-status]').text()).toBe('Needs attention')
    expect(wrapper.get('[data-testid=health-summary]').text()).toContain('1.2.0 (0123456)')
    expect(wrapper.get('[data-testid=health-summary]').text()).toContain('up 2 h 30 min')
    expect(wrapper.find('[data-testid=alerts-off]').exists()).toBe(true)
    expect(wrapper.get('[data-testid=check-errors]').text()).toContain('Warning')
    expect(wrapper.get('[data-testid=check-errors]').text()).toContain('1 server error')
    expect(wrapper.get('[data-testid=check-database]').text()).toContain('OK')

    const table = wrapper.get('[data-testid=recent-errors]')
    expect(table.text()).toContain('GET /api/events/e1/judging')
    expect(table.text()).not.toContain('cannot read property')
    await table.get('tbody tr').trigger('click')
    expect(wrapper.get('[data-testid=recent-errors]').text()).toContain('cannot read property')
  })

  it('shows an empty error list and a healthy status', async () => {
    mocked.fetchMonitoring.mockResolvedValue(
      monitoring({
        status: 'ok',
        alerts: true,
        recent_errors: [],
        checks: monitoring().checks.map((c) => ({ ...c, status: 'ok' as const })),
      }),
    )
    const { wrapper } = await mountView(MonitoringView)
    expect(wrapper.get('[data-testid=health-status]').text()).toBe('All systems normal')
    expect(wrapper.find('[data-testid=alerts-off]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No errors in the last 24 hours.')
  })

  it('keeps the last result and shows an error when a refresh fails', async () => {
    mocked.fetchMonitoring.mockResolvedValueOnce(monitoring())
    mocked.fetchMonitoring.mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
    const { wrapper } = await mountView(MonitoringView)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('could not be reached')
    expect(wrapper.get('[data-testid=health-status]').text()).toBe('Needs attention')
  })
})
