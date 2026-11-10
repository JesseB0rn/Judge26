import { expect, test, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  getScoreSheet,
  publishRuleset,
  setRanking,
  unique,
  updateRound,
} from '../support/backend'
import { login, logout } from '../support/pages'

const RULESET = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [
      { id: 'flag', label: 'Flag raised', type: 'boolean', points: 10, required: true },
      {
        id: 'blocks',
        label: 'Blocks',
        type: 'number',
        integer: true,
        min: 0,
        max: 6,
        pointsPerUnit: 5,
        required: true,
      },
      {
        id: 'parking',
        label: 'Parking',
        type: 'group',
        aggregate: 'sum',
        selection: { min: 1, max: 1 },
        children: [
          { id: 'full', label: 'Fully parked', type: 'boolean', points: 15 },
          { id: 'partial', label: 'Partly parked', type: 'boolean', points: 5 },
        ],
      },
    ],
  },
}

/**
 * One event with a table judge and two games on their table. Other staff are only created when a
 * test needs them: every role assignment makes the M1 access rules slower for all tests.
 */
async function setup(options: { otherJudge?: boolean; headJudge?: boolean } = {}) {
  const { event, category } = await createEvent()
  const judge = await createUser({
    name: 'Table Judge',
    roles: [{ role: 'judge', event: event.id }],
  })
  const otherJudge = options.otherJudge
    ? await createUser({ roles: [{ role: 'judge', event: event.id }] })
    : null
  const headJudge = options.headJudge
    ? await createUser({ name: 'Head Judge', roles: [{ role: 'head_judge', event: event.id }] })
    : null
  const day = await createDay(event.id, '2026-06-13', 'Saturday')
  const round = await createRound(category.id, 'R1')
  await updateRound(round.id, { day: day.id })
  await publishRuleset(category.id, RULESET)
  await setRanking(category.id, {
    schemaVersion: 1,
    precision: 0,
    rounds: [{ key: 'R1' }],
    calculations: [],
    ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc' }] },
  })
  const table = await createTable(event.id, 'Table A', judge.id)
  if (otherJudge) await createTable(event.id, 'Table B', otherJudge.id)
  const alpha = unique('Alpha')
  const bravo = unique('Bravo')
  const alphaTeam = await createApprovedTeam(event.id, category.id, alpha)
  const bravoTeam = await createApprovedTeam(event.id, category.id, bravo)
  const first = await createPlacedGame(round.id, alphaTeam.id, table.id, 1)
  const second = await createPlacedGame(round.id, bravoTeam.id, table.id, 2)
  return { event, category, judge, otherJudge, headJudge, alpha, bravo, first, second }
}

const criterion = (page: Page, id: string) => page.locator(`[data-node="${id}"]`)
const yes = (page: Page, id: string) => criterion(page, id).getByRole('button', { name: /^Yes/ })
const total = (page: Page) => page.getByTestId('live-total')

