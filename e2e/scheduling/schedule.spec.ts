import { expect, test, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createEvent,
  createRound,
  createUser,
  unique,
} from '../support/backend'
import { login, logout } from '../support/pages'

const row = (page: Page, team: string) =>
  page.getByTestId('schedule-games').locator('tr', { hasText: team })

test.describe('Tables and scheduling', () => {
  test('manager assigns judges, generates missing games and sets their sequence', async ({
    page,
  }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await createUser({
      name: unique('Judge'),
      roles: [{ role: 'judge', event: event.id }],
    })
    const alpha = unique('Alpha')
    const bravo = unique('Bravo')
    const round = await createRound(category.id, 'R1', 5, 10)
    await createApprovedTeam(event.id, category.id, alpha)
    await createApprovedTeam(event.id, category.id, bravo)

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Schedule' }).click()
    await expect(page.getByTestId('schedule-summary')).toHaveText('0 assigned · 0 unassigned')

    // Tables and their judges are set up on the board (M8-E).
    await page.getByRole('button', { name: 'Add a table to RoboMission Junior' }).click()
    await expect(page.locator('[data-column="Table 1"]')).toBeVisible()
    await page.getByRole('button', { name: `Actions for judge ${judge.name}` }).click()
    await page.getByRole('menuitem', { name: 'Table 1', exact: true }).click()
    await expect(page.getByTestId('judges-Table 1')).toContainText(judge.name)

    // Preview does not create games; generation creates the missing team/round games.
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByTestId('generation-summary')).toContainText(
      '2 game assignments are ready',
    )
    await expect(page.getByTestId('schedule-summary')).toHaveText('0 assigned · 0 unassigned')
    await page.getByRole('button', { name: 'Generate schedule' }).click()
    await expect(page.getByTestId('generation-summary')).toContainText('2 missing games created')
    await expect(page.getByTestId('schedule-summary')).toHaveText('2 assigned · 0 unassigned')
    await expect(page.getByTestId('schedule-issues')).toContainText('No conflicts')

    // Update the game's per-table sequence.
    await page.getByRole('button', { name: `Set sequence for ${alpha}` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Sequence on this table').fill('3')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(row(page, alpha)).toContainText('3')
  })

  test('judges see the schedule but cannot change it', async ({ page }) => {
    const { event } = await createEvent()
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    await login(page, judge.email, judge.password)
    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Schedule' }).click()
    await expect(page.getByTestId('schedule-summary')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add table' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate schedule' })).toHaveCount(0)
  })
})
