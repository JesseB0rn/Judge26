import { describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn<(...args: unknown[]) => Promise<unknown>>() }))
vi.mock('@/shared/api/pocketbase', () => ({
  pb: { send, filter: vi.fn<(...args: unknown[]) => unknown>() },
}))

import { generateSchedule, reportFromError } from '../api'

describe('generateSchedule', () => {
  it('sends the dry-run flag and returns a complete result', async () => {
    send.mockResolvedValue({ status: 'complete', placements: [], dry_run: true })
    await expect(generateSchedule('e1', true)).resolves.toEqual({
      status: 'complete',
      placements: [],
      dry_run: true,
    })
    expect(send).toHaveBeenCalledWith('/api/events/e1/schedule/generate', {
      method: 'POST',
      body: { dry_run: true },
    })
  })
})

describe('reportFromError', () => {
  it('returns the infeasibility report carried by a 409', () => {
    const report = {
      status: 'infeasible' as const,
      message: 'Only 2 of 3 games fit.',
      placedCount: 2,
      unplaced: [{ gameId: 'g3', reasons: ['no_compatible_table'] }],
    }
    expect(reportFromError({ status: 409, response: report })).toEqual(report)
  })

  it('returns null for other failures, so they are rethrown', () => {
    expect(reportFromError({ status: 500, response: {} })).toBeNull()
    expect(reportFromError({ status: 409 })).toBeNull()
    expect(reportFromError(new Error('network'))).toBeNull()
    expect(reportFromError(null)).toBeNull()
  })
})
