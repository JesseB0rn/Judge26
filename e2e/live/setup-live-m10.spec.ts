import { expect, test } from '@playwright/test'
import {
  createApprovedTeam,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  recordResult,
  unique,
  updateRound,
} from '../support/backend'
import { login } from '../support/pages'

// M10-F: publish from the checklist (M10-T45), QR code of the live ranking (M10-T49), progress
// per round (M10-T50).
test.describe('M10-F setup and live', () => {
  test('M10-T45: the checklist publishes the event like the header button', async ({ page }) => {
    const { event } = await createEvent({ status: 'draft' })
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}?tab=setup`)
    const row = page.getByTestId('setup-checklist').locator('[data-step=publish]')
    await expect(row).toHaveAttribute('data-done', 'false')
    await row.getByTestId('setup-publish').click()
    await expect(row).toHaveAttribute('data-done', 'true')
    await expect(row.getByTestId('setup-publish')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0)
  })

  test('M10-T49: the TV view shows the QR code of the live ranking, not for a draft event', async ({
    page,
  }) => {
    const { event } = await createEvent()
    await page.goto(`/live/${event.id}/tv?view=progress`)
    const qr = page.getByTestId('tv-qr').getByTestId('qr-code')
    await expect(qr.locator('svg')).toBeVisible()
    const url = await qr.getAttribute('data-qr-value')
    expect(url).toBe(new URL(`/live/${event.id}?tab=rankings`, page.url()).href)
    await page.goto(url!)
    await expect(page.getByRole('heading', { name: event.name })).toBeVisible()
    await page.goto(`/live/${event.id}/tv?view=progress&qr=0`)
    await expect(page.getByTestId('tv-progress').or(page.getByText('No games'))).toBeVisible()
    await expect(page.getByTestId('tv-qr')).toHaveCount(0)

    const draft = await createEvent({ status: 'draft' })
    await page.goto(`/live/${draft.event.id}/tv`)
    await expect(page.getByTestId('tv-qr')).toHaveCount(0)
  })

  test('M10-T50: the day’s progress bar has one segment per round', async ({ page }) => {
    const { event, category } = await createEvent()
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    const day = await createDay(event.id, '2026-06-13', 'Saturday')
    const table = await createTable(event.id, unique('Table'), judge.id)
    const sizes = [4, 2]
    for (const [i, size] of sizes.entries()) {
      const round = await createRound(category.id, `R${i + 1}`)
      await updateRound(round.id, { day: day.id, position: i + 1 })
      for (let n = 0; n < size; n++) {
        const team = await createApprovedTeam(event.id, category.id, unique('Team'))
        const game = await createPlacedGame(round.id, team.id, table.id, n + 1)
        if (i === 0 && n < 3) await recordResult(game.id, 10)
      }
    }
    await page.goto(`/live/${event.id}?tab=progress&day=${day.id}`)
    const bar = page.getByTestId('progress').first()
    const segments = bar.getByTestId('progress-segment')
    await expect(segments).toHaveCount(2)
    const widths = await segments.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().width),
    )
    expect(widths[0]! / widths[1]!).toBeCloseTo(2, 0)
    await expect(segments.first().locator('[data-fill=done]')).toHaveAttribute(
      'style',
      /width: 75%/,
    )
    await expect(bar.getByTestId('progress-segments')).toContainText('Round 1 · RM-J: 3 of 4')
  })
})
