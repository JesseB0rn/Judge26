import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '../api'
import RoundFilePanel from '../components/RoundFilePanel.vue'
import type { RoundFile } from '../types'

vi.mock('../api')

const file: RoundFile = { name: 'random.png', kind: 'image', updated: '2026-11-16 10:00:00.000Z' }

async function mountPanel(f: RoundFile = file) {
  const wrapper = mount(RoundFilePanel, { props: { roundId: 'r1', file: f } })
  await flushPromises()
  return wrapper
}

describe('RoundFilePanel', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(api.roundFileUrl).mockResolvedValue('blob:x')
  })
  afterEach(() => vi.clearAllMocks())

  it('hides the preview and remembers it for the round', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.find('[data-testid="round-file-image"]').exists()).toBe(true)

    await wrapper.find('[data-testid="round-file-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="round-file-image"]').exists()).toBe(false)

    const again = await mountPanel()
    expect(again.find('[data-testid="round-file-image"]').exists()).toBe(false)

    await again.find('[data-testid="round-file-toggle"]').trigger('click')
    expect(again.find('[data-testid="round-file-image"]').exists()).toBe(true)
    expect((await mountPanel()).find('[data-testid="round-file-image"]').exists()).toBe(true)
  })

  it('shows a replaced file again', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('[data-testid="round-file-toggle"]').trigger('click')

    const replaced = await mountPanel({ ...file, updated: '2026-11-16 11:00:00.000Z' })
    expect(replaced.find('[data-testid="round-file-image"]').exists()).toBe(true)
  })
})
