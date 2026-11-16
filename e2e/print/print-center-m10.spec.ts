import { expect, test } from '@playwright/test'
import {
  createApprovedTeam,
  createCategory,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  unique,
  updateRound,
} from '../support/backend'
import { login } from '../support/pages'

// M10-31 – M10-34: print center (M10-T46 – M10-T48).
async function setup() {
  const { event, category } = await createEvent()
  const other = await createCategory(event.id, unique('O').slice(0, 10), 'Other Category')
  const headJudge = await createUser({
    name: 'Head Judge',
    roles: [{ role: 'head_judge', event: event.id }],
  })
  const judge = await createUser({
    name: 'Table Judge',
    roles: [{ role: 'judge', event: event.id }],
  })
  const day = await createDay(event.id, '2026-06-13', 'Saturday')
  const round = await createRound(category.id, 'R1')
  await updateRound(round.id, { day: day.id })
  const table = await createTable(event.id, unique('Table'), judge.id)
  const names = [unique('Alpha'), unique('Bravo')]
  for (const [i, name] of names.entries()) {
    const team = await createApprovedTeam(event.id, category.id, name)
    await createPlacedGame(round.id, team.id, table.id, i + 1)
  }
  await createApprovedTeam(event.id, other.id, unique('Other'))
  return { event, category, headJudge, judge, table, round, names }
}

test.describe('M10-F print center', () => {
  test('M10-T46: parking labels of one category print one A4 page per team', async ({
    page,
    browserName,
  }) => {
    const ctx = await setup()
    await login(page, ctx.headJudge.email, ctx.headJudge.password)
    await page.goto(`/events/${ctx.event.id}`)
    await page.getByTestId('print-link').click()
    await page.getByTestId('print-category').selectOption(ctx.category.id)
    const labels = page.locator('[data-page=parking]')
    await expect(labels).toHaveCount(2)
    await expect(labels.first()).toContainText(ctx.names[0]!)
    // A4: 210 mm wide (at 96 dpi).
    const width = await labels.first().evaluate((e) => e.getBoundingClientRect().width)
    expect(Math.round(width)).toBe(Math.round((210 / 25.4) * 96))

    if (browserName === 'chromium') {
      await page.emulateMedia({ media: 'print' })
      const pdf = await page.pdf({ preferCSSPageSize: true })
      const count = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
      expect(count).toBe(2)
    }
  })

  test('M10-T48: table assignment with teams in playing order', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.headJudge.email, ctx.headJudge.password)
    await page.goto(`/events/${ctx.event.id}/print?kind=tables&variant=both`)
    const sheet = page.locator(`[data-page=table][data-record="${ctx.table.id}"]`)
    await expect(sheet.locator('[data-team]')).toHaveText([
      new RegExp(ctx.names[0]!),
      new RegExp(ctx.names[1]!),
    ])
    await expect(sheet.getByTestId('table-judges')).toContainText('Table Judge')
  })

  test('M10-T46: a judge is denied', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto(`/events/${ctx.event.id}/print`)
    await expect(page.getByText('Only event managers and head judges')).toBeVisible()
    await expect(page.locator('[data-page]')).toHaveCount(0)
  })

  test('M10-35: QR poster in the print center and the QR code for staff on the live page', async ({
    page,
  }) => {
    const ctx = await setup()
    await login(page, ctx.headJudge.email, ctx.headJudge.password)
    await page.goto(`/events/${ctx.event.id}/print?kind=qr`)
    const poster = page.locator('[data-page=qr]')
    await expect(poster).toHaveCount(1)
    await expect(poster.getByTestId('qr-code')).toHaveAttribute(
      'data-qr-value',
      new RegExp(`/live/${ctx.event.id}\\?tab=rankings$`),
    )
    await page.goto(`/live/${ctx.event.id}`)
    await page.getByTestId('live-qr').locator('summary').click()
    await expect(page.getByTestId('live-qr').getByTestId('qr-code').locator('svg')).toBeVisible()
  })
})
