import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import * as api from '../api'
import { useLiveResource } from '../useLiveResource'
import { useLiveUpdates } from '../useLiveUpdates'

vi.mock('../api')
const mocked = vi.mocked(api)

let push: ((revision: number) => void) | undefined
const unsubscribe = vi.fn<() => Promise<void>>(async () => undefined)

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  localStorage.clear()
  push = undefined
  mocked.getRevision.mockResolvedValue(3)
  mocked.subscribeRevision.mockImplementation(async (_id, callback) => {
    push = callback
    return unsubscribe
  })
})
afterEach(() => vi.useRealTimers())

function run<T>(fn: () => T) {
  const scope = effectScope()
  const result = scope.run(fn)!
  return { result, stop: () => scope.stop() }
}

describe('useLiveUpdates', () => {
  it('M6-01: reloads when the revision changes in realtime, not for the initial revision', async () => {
    const reload = vi.fn<() => void>()
    const { result, stop } = run(() => useLiveUpdates(() => 'event1', reload))
    await flushPromises()
    expect(mocked.subscribeRevision).toHaveBeenCalledWith('event1', expect.any(Function))
    expect(result.status.value).toBe('live')
    expect(reload).not.toHaveBeenCalled()
    push!(4)
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    push!(4)
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    stop()
    await flushPromises()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('reloads when the shown data is older than the server revision', async () => {
    const reload = vi.fn<() => void>()
    const shown = ref(2)
    run(() => useLiveUpdates(() => 'event1', reload, { shownRevision: () => shown.value }))
    await flushPromises()
    // Initial poll returned 3 > 2: a change was missed between loading and subscribing.
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('falls back to polling without realtime and reports when the server is unreachable', async () => {
    mocked.subscribeRevision.mockRejectedValue(new Error('no EventSource'))
    const reload = vi.fn<() => void>()
    const { result } = run(() => useLiveUpdates(() => 'event1', reload, { pollMs: 1000 }))
    await flushPromises()
    expect(result.status.value).toBe('polling')
    mocked.getRevision.mockResolvedValue(7)
    await vi.advanceTimersByTimeAsync(1000)
    expect(reload).toHaveBeenCalledTimes(1)
    mocked.getRevision.mockRejectedValue(new ClientResponseError({ status: 0 }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(result.status.value).toBe('offline')
    mocked.getRevision.mockResolvedValue(7)
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(result.status.value).toBe('polling')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never runs reloads concurrently; a change during a reload causes one more reload', async () => {
    let finish: () => void = () => undefined
    const reload = vi.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    run(() => useLiveUpdates(() => 'event1', reload))
    await flushPromises()
    push!(4)
    push!(5)
    push!(6)
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(2)
    finish()
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('resubscribes when the event changes', async () => {
    const id = ref('event1')
    run(() => useLiveUpdates(() => id.value, vi.fn<() => void>()))
    await flushPromises()
    id.value = 'event2'
    await nextTick()
    await flushPromises()
    expect(unsubscribe).toHaveBeenCalled()
    expect(mocked.subscribeRevision).toHaveBeenLastCalledWith('event2', expect.any(Function))
  })
})

describe('useLiveResource', () => {
  it('M6-T09: keeps the last data when a reload fails and restores it from the device cache', async () => {
    const fetcher = vi.fn<() => Promise<{ revision: number; value: string }>>().mockResolvedValue({
      revision: 1,
      value: 'a',
    })
    const first = useLiveResource(() => 'k', fetcher)
    await first.load()
    expect(first.data.value).toEqual({ revision: 1, value: 'a' })
    expect(first.stale.value).toBe(false)

    fetcher.mockRejectedValue(new ClientResponseError({ status: 0 }))
    await first.load()
    expect(first.data.value).toEqual({ revision: 1, value: 'a' })
    expect(first.stale.value).toBe(true)

    // A new page load without a connection shows the cached data.
    const second = useLiveResource(() => 'k', fetcher)
    await second.load()
    expect(second.data.value).toEqual({ revision: 1, value: 'a' })
    expect(second.stale.value).toBe(true)
  })

  it('applies only the newest response', async () => {
    const resolvers: ((v: string) => void)[] = []
    const fetcher = vi.fn<() => Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    )
    const res = useLiveResource(() => 'order', fetcher)
    const a = res.load()
    const b = res.load()
    resolvers[1]!('new')
    resolvers[0]!('old')
    await Promise.all([a, b])
    expect(res.data.value).toBe('new')
  })

  it('M6-T04: removes data that is no longer public', async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockResolvedValue('published')
    const res = useLiveResource(() => 'gone', fetcher)
    await res.load()
    fetcher.mockRejectedValue(new ClientResponseError({ status: 404 }))
    await res.load()
    expect(res.data.value).toBeUndefined()
    expect(localStorage.getItem('judge26.live.gone')).toBeNull()
  })
})
