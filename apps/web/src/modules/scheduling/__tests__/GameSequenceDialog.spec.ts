import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeGame, makeTable, mountView } from '@/test/utils'
import * as api from '../api'
import GameSequenceDialog from '../components/GameSequenceDialog.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const game = makeGame({
  id: 'g1',
  status: 'scheduled',
  table: 't1',
  sequence: 2,
  updated: '2026-11-09 10:00:00.000Z',
})
const tables = [makeTable({ id: 't1', name: 'Table 1' }), makeTable({ id: 't2', name: 'Table 2' })]

async function openDialog() {
  const { wrapper } = await mountView(GameSequenceDialog, {
    props: { game, tables, open: false },
  })
  await wrapper.setProps({ open: true } as never)
  await flushPromises()
  return wrapper
}

describe('GameSequenceDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => document.body.replaceChildren())

  it('prefills the current table and sequence', async () => {
    await openDialog()
    expect(document.querySelector<HTMLSelectElement>('#placement-form select')?.value).toBe('t1')
    expect(
      document.querySelector<HTMLInputElement>('#placement-form input[type=number]')?.value,
    ).toBe('2')
  })

  it('saves table and sequence with the loaded version', async () => {
    mocked.saveGameAssignment.mockResolvedValue(game)
    const wrapper = await openDialog()
    const select = document.querySelector<HTMLSelectElement>('#placement-form select')!
    select.value = 't2'
    select.dispatchEvent(new Event('change'))
    await fill('#placement-form input[type=number]', '3')
    await click(buttonByText('Save'))

    expect(mocked.saveGameAssignment).toHaveBeenCalledWith(game, { table: 't2', sequence: 3 })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    const openEvents = wrapper.emitted('update:open') ?? []
    expect(openEvents[openEvents.length - 1]).toEqual([false])
  })

  it('asks to reload when someone else changed the game (409)', async () => {
    mocked.saveGameAssignment.mockRejectedValue(
      new ClientResponseError({ status: 409, url: 'http://test/api', response: {} }),
    )
    const wrapper = await openDialog()
    await click(buttonByText('Save'))
    expect(document.body.textContent).toContain('changed by someone else')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('shows the server’s sequence error', async () => {
    mocked.saveGameAssignment.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        url: 'http://test/api',
        response: {
          message: 'Failed to validate the submitted data.',
          data: { sequence: { code: 'sequence_in_use', message: 'Sequence is already used.' } },
        },
      }),
    )
    await openDialog()
    await click(buttonByText('Save'))
    expect(document.body.textContent).toContain('Sequence is already used.')
  })
})
