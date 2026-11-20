import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buttonByText, click, fill, makeRound, mountView } from '@/test/utils'
import * as api from '../api'
import RoundForm from '../components/RoundForm.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const rounds = [makeRound('R1', 1), makeRound('R2', 2)]

describe('round form (M11-02)', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => document.body.replaceChildren())

  it('adds a round after the last one', async () => {
    mocked.createRound.mockResolvedValue(makeRound('R3', 3))
    const { wrapper } = await mountView(RoundForm, {
      props: { categoryId: 'cat1', rounds, cancelable: true },
    })
    await fill('[data-testid=round-form] input[pattern]', 'R3')
    await fill('[data-testid=round-form] input:not([pattern]):not([type=number])', 'Final')
    await click(buttonByText('Add round'))
    expect(mocked.createRound).toHaveBeenCalledWith(
      'cat1',
      expect.objectContaining({ key: 'R3', name: 'Final', position: 3 }),
    )
    expect(wrapper.emitted('saved')).toHaveLength(1)
    // Adding offers Cancel in a dialog, never Delete.
    expect(() => buttonByText('Cancel')).not.toThrow()
    expect(wrapper.find('[data-testid=round-delete]').exists()).toBe(false)
  })

  it('edits and deletes a round, keeping its position', async () => {
    mocked.updateRound.mockResolvedValue(rounds[1]!)
    mocked.deleteRound.mockResolvedValue(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper } = await mountView(RoundForm, {
      props: { categoryId: 'cat1', rounds, round: rounds[1], deletable: true },
    })
    const key = wrapper.get<HTMLInputElement>('input[pattern]')
    expect(key.element.value).toBe('R2')
    await click(buttonByText('Save round'))
    expect(mocked.updateRound).toHaveBeenCalledWith(
      'round-R2',
      expect.objectContaining({ key: 'R2', position: 2 }),
    )
    await click(wrapper.get('[data-testid=round-delete]').element as HTMLElement)
    expect(mocked.deleteRound).toHaveBeenCalledWith('round-R2')
    expect(wrapper.emitted('deleted')).toHaveLength(1)
  })

  it('M11-T09: without days the form says so and links to the Overview tab', async () => {
    const { wrapper } = await mountView(RoundForm, {
      props: { categoryId: 'cat1', rounds, days: [], eventId: 'event1' },
    })
    const hint = wrapper.get('[data-testid=round-no-days]')
    expect(hint.text()).toContain('no competition day yet')
    expect(hint.get('a').attributes('href')).toContain('tab=overview')
  })
})
