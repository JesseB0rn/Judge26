import { expect, test, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createBlock,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  getScoreSheet,
  publishRuleset,
  unique,
  updateRound,
  uploadRoundFile,
} from '../support/backend'
import { login } from '../support/pages'

// M10-B: robot check, parts check and round file (M10-T13 – M10-T25).
const RULESET = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'flag', label: 'Flag raised', type: 'boolean', points: 10 }],
  },
}

// A 1×1 PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

async function setup(mode: 'synchronous' | 'asynchronous') {
  const { event, category } = await createEvent()
  const judge = await createUser({
    name: 'Table Judge',
    roles: [{ role: 'judge', event: event.id }],
  })
  const headJudge = await createUser({
    name: 'Head Judge',
    roles: [{ role: 'head_judge', event: event.id }],
  })
  const day = await createDay(event.id, '2026-06-13', 'Saturday')
  const round = await createRound(category.id, 'R1', 5, 10, mode)
  await updateRound(round.id, { day: day.id })
  await publishRuleset(category.id, RULESET)
  const table = await createTable(event.id, unique('Table'), judge.id)
  const alpha = unique('Alpha')
  const bravo = unique('Bravo')
  const first = await createPlacedGame(
    round.id,
    (await createApprovedTeam(event.id, category.id, alpha)).id,
    table.id,
    1,
  )
  const second = await createPlacedGame(
    round.id,
    (await createApprovedTeam(event.id, category.id, bravo)).id,
    table.id,
    2,
  )
  return { event, category, judge, headJudge, day, round, table, alpha, bravo, first, second }
}

const yes = (page: Page, id: string) =>
  page.locator(`[data-node="${id}"]`).getByRole('button', { name: /^Yes/ })

test.describe('M10-B checks', () => {
  test('M10-T13 – M10-T15 / M10-T25: synchronous round — check, ready, release unlocks the open sheet', async ({
    browser,
  }) => {
    const ctx = await setup('synchronous')
    await uploadRoundFile(ctx.round.id, 'Field R1.png', PNG, 'image/png')
    const judgeContext = await browser.newContext()
    const page = await judgeContext.newPage()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto('/judging')

    // The robot check comes first; both teams are checked and the table is ready.
    await expect(page.getByTestId('up-next')).toContainText('Robot check')
    await page.getByTestId('up-next').click()
    await page.getByTestId('team-check').click()
    await expect(page.getByTestId('team-checked-by')).toContainText('Table Judge')
    await page.getByTestId('check-next').click()
    await page.getByTestId('team-check').click()
    await expect(page.getByTestId('team-check')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('check-finish').click()

    // Back on the dashboard, the next game waits for the release.
    await expect(page.getByTestId('up-next')).toContainText(ctx.alpha)
    await expect(page.getByTestId('up-next-locked')).toContainText('Waiting for the release')
    await page.getByTestId('up-next').click()
    await expect(page.getByTestId('sheet-locked')).toContainText('Waiting for the release')
    await expect(page.getByTestId('round-file')).toHaveCount(0)

    // The head judge sees the table ready and releases the round.
    const headContext = await browser.newContext()
    const head = await headContext.newPage()
    await login(head, ctx.headJudge.email, ctx.headJudge.password)
    await head.goto(`/judging/checks?event=${ctx.event.id}`)
    const card = head.locator(`[data-round="${ctx.round.id}"]`)
    await expect(card.locator(`[data-table="${ctx.table.name}"]`)).toHaveAttribute(
      'data-ready',
      'true',
    )
    await expect(card.getByTestId('table-checked')).toHaveText('2 of 2')
    await card.getByTestId('release-round').click()
    await expect(card.getByTestId('round-released')).toContainText('Head Judge')

    // M10-T15: the judge's open sheet unlocks without a reload, with the round file.
    await expect(page.getByTestId('sheet-locked')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByTestId('round-file')).toContainText('Field R1.png')
    await yes(page, 'flag').click()
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/)
    expect((await getScoreSheet(ctx.first.id))?.status).toBe('draft')
    await judgeContext.close()
    await headContext.close()
  })

  test('M10-T18: asynchronous round — an unchecked team links to its check, then unlocks', async ({
    page,
  }) => {
    const ctx = await setup('asynchronous')
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto(`/judging/games/${ctx.second.id}?from=/judging`)
    await expect(page.getByTestId('sheet-locked')).toContainText('Robot check not confirmed')
    await page.getByTestId('to-check').click()
    await expect(page.getByTestId('check-current')).toContainText(ctx.bravo)
    await page.getByTestId('team-check').click()
    await expect(page.getByTestId('team-check')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('check-current').getByRole('link', { name: 'Score' }).click()
    await expect(page.getByTestId('sheet-locked')).toHaveCount(0)
    await yes(page, 'flag').click()
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/)
  })

  test('M10-T22 / M10-T23: the parts check gates the first round until the head judge completes it', async ({
    browser,
  }) => {
    const ctx = await setup('asynchronous')
    await createBlock(ctx.event.id, {
      day: ctx.day.id,
      starts_at: '08:00',
      duration_minutes: 30,
      title: 'Parts check',
      kind: 'parts_check',
      categories: [ctx.category.id],
    })
    const judgeContext = await browser.newContext()
    const page = await judgeContext.newPage()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto('/judging')
    await expect(page.getByTestId('up-next')).toContainText('Parts check')
    await page.getByTestId('up-next').getByTestId('parts-confirm').click()
    await expect(page.getByTestId('up-next')).toContainText('Robot check')

    // The robot check is locked until the head judge completes the parts check.
    await page.getByTestId('up-next').click()
    await expect(page.getByTestId('check-parts-open')).toContainText('Parts check')
    await expect(page.getByTestId('team-check')).toBeDisabled()

    const headContext = await browser.newContext()
    const head = await headContext.newPage()
    await login(head, ctx.headJudge.email, ctx.headJudge.password)
    await head.goto(`/judging/checks?event=${ctx.event.id}`)
    const block = head.locator('[data-parts-check="Parts check"]')
    await expect(block.locator(`[data-table="${ctx.table.name}"]`)).toHaveAttribute(
      'data-confirmed',
      'true',
    )
    await block.getByTestId('parts-complete').click()
    await expect(block.getByTestId('parts-completed')).toContainText('Head Judge')

    // The judge's check unlocks without a reload.
    await expect(page.getByTestId('check-parts-open')).toHaveCount(0, { timeout: 30_000 })
    await page.getByTestId('team-check').click()
    await expect(page.getByTestId('team-check')).toHaveAttribute('aria-pressed', 'true')
    await judgeContext.close()
    await headContext.close()
  })
})
