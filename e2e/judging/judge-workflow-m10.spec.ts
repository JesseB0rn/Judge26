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
  unique,
  updateRound,
} from '../support/backend'
import { login } from '../support/pages'

// M10-A: judge workflow at the table (M10-T01 – M10-T11).
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
      { id: 'tower', label: 'Tower built', type: 'boolean', points: 20 },
    ],
  },
}

async function setup(names: { alpha?: string } = {}) {
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
  const round = await createRound(category.id, 'R1')
  await updateRound(round.id, { day: day.id })
  await publishRuleset(category.id, RULESET)
  const table = await createTable(event.id, unique('Table'), judge.id)
  const alpha = names.alpha ?? unique('Alpha')
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
  return { event, category, judge, headJudge, table, alpha, bravo, first, second }
}

const yes = (page: Page, id: string) =>
  page.locator(`[data-node="${id}"]`).getByRole('button', { name: /^Yes/ })

/** The team confirms with the keyboard alternative of the slider, then the judge submits. */
async function submitConfirmed(page: Page) {
  await page.getByTestId('action-bar').getByRole('button', { name: 'Submit score' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('slide-thumb').focus()
  await page.keyboard.press('End')
  await expect(dialog.getByTestId('slide-to-confirm')).toHaveAttribute('data-confirmed', 'true')
  await dialog.getByRole('button', { name: 'Submit score' }).click()
}

test.describe('M10-A judge workflow', () => {
  test('M10-T10: a head judge steps in at a table, scores and returns to that table', async ({
    page,
  }) => {
    const ctx = await setup()
    await login(page, ctx.headJudge.email, ctx.headJudge.password)
    await page.goto('/judging')
    await page.getByTestId('step-in').click()

    const card = page.locator(`[data-table="${ctx.table.name}"]`)
    await expect(card).toContainText('Table Judge')
    await expect(card.getByTestId('table-progress')).toHaveText('0 of 2 scored')
    await card.click()

    await expect(page.getByTestId('my-table')).toContainText(`You are judging at${ctx.table.name}`)
    await expect(page.getByTestId('up-next')).toContainText(ctx.alpha)
    await page.getByTestId('up-next').click()
    await expect(page.getByTestId('sheet-table')).toHaveText(ctx.table.name)
    await yes(page, 'flag').click()
    await submitConfirmed(page)

    // M10-T02: back on this table's dashboard, with the next team up.
    await expect(page).toHaveURL(new RegExp(`seat=${ctx.table.id}`))
    await expect(page.getByTestId('up-next')).toContainText(ctx.bravo)
    const sheet = await getScoreSheet(ctx.first.id)
    expect([sheet!.status, sheet!.judge]).toEqual(['submitted', ctx.headJudge.id])
    expect(sheet!.team_confirmed_at).not.toBe('')
  })

  test('M10-T04: a long team name is shown completely on a phone-sized screen', async ({
    page,
  }) => {
    const long = `${unique('Robo')} Rangers of the Northern Mountain Valley School`
    const ctx = await setup({ alpha: long })
    await page.setViewportSize({ width: 360, height: 780 })
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto('/judging')
    const fits = async (selector: string) => {
      const el = page.locator(selector).first()
      await expect(el).toContainText(long)
      return el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)
    }
    expect(await fits('[data-testid=up-next] .text-2xl')).toBe(true)
    expect(await fits(`[data-game="${ctx.first.id}"] .font-semibold`)).toBe(true)
    await page.getByTestId('up-next').click()
    expect(await fits('[data-testid=team-name]')).toBe(true)
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    )
  })

  test('M10-T03/T05: run time in the header; the step view edits the same draft and is remembered', async ({
    page,
  }) => {
    const ctx = await setup()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto(`/judging/games/${ctx.first.id}`)
    await page.getByRole('button', { name: 'Edit time' }).click()
    await page.locator('#manual-time').fill('1:35')
    await page.getByRole('button', { name: 'Set time' }).click()
    await expect(page.getByTestId('game-header').getByTestId('header-time')).toHaveText('1:35')

    await page.getByRole('button', { name: 'Step by step' }).click()
    const steps = page.getByTestId('step-sheet')
    await expect(steps.getByTestId('step-position')).toHaveText('Step 1 of 3')
    await yes(page, 'flag').click()
    await steps.getByTestId('step-next').click()
    await yes(page, 'tower').click()
    await steps.getByTestId('step-next').click()
    await expect(steps.getByTestId('step-summary')).toContainText('30')

    // Remembered on this device, with the same draft.
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/)
    await page.reload()
    await expect(page.getByTestId('step-sheet')).toBeVisible()
    await page.getByRole('button', { name: 'List' }).click()
    await expect(yes(page, 'flag')).toHaveAttribute('aria-pressed', 'true')
    await expect(yes(page, 'tower')).toHaveAttribute('aria-pressed', 'true')
  })
})
