import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import * as api from '../api'
import { pendingDraftIds, readDraft, syncDraft, syncPendingDrafts, writeDraft } from '../drafts'
import { IDLE } from '../lib'
import { makeSheet } from './fixtures'

vi.mock('../api')
const mocked = vi.mocked(api)

const draft = (gameId: string, savedAt = 1000) => ({
  gameId,
  input: { outcome: 'completed' as const, values: { flag: true }, time_ms: 0, points: null },
  stopwatch: IDLE,
  savedAt,
  synced: false,
})

const networkError = () => new ClientResponseError({ status: 0 })
const conflict = () =>
  new ClientResponseError({
    status: 409,
    response: { message: 'This score is finalized.', data: { status: { code: 'finalized' } } },
  })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

describe('local drafts (M5-09, M5-14)', () => {
  it('a synchronized draft is marked as synced', async () => {
    writeDraft(draft('g1'))
    mocked.saveDraft.mockResolvedValue({ sheet: makeSheet(), stale: false })
    expect(pendingDraftIds()).toEqual(['g1'])
    const result = await syncDraft('g1')
    expect(result.status).toBe('synced')
    expect(mocked.saveDraft).toHaveBeenCalledWith('g1', draft('g1').input, 1000, undefined)
    expect(readDraft('g1')?.synced).toBe(true)
    expect(pendingDraftIds()).toEqual([])
  })

  it('M5-T13: while offline the draft stays on the device', async () => {
    writeDraft(draft('g1'))
    mocked.saveDraft.mockRejectedValue(networkError())
    expect((await syncDraft('g1')).status).toBe('offline')
    expect(readDraft('g1')).toMatchObject({ synced: false, input: { values: { flag: true } } })
  })

  it('M5-T14: pending drafts synchronize on reconnect', async () => {
    writeDraft(draft('g1'))
    writeDraft(draft('g2'))
    writeDraft({ ...draft('g3'), synced: true })
    mocked.saveDraft.mockResolvedValue({ sheet: makeSheet(), stale: false })
    await syncPendingDrafts()
    expect(mocked.saveDraft).toHaveBeenCalledTimes(2)
    expect(pendingDraftIds()).toEqual([])
  })

  it('M5-T15: an outdated draft is discarded when the score was finalized meanwhile', async () => {
    writeDraft(draft('g1'))
    mocked.saveDraft.mockRejectedValue(conflict())
    const result = await syncDraft('g1')
    expect(result).toEqual({ status: 'conflict', message: 'This score is finalized.' })
    expect(readDraft('g1')).toBeNull()
  })

  it('a change made during synchronization stays pending', async () => {
    writeDraft(draft('g1', 1000))
    mocked.saveDraft.mockImplementation(async () => {
      writeDraft(draft('g1', 2000))
      return { sheet: makeSheet(), stale: false }
    })
    await syncDraft('g1')
    expect(readDraft('g1')).toMatchObject({ savedAt: 2000, synced: false })
  })

  it('concurrent synchronizations of one game do not overlap', async () => {
    writeDraft(draft('g1'))
    let resolve!: () => void
    mocked.saveDraft.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = () => r({ sheet: makeSheet(), stale: false })
        }),
    )
    const first = syncDraft('g1')
    const second = syncDraft('g1')
    resolve()
    await Promise.all([first, second])
    expect(mocked.saveDraft).toHaveBeenCalledTimes(1)
  })
})
