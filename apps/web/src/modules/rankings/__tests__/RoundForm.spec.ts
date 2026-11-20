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

  describe('start time (M11-05)', () => {
    const day = {
      id: 'sat',
      event: 'event1',
      date: '2026-06-13',
      label: 'Saturday',
      ends_at: '18:00',
      collectionId: '',
      collectionName: '',
      created: '',
      updated: '',
    }

    async function addRoundAt(time: string) {
      const created = { ...makeRound('R3', 3), id: 'new', day: 'sat' }
      mocked.createRound.mockResolvedValue(created)
      mocked.updateRound.mockResolvedValue(created)
      mocked.timeRound.mockResolvedValue({} as never)
      mocked.getScoringPhase.mockResolvedValue({
        id: 'p',
        day: 'sat',
        starts_at: '',
        updated: 'v1',
      })
      const view = await mountView(RoundForm, {
        props: { categoryId: 'cat1', rounds, days: [day], cancelable: true },
      })
      expect(view.wrapper.find('[data-testid=round-starts-at]').exists()).toBe(false)
      await fill('[data-testid=round-form] input[pattern]', 'R3')
      await fill('[data-testid=round-form] input:not([pattern]):not([type=number])', 'Final')
      await fill('[data-testid=round-form] select', 'sat')
      await fill('[data-testid=round-starts-at]', time)
      await click(buttonByText('Add round'))
      return view
    }

    it('M11-T07: a start within the day times the round', async () => {
      const { wrapper } = await addRoundAt('10:00')
      expect(mocked.createRound).toHaveBeenCalledWith(
        'cat1',
        expect.objectContaining({ key: 'R3', day: 'sat' }),
      )
      expect(mocked.timeRound).toHaveBeenCalledWith('new', '10:00', undefined)
      expect(wrapper.emitted('saved')).toHaveLength(1)
    })

    it('M11-T07: a start outside the day keeps the saved round open with the error', async () => {
      const { wrapper } = await addRoundAt('23:30')
      expect(mocked.createRound).toHaveBeenCalledTimes(1)
      expect(mocked.timeRound).not.toHaveBeenCalled()
      expect(wrapper.emitted('saved')).toBeUndefined()
      expect(wrapper.emitted('changed')![0]).toEqual([expect.objectContaining({ id: 'new' })])
      expect(wrapper.text()).toContain('The round was saved, but not its start time')
      expect(wrapper.text()).toContain('Outside the hours of this day.')
      // The form now edits the saved round: fixing the time updates, never creates again.
      await fill('[data-testid=round-starts-at]', '11:00')
      await click(buttonByText('Save round'))
      expect(mocked.createRound).toHaveBeenCalledTimes(1)
      expect(mocked.updateRound).toHaveBeenCalledWith('new', expect.anything())
      expect(mocked.timeRound).toHaveBeenCalledWith('new', '11:00', { starts_at: '' })
      expect(wrapper.emitted('saved')).toHaveLength(1)
    })

    it('editing a round shows its current start', async () => {
      mocked.getScoringPhase.mockResolvedValue({
        id: 'p',
        day: 'sat',
        starts_at: '09:30',
        updated: 'v1',
      })
      const { wrapper } = await mountView(RoundForm, {
        props: {
          categoryId: 'cat1',
          rounds,
          round: { ...rounds[0]!, day: 'sat' },
          days: [day],
        },
      })
      expect(mocked.getScoringPhase).toHaveBeenCalledWith('round-R1')
      const input = wrapper.get<HTMLInputElement>('[data-testid=round-starts-at]')
      expect(input.element.value).toBe('09:30')
    })
  })
})
