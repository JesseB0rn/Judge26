import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ClientResponseError } from 'pocketbase'
import { buttonByText, click, fill, makeRole, mountView } from '@/test/utils'
import * as api from '../api'
import { cachePage, readDraft, writeDraft } from '../drafts'
import { IDLE } from '../lib'
import ScoreGameView from '../views/ScoreGameView.vue'
import { makePayload, makeSheet } from './fixtures'

vi.mock('../api')
const mocked = vi.mocked(api)

const judge = { roles: [makeRole('judge', 'event1')] }
const headJudge = { roles: [makeRole('head_judge', 'event1')] }
const COMPLETE = { flag: true, blocks: 3, full: true }

const mountGame = async (session = judge, path?: string) => {
  const view = await mountView(ScoreGameView, { props: { id: 'game1' }, session, path })
  await flushPromises()
  return view
}
type Wrapper = Awaited<ReturnType<typeof mountGame>>['wrapper']

const total = (w: Wrapper) => w.get('[data-testid=live-total]').text()
const node = (w: Wrapper, id: string) => w.get(`[data-node="${id}"]`)
const choice = (w: Wrapper, id: string, text: string) =>
  node(w, id)
    .findAll('button')
    .find((b) => b.text().startsWith(text))!
const pressed = (w: Wrapper, id: string, text: string) =>
  choice(w, id, text).attributes('aria-pressed') === 'true'