test.describe('M5 judge interface and scoring workflow', () => {
  test('a game is scored, submitted, approved and reflected in the ranking', async ({ page }) => {
    const ctx = await setup({ headJudge: true })
    const headJudge = ctx.headJudge!

    // M5-T01: two interactions from login to the assigned game.
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.getByTestId('judging-card').click()
    const next = page.getByTestId('up-next')
    await expect(next).toContainText(ctx.alpha)
    await expect(next).toContainText('Table A')
    await next.click()

    // M5-T02 / M5-03: the right game.
    await expect(page.getByTestId('team-name')).toHaveText(ctx.alpha)
    await expect(page.getByTestId('game-context')).toHaveText(
      'RM-J · Round 1 · Table A · #1 · Saturday',
    )

    // M5-T04 / M5-06: live total.
    await expect(total(page)).toHaveText('0')
    await yes(page, 'flag').click()
    await expect(total(page)).toHaveText('10')

    // M5-T09: an incomplete sheet cannot be submitted; the missing criteria are highlighted.
    await expect(page.getByTestId('missing')).toContainText('2 missing: Blocks, Parking')
    await page.getByRole('button', { name: 'Submit score' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(criterion(page, 'blocks')).toHaveAttribute('data-missing', 'true')
    await criterion(page, 'blocks').getByRole('button', { name: 'Increase' }).click()
    await criterion(page, 'blocks').getByRole('button', { name: 'Increase' }).click()
    await expect(total(page)).toHaveText('20')

    // M5-T05: exclusive options.
    await yes(page, 'partial').click()
    await yes(page, 'full').click()
    await expect(yes(page, 'partial')).toHaveAttribute('aria-pressed', 'false')
    await expect(total(page)).toHaveText('35')

    // M5-T06: stopwatch.
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByTestId('stopwatch-display')).not.toHaveText('0:00.00')
    const recorded = await page.getByTestId('stopwatch-display').textContent()

    // M5-T07: the draft survives a reload.
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/)
    await page.reload()
    await expect(total(page)).toHaveText('35')
    await expect(page.getByTestId('stopwatch-display')).toHaveText(recorded!)

    // M5-T08: submit.
    await page.getByTestId('action-bar').getByRole('button', { name: 'Submit score' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('submit-summary')).toContainText('35')
    await dialog.getByRole('button', { name: 'Submit score' }).click()
    await expect(page.getByTestId('score-state')).toHaveText('Submitted')

    // Back on the dashboard, the next team is up.
    await page.getByRole('link', { name: 'Back to my games' }).click()
    await expect(page.getByTestId('up-next')).toContainText(ctx.bravo)
    await logout(page)

    // M5-T10: the head judge approves.
    await login(page, headJudge.email, headJudge.password)
    await page.getByTestId('judging-card').click()
    await page.getByRole('tab', { name: 'Review' }).click()
    const queue = page.getByTestId('review-queue')
    await expect(queue).toContainText('Waiting for review (1)')
    await queue.getByRole('link', { name: `Score ${ctx.alpha}` }).click()
    await expect(total(page)).toHaveText('35')
    await page.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByTestId('score-state')).toHaveText('Final')

    // M5-T12: an authorized correction with a reason.
    await page.getByRole('button', { name: 'Correct score' }).click()
    await criterion(page, 'blocks').getByRole('button', { name: 'Increase' }).click()
    await expect(total(page)).toHaveText('40')
    await page.getByRole('button', { name: 'Save correction' }).click()
    await page.getByRole('dialog').getByLabel('Reason').fill('Video review: three blocks')
    await page.getByRole('dialog').getByRole('button', { name: 'Save correction' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByText(/History/).click()
    await expect(page.getByTestId('score-history')).toContainText('Video review: three blocks')
    await expect(page.getByTestId('score-history')).toContainText('Points 35 → 40')

    // Exit criterion: reflected in the ranking.
    await page.goto(`/categories/${ctx.category.id}/ranking`)
    const rows = page.getByTestId('ranking').locator('[data-team]')
    await expect(rows.nth(0)).toHaveAttribute('data-team', ctx.alpha)
    await expect(rows.nth(0)).toContainText('40')
  })

  test('M5-T03: a judge cannot open a game of another table', async ({ page }) => {
    const ctx = await setup({ otherJudge: true })
    await login(page, ctx.otherJudge!.email, ctx.otherJudge!.password)
    await page.goto(`/judging/games/${ctx.first.id}`)
    await expect(page.getByRole('alert')).toContainText('not assigned to you')
    await expect(page.getByTestId('team-name')).toHaveCount(0)
  })

  test('M5-T13 / M5-T14: scoring continues offline and synchronizes on reconnect', async ({
    page,
    context,
  }) => {
    const ctx = await setup()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto(`/judging/games/${ctx.second.id}`)
    await expect(page.getByTestId('team-name')).toHaveText(ctx.bravo)

    await context.setOffline(true)
    await yes(page, 'flag').click()
    await expect(page.getByTestId('save-state')).toContainText('Offline')
    await expect(total(page)).toHaveText('10')
    expect(await getScoreSheet(ctx.second.id)).toBeNull()

    await context.setOffline(false)
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/)
    await expect
      .poll(async () => (await getScoreSheet(ctx.second.id))?.values)
      .toEqual({ flag: true })
  })
})
