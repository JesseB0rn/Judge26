import { expect, test } from '@playwright/test'
import {
  createApprovedTeam,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createScheduledGame,
  createTable,
  createUser,
  recordResult,
  setPublication,
  setRanking,
  unique,
  updateRound,
} from '../support/backend'
import { login } from '../support/pages'

/**
 * An event with two teams on one table in R1 (Saturday). The manager is only created when a test
 * signs in: every role assignment makes the M1 access rules slower for all tests.
 */
async function setup(options: { manager?: boolean; table?: boolean } = {}) {
  const { event, category } = await createEvent()
  const manager = options.manager
    ? await createUser({ name: 'Manager', roles: [{ role: 'event_manager', event: event.id }] })
    : null
  const day = await createDay(event.id, '2026-06-13', 'Saturday')
  const round = await createRound(category.id, 'R1')
  await updateRound(round.id, { day: day.id })
  await setRanking(category.id, {
    schemaVersion: 1,
    precision: 0,
    rounds: [{ key: 'R1' }],
    calculations: [],
    ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc', label: 'R1' }] },
  })
  const alpha = unique('Alpha')
  const bravo = unique('Bravo')
  const alphaTeam = await createApprovedTeam(event.id, category.id, alpha)
  const bravoTeam = await createApprovedTeam(event.id, category.id, bravo)
  let first, second
  if (options.table === false) {
    first = await createScheduledGame(round.id, alphaTeam.id)
    second = await createScheduledGame(round.id, bravoTeam.id)
  } else {
    // A table needs an event judge (M4).
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    const table = await createTable(event.id, 'Table A', judge.id)
    first = await createPlacedGame(round.id, alphaTeam.id, table.id, 1)
    second = await createPlacedGame(round.id, bravoTeam.id, table.id, 2)
  }
  return { event, category, manager, alpha, bravo, first, second }
}

const rank = (page: import('@playwright/test').Page, team: string) =>
  page.locator(`[data-testid=ranking] [data-team="${team}"] [data-testid=rank]`)

test.describe('M6 live competition and public interface', () => {
  // Public pages and TV displays are not tablet workflows. Running them only once also keeps the
  // shared test database smaller: the M1 access rules slow down with every event and role.
  test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1000, 'desktop only')

  test('the public sees published results and they update live', async ({ page }) => {
    const ctx = await setup()

    // M6-T04: nothing is public before a manager publishes.
    await page.goto(`/live/${ctx.event.id}`)
    await expect(page.getByRole('heading', { name: ctx.event.name })).toBeVisible()
    await expect(page.getByTestId('not-published')).toBeVisible()

    // M6-10: publish the live ranking.
    await setPublication(ctx.category.id, { public_live: true })
    await page.reload()
    await expect(page.getByTestId('live-title')).toBeVisible()
    await expect(page.getByTestId('provisional')).toContainText('2 of 2 games are not final')

    // M6-01 / M6-T01: a finalized result reaches the open page without a reload.
    await recordResult(ctx.second.id, 30)
    await expect(rank(page, ctx.bravo)).toHaveText('1', { timeout: 15_000 })
    await expect(page.getByTestId('provisional')).toContainText('1 of 2 games')
    await recordResult(ctx.first.id, 40)
    await expect(rank(page, ctx.alpha)).toHaveText('1', { timeout: 15_000 })
    await expect(page.getByTestId('provisional')).toHaveCount(0)

    // M6-04 / M6-08: schedule with game states.
    await page.getByRole('tab', { name: 'Schedule' }).click()
    await expect(page.locator(`[data-game="${ctx.first.id}"]`)).toContainText('Done')
    await expect(page.locator(`[data-game="${ctx.first.id}"]`)).toContainText('Table A · #1')

    // M6-T09: a refresh keeps the view and the published data.
    await page.reload()
    await expect(page).toHaveURL(/tab=schedule/)
    await expect(page.locator(`[data-game="${ctx.second.id}"]`)).toContainText('Done')
  })

  test('a manager publishes the official ranking; it is not changed by later results', async ({
    page,
  }) => {
    const ctx = await setup({ manager: true, table: false })
    await recordResult(ctx.first.id, 40)
    await recordResult(ctx.second.id, 30)

    await login(page, ctx.manager!.email, ctx.manager!.password)
    await page.goto(`/events/${ctx.event.id}`)
    await page.getByRole('tab', { name: 'Public results' }).click()
    const row = page.locator('[data-testid=publication] [data-category="RoboMission Junior"]')
    await row.getByRole('button', { name: 'Publish current ranking' }).click()
    await expect(row.getByTestId('published-at')).toBeVisible()

    // M6-T03: anyone (signed out) can see it.
    const guest = await page.context().browser()!.newPage()
    await guest.goto(`/live/${ctx.event.id}`)
    await expect(guest.getByTestId('official-title')).toContainText('Official ranking')
    await expect(rank(guest, ctx.alpha)).toHaveText('1')

    await recordResult(ctx.second.id, 90)
    await guest.reload()
    await expect(rank(guest, ctx.alpha)).toHaveText('1')
    await guest.close()
  })

  test('TV mode shows the results full screen without administration controls', async ({
    page,
  }) => {
    const ctx = await setup({ manager: true })
    await setPublication(ctx.category.id, { public_live: true })
    await recordResult(ctx.first.id, 40)

    // M6-T07: even the event manager sees no controls on the display.
    await login(page, ctx.manager!.email, ctx.manager!.password)
    await page.goto(`/live/${ctx.event.id}/tv?view=ranking`)
    await expect(page.getByTestId('tv-title')).toHaveText('RoboMission Junior')
    await expect(page.getByTestId('tv-ranking-row').first()).toContainText(ctx.alpha)
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(page.getByRole('button')).toHaveText(['Full screen'])

    // The table board shows who plays next.
    await page.goto(`/live/${ctx.event.id}/tv?view=tables&day=`)
    await expect(page.getByTestId('tv-table')).toContainText(ctx.bravo)
  })
})