async function score(w: Wrapper, values = COMPLETE) {
  if (values.flag) await choice(w, 'flag', 'Yes').trigger('click')
  await fill('#criterion-blocks', String(values.blocks))
  if (values.full) await choice(w, 'full', 'Yes').trigger('click')
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(new Date('2026-06-13T10:00:00Z'))
  vi.resetAllMocks()
  localStorage.clear()
  mocked.getSheet.mockResolvedValue(makePayload())
  mocked.saveDraft.mockImplementation(async (_id, input, savedAt) => ({
    sheet: makeSheet({ ...input, points: 0, client_saved_at: savedAt }),
    stale: false,
  }))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('ScoreGameView', () => {
  it('M5-T02 / M5-03: shows the team, category, round, table, sequence and day', async () => {
    const { wrapper } = await mountGame()
    expect(wrapper.get('[data-testid=team-name]').text()).toBe('Robo Rangers')
    expect(wrapper.get('[data-testid=game-context]').text()).toBe(
      'RM-J · Round 1 · Table A · #3 · Saturday',
    )
    expect(wrapper.get('[data-testid=score-state]').text()).toBe('Not scored')
  })

  it('M5-T03: an unassigned game shows the access error', async () => {
    mocked.getSheet.mockRejectedValue(
      new ClientResponseError({
        status: 403,
        response: { message: 'This game is not assigned to you.' },
      }),
    )
    const { wrapper } = await mountGame()
    expect(wrapper.text()).toContain('This game is not assigned to you.')
    expect(wrapper.find('[data-testid=team-name]').exists()).toBe(false)
  })

  it('M5-04 / M5-05 / M5-T04 / M5-06: the total updates immediately with every entry', async () => {
    const { wrapper } = await mountGame()
    expect(total(wrapper)).toBe('0')
    await choice(wrapper, 'flag', 'Yes').trigger('click')
    expect(total(wrapper)).toBe('10')
    await fill('#criterion-blocks', '3')
    expect(total(wrapper)).toBe('25')
    await node(wrapper, 'blocks').get('button[aria-label=Increase]').trigger('click')
    expect(total(wrapper)).toBe('30')
    await choice(wrapper, 'full', 'Yes').trigger('click')
    expect(total(wrapper)).toBe('45')
  })

  it('M5-T05: choosing an exclusive option deselects the previous one', async () => {
    const { wrapper } = await mountGame()
    await choice(wrapper, 'full', 'Yes').trigger('click')
    expect(pressed(wrapper, 'full', 'Yes')).toBe(true)
    await choice(wrapper, 'partial', 'Yes').trigger('click')
    expect(pressed(wrapper, 'partial', 'Yes')).toBe(true)
    expect(pressed(wrapper, 'full', 'Yes')).toBe(false)
    expect(total(wrapper)).toBe('5')
  })

  it('M5-07 / M5-T06: the stopwatch records the measured duration', async () => {
    const { wrapper } = await mountGame()
    await click(buttonByText('Start'))
    vi.advanceTimersByTime(30_000)
    await click(buttonByText('Pause'))
    vi.advanceTimersByTime(10_000)
    await click(buttonByText('Resume'))
    vi.advanceTimersByTime(5_370)
    await click(buttonByText('Stop'))
    expect(wrapper.get('[data-testid=stopwatch-display]').text()).toBe('0:35.37')
    expect(readDraft('game1')?.input.time_ms).toBe(35_370)
  })

  it('M5-08: the recorded time can be corrected manually', async () => {
    const { wrapper } = await mountGame()
    await click(buttonByText('Edit time'))
    await fill('#manual-time', 'abc')
    await click(buttonByText('Set time'))
    expect(wrapper.text()).toContain('Use minutes:seconds')
    await fill('#manual-time', '1:35.37')
    await click(buttonByText('Set time'))
    expect(wrapper.get('[data-testid=stopwatch-display]').text()).toBe('1:35.37')
    expect(readDraft('game1')?.input.time_ms).toBe(95_370)
  })

  it('M5-09: changes are autosaved to the device at once and to the server shortly after', async () => {
    const { wrapper } = await mountGame()
    await choice(wrapper, 'flag', 'Yes').trigger('click')
    expect(readDraft('game1')).toMatchObject({ synced: false, input: { values: { flag: true } } })
    expect(wrapper.get('[data-testid=save-state]').text()).toContain('Saving')
    expect(mocked.saveDraft).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocked.saveDraft).toHaveBeenCalledWith(
      'game1',
      expect.objectContaining({ values: { flag: true } }),
      expect.any(Number),
      0,
    )
    expect(readDraft('game1')?.synced).toBe(true)
    expect(wrapper.get('[data-testid=save-state]').text()).toContain('Saved')
  })

  it('M5-T07: an unsaved draft is restored after a reload', async () => {
    const first = await mountGame()
    await choice(first.wrapper, 'flag', 'Yes').trigger('click')
    await fill('#criterion-blocks', '2')
    first.wrapper.unmount() // reload before the autosave reached the server
    mocked.saveDraft.mockRejectedValue(new ClientResponseError({ status: 0 }))

    const { wrapper } = await mountGame()
    expect(total(wrapper)).toBe('20')
    expect(pressed(wrapper, 'flag', 'Yes')).toBe(true)
  })

  it('a running stopwatch keeps running across a reload', async () => {
    const first = await mountGame()
    await click(buttonByText('Start'))
    first.wrapper.unmount()
    vi.advanceTimersByTime(12_000)
    const { wrapper } = await mountGame()
    expect(wrapper.get('[data-testid=stopwatch-display]').text()).toBe('0:12.00')
    expect(buttonByText('Pause')).toBeTruthy()
  })

  it('M5-T13: without a connection the cached page and the local draft stay available', async () => {
    cachePage(makePayload())
    writeDraft({
      gameId: 'game1',
      input: { outcome: 'completed', values: { flag: true }, time_ms: 0, points: null },
      stopwatch: IDLE,
      savedAt: Date.now(),
      synced: false,
    })
    mocked.getSheet.mockRejectedValue(new ClientResponseError({ status: 0 }))
    mocked.saveDraft.mockRejectedValue(new ClientResponseError({ status: 0 }))
    const { wrapper } = await mountGame()
    expect(wrapper.text()).toContain('No connection')
    expect(total(wrapper)).toBe('10')
    await fill('#criterion-blocks', '1')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[data-testid=save-state]').text()).toContain('Offline')
    expect(readDraft('game1')).toMatchObject({ synced: false, input: { values: { blocks: 1 } } })
  })

  it('M5-T14: the draft synchronizes when the connection is back', async () => {
    mocked.saveDraft.mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
    const { wrapper } = await mountGame()
    await choice(wrapper, 'flag', 'Yes').trigger('click')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[data-testid=save-state]').text()).toContain('Offline')
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(mocked.saveDraft).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid=save-state]').text()).toContain('Saved')
    expect(readDraft('game1')?.synced).toBe(true)
  })

  it('M5-T15: an outdated local draft does not replace a finalized score', async () => {
    writeDraft({
      gameId: 'game1',
      input: { outcome: 'completed', values: { flag: false }, time_ms: 0, points: null },
      stopwatch: IDLE,
      savedAt: 1,
      synced: false,
    })
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({ status: 'finalized', values: COMPLETE, points: 40 }),
        permissions: { canEdit: false, canReview: false, canCorrect: false },
      }),
    )
    const { wrapper } = await mountGame()
    expect(wrapper.get('[data-testid=sync-notice]').text()).toContain('finalized')
    expect(total(wrapper)).toBe('40')
    expect(readDraft('game1')).toBeNull()
    expect(mocked.saveDraft).not.toHaveBeenCalled()
  })

  it('M5-T09: an incomplete sheet cannot be submitted; the missing criteria are highlighted', async () => {
    const { wrapper } = await mountGame()
    await choice(wrapper, 'flag', 'Yes').trigger('click')
    expect(wrapper.get('[data-testid=missing]').text()).toContain('2 missing: Blocks, Parking')
    await click(buttonByText('Submit score'))
    expect(mocked.submitSheet).not.toHaveBeenCalled()
    expect(node(wrapper, 'blocks').attributes('data-missing')).toBe('true')
    expect(node(wrapper, 'parking').attributes('data-missing')).toBe('true')
    expect(document.querySelector('[data-testid=submit-summary]')).toBeNull()
  })

  it('M5-10 / M5-T08: a complete sheet is confirmed and submitted', async () => {
    const { wrapper } = await mountGame()
    await score(wrapper)
    expect(wrapper.text()).toContain('Ready to submit')
    await click(buttonByText('Submit score'))
    const summary = document.querySelector('[data-testid=submit-summary]')!
    expect(summary.textContent).toContain('40')
    mocked.submitSheet.mockResolvedValue({ sheet: makeSheet({ status: 'submitted' }) })
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({ status: 'submitted', values: COMPLETE, points: 40 }),
        permissions: { canEdit: false, canReview: false, canCorrect: false },
      }),
    )
    const dialog = document.querySelector('[role=dialog]') as HTMLElement
    await click(buttonByText('Submit score', dialog))
    expect(mocked.submitSheet).toHaveBeenCalledWith('game1', {
      outcome: 'completed',
      values: COMPLETE,
      time_ms: 0,
      points: null,
    })
    expect(wrapper.get('[data-testid=score-state]').text()).toBe('Submitted')
    expect(wrapper.text()).toContain('waiting for the head judge')
    expect(readDraft('game1')).toBeNull()
    expect((choice(wrapper, 'flag', 'Yes').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('absent and disqualified games need no score sheet', async () => {
    const { wrapper } = await mountGame()
    await click(buttonByText('Absent'))
    expect(wrapper.find('[data-node=flag]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ready to submit')
    expect(total(wrapper)).toBe('–')
  })

  it('M5-11 / M5-T10: a head judge approves or returns a submitted sheet', async () => {
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({ status: 'submitted', values: COMPLETE, points: 40 }),
        permissions: { canEdit: false, canReview: true, canCorrect: false },
      }),
    )
    mocked.approveSheet.mockResolvedValue({ sheet: makeSheet({ status: 'finalized' }) })
    const from = '/review?event=event1&table=tA'
    const { wrapper, router } = await mountGame(headJudge, `/?from=${encodeURIComponent(from)}`)
    expect(total(wrapper)).toBe('40')
    expect(wrapper.get('[data-testid=back-link]').text()).toBe('Review queue')
    await click(buttonByText('Approve'))
    expect(mocked.approveSheet).toHaveBeenCalledWith('game1')
    // The decision closes the sheet: back to the same queue, filters included.
    expect(router.currentRoute.value.fullPath).toBe(from)

    await click(buttonByText('Return'))
    await fill('#reason', 'Recount the blocks')
    mocked.rejectSheet.mockResolvedValue({ sheet: makeSheet({ status: 'rejected' }) })
    await click(
      buttonByText('Return sheet', document.querySelector('[role=dialog]') as HTMLElement),
    )
    expect(mocked.rejectSheet).toHaveBeenCalledWith('game1', 'Recount the blocks')
  })

  it('links back to the list the sheet was opened from, never to another site', async () => {
    mocked.getSheet.mockResolvedValue(makePayload())
    const mine = await mountGame(judge, `/?from=${encodeURIComponent('/judging?day=sat')}`)
    const link = mine.wrapper.get('[data-testid=back-link]')
    expect(link.text()).toBe('My games')
    expect(link.attributes('href')).toBe('/judging?day=sat')
    mine.wrapper.unmount()

    const evil = await mountGame(judge, `/?from=${encodeURIComponent('//evil.example')}`)
    expect(evil.wrapper.get('[data-testid=back-link]').attributes('href')).toBe('/judging')
  })

  it('a returned sheet shows the reason to the judge', async () => {
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({
          status: 'rejected',
          review_note: 'Recount the blocks',
          reviewed_by: { id: 'hj', name: 'Grace' },
        }),
      }),
    )
    const { wrapper } = await mountGame()
    expect(wrapper.get('[data-testid=review-note]').text()).toContain('Recount the blocks')
    expect(wrapper.get('[data-testid=score-state]').text()).toBe('Returned')
  })

  it('M5-T11: a judge sees a finalized score read-only, without a correction action', async () => {
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({ status: 'finalized', values: COMPLETE, points: 40 }),
        permissions: { canEdit: false, canReview: false, canCorrect: false },
      }),
    )
    const { wrapper } = await mountGame()
    expect(wrapper.text()).toContain('Final score')
    expect(wrapper.text()).not.toContain('Correct score')
    expect(wrapper.text()).not.toContain('Submit score')
    expect((choice(wrapper, 'flag', 'Yes').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('M5-12 / M5-T12: a correction requires a reason and is sent with the new values', async () => {
    mocked.getSheet.mockResolvedValue(
      makePayload({
        sheet: makeSheet({ status: 'finalized', values: COMPLETE, points: 40 }),
        permissions: { canEdit: false, canReview: false, canCorrect: true },
        history: [
          {
            id: 'a1',
            action: 'corrected',
            actor: { id: 'hj', name: 'Grace' },
            reason: 'Video review',
            before: {
              outcome: 'completed',
              values: { blocks: 2 },
              time_ms: 0,
              points: 35,
              ruleset: '',
            },
            after: {
              outcome: 'completed',
              values: { blocks: 3 },
              time_ms: 0,
              points: 40,
              ruleset: '',
            },
            created: '2026-06-13 10:00:00.000Z',
          },
        ],
      }),
    )
    const { wrapper } = await mountGame(headJudge)
    expect(wrapper.get('[data-testid=score-history]').text()).toContain('Points 35 → 40')
    expect(wrapper.get('[data-testid=score-history]').text()).toContain('Blocks: 2 → 3')

    await click(buttonByText('Correct score'))
    expect(wrapper.text()).toContain('Correcting')
    await fill('#criterion-blocks', '5')
    expect(total(wrapper)).toBe('50')
    // Corrections are never autosaved as drafts.
    expect(readDraft('game1')).toBeNull()

    await click(buttonByText('Save correction'))
    const dialog = document.querySelector('[role=dialog]') as HTMLElement
    const confirm = buttonByText('Save correction', dialog)
    expect(confirm.disabled).toBe(true)
    await fill('#reason', 'Video review: five blocks')
    mocked.correctSheet.mockResolvedValue({ sheet: makeSheet({ status: 'finalized' }) })
    await click(buttonByText('Save correction', dialog))
    expect(mocked.correctSheet).toHaveBeenCalledWith(
      'game1',
      expect.objectContaining({ values: { ...COMPLETE, blocks: 5 } }),
      'Video review: five blocks',
      expect.any(Number),
    )
  })

  it('shows the server reason when a submission is rejected', async () => {
    const { wrapper } = await mountGame()
    await score(wrapper)
    mocked.submitSheet.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: {
          message: 'Failed to validate the submitted data.',
          data: { values: { code: 'invalid_score_sheet', message: 'Flag raised is required.' } },
        },
      }),
    )
    await click(buttonByText('Submit score'))
    await click(
      buttonByText('Submit score', document.querySelector('[role=dialog]') as HTMLElement),
    )
    expect(wrapper.get('[data-testid=action-bar]').text()).toContain('Flag raised is required.')
  })

  describe('M9-A mulligan', () => {
    it('M9-01: a head judge grants a re-run with a reason; the sheet stays open', async () => {
      mocked.getSheet.mockResolvedValue(
        makePayload({
          sheet: makeSheet({ status: 'finalized', values: COMPLETE, points: 40 }),
          permissions: { canEdit: false, canReview: false, canCorrect: true, canMulligan: true },
        }),
      )
      const { wrapper } = await mountGame(headJudge)
      await click(buttonByText('Grant re-run'))
      const dialog = document.querySelector('[role=dialog]') as HTMLElement
      expect(buttonByText('Discard run and allow re-run', dialog).disabled).toBe(true)
      await fill('#reason', 'Field power cut')

      mocked.mulliganSheet.mockResolvedValue({ sheet: makeSheet() })
      const rerun = makeSheet({
        mulligans: 1,
        mulligan_reason: 'Field power cut',
        mulligan_by: { id: 'hj', name: 'Grace' },
      })
      mocked.getSheet.mockResolvedValue(makePayload({ sheet: rerun }))
      await click(buttonByText('Discard run and allow re-run', dialog))
      expect(mocked.mulliganSheet).toHaveBeenCalledWith('game1', 'Field power cut')
      expect(wrapper.get('[data-testid=mulligan-note]').text()).toContain('Re-run granted by Grace')
      expect(wrapper.get('[data-testid=mulligan-note]').text()).toContain('Field power cut')
      expect(total(wrapper)).toBe('0')
    })

    it('M9-T03: table judges see no mulligan action', async () => {
      mocked.getSheet.mockResolvedValue(
        makePayload({ sheet: makeSheet({ status: 'submitted', values: COMPLETE }) }),
      )
      const { wrapper } = await mountGame()
      expect(wrapper.find('[data-testid=mulligan]').exists()).toBe(false)
    })

    it('M9-04: a device draft and stopwatch of the discarded run are dropped', async () => {
      writeDraft({
        gameId: 'game1',
        input: { outcome: 'completed', values: COMPLETE, time_ms: 95_000, points: null },
        stopwatch: { startedAt: Date.now() - 5000, elapsedMs: 0 },
        // Newer than the server copy, but made before the mulligan.
        savedAt: Date.now() + 60_000,
        synced: false,
        mulligans: 0,
      })
      mocked.getSheet.mockResolvedValue(
        makePayload({
          sheet: makeSheet({ mulligans: 1, mulligan_reason: 'Robot hit', client_saved_at: 5 }),
        }),
      )
      const { wrapper } = await mountGame()
      expect(wrapper.get('[data-testid=sync-notice]').text()).toContain('re-run was granted')
      expect(total(wrapper)).toBe('0')
      expect(readDraft('game1')).toBeNull()
      expect(mocked.saveDraft).not.toHaveBeenCalled()

      // New entries are saved for the re-run.
      await choice(wrapper, 'flag', 'Yes').trigger('click')
      expect(readDraft('game1')?.mulligans).toBe(1)
    })
  })

  describe('M9-B program verification', () => {
    it('M9-T05 / M9-07: shows the recorded program above the stopwatch', async () => {
      const base = makePayload()
      mocked.getSheet.mockResolvedValue(
        makePayload({ game: { ...base.game, program_name: 'mission_v3' } }),
      )
      const { wrapper } = await mountGame()
      const program = wrapper.get('[data-testid=program-value]')
      expect(program.text()).toBe('mission_v3')
      const html = wrapper.html()
      expect(html.indexOf('data-testid="program-name"')).toBeLessThan(html.indexOf('Stopwatch'))
    })

    it('M9-07: says when no program was recorded and lets the judge enter it', async () => {
      mocked.setProgram.mockResolvedValue({ program_name: 'final_run' })
      const { wrapper } = await mountGame()
      expect(wrapper.find('[data-testid=program-none]').exists()).toBe(true)
      await click(wrapper.get('[data-testid=program-edit]').element as HTMLElement)
      await fill('#program-game1', 'final_run')
      await click(buttonByText('Save', wrapper.get('[data-testid=program-name]').element))
      expect(mocked.setProgram).toHaveBeenCalledWith('game1', 'final_run')
      expect(wrapper.get('[data-testid=program-value]').text()).toBe('final_run')
    })

    it('M9-08: a judge cannot change the program of a submitted sheet', async () => {
      mocked.getSheet.mockResolvedValue(
        makePayload({
          sheet: makeSheet({ status: 'submitted', values: COMPLETE }),
          permissions: { canEdit: false, canReview: false, canCorrect: false },
        }),
      )
      const { wrapper } = await mountGame()
      expect(wrapper.find('[data-testid=program-edit]').exists()).toBe(false)
    })
  })
})
