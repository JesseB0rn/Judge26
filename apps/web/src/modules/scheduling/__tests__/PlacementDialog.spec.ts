import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeGame, makeTable, mountView } from '@/test/utils'
import * as api from '../api'
import PlacementDialog from '../components/PlacementDialog.vue'

vi.mock('../api')
const mocked = vi.mocked(api)

const game = makeGame({
  id: 'g1',
  status: 'scheduled',
  table: 't1',
  starts_at: '2026-11-14 09:00:00.000Z',
  judges: [],
  updated: '2026-11-09 10:00:00.000Z',
})
const tables = [makeTable({ id: 't1', name: 'Table 1' }), makeTable({ id: 't2', name: 'Table 2' })]
const judges = [{ id: 'j1', name: 'Grace' }]

async function openDialog() {
  const { wrapper } = await mountView(PlacementDialog, {
    props: { game, tables, judges, open: false },
  })
  await wrapper.setProps({ open: true } as never)
  await flushPromises()
  return wrapper
}

const select = () => document.querySelector<HTMLSelectElement>('#placement-form select')!
const startInput = () =>
  document.querySelector<HTMLInputElement>('#placement-form input[type=datetime-local]')!

describe('PlacementDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => document.body.replaceChildren())

  it('prefills the current placement', async () => {
    await openDialog()
    expect(select().value).toBe('t1')
    expect(startInput().value).not.toBe('')
  })

  it('saves table, start, judges and lock with the loaded version', async () => {
    mocked.savePlacement.mockResolvedValue(game)
    const wrapper = await openDialog()

    select().value = 't2'
    select().dispatchEvent(new Event('change'))
    await fill('#placement-form input[type=datetime-local]', '2026-11-14T10:30')
    const boxes = document.querySelectorAll<HTMLInputElement>(
      '#placement-form input[type=checkbox]',
    )
    await click(boxes[0]!) // judge Grace
    await click(boxes[1]!) // locked
    await click(buttonByText('Save'))

    expect(mocked.savePlacement).toHaveBeenCalledWith(game, {
      table: 't2',
      starts_at: new Date('2026-11-14T10:30').toISOString(),
      judges: ['j1'],
      locked: true,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    const openEvents = wrapper.emitted('update:open') ?? []
    expect(openEvents[openEvents.length - 1]).toEqual([false])
  })

  it('asks to reload when someone else changed the game (409)', async () => {
    mocked.savePlacement.mockRejectedValue(
      new ClientResponseError({ status: 409, url: 'http://test/api', response: {} }),
    )
    const wrapper = await openDialog()
    await click(buttonByText('Save'))
    expect(document.body.textContent).toContain('changed by someone else')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('shows the server’s conflict message on the field', async () => {
    mocked.savePlacement.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        url: 'http://test/api',
        response: {
          message: 'Failed to validate the submitted data.',
          data: { table: { code: 'table_conflict', message: 'The table is already booked.' } },
        },
      }),
    )
    await openDialog()
    await click(buttonByText('Save'))
    expect(document.body.textContent).toContain('The table is already booked.')
  })
})
