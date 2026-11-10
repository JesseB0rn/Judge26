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
  test('manager assigns a judge, generates missing games, sets their sequence; the coach sees it', async ({
    page,
  }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await createUser({
      name: unique('Judge'),
      roles: [{ role: 'judge', event: event.id }],
    })
    const coach = await createUser()
    const alpha = unique('Alpha')
    const bravo = unique('Bravo')
    const round = await createRound(category.id, 'R1', 5, 10)
    const alphaTeam = await createApprovedTeam(event.id, category.id, alpha, coach.id)
    await createApprovedTeam(event.id, category.id, bravo)

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Schedule' }).click()
    await expect(page.getByTestId('schedule-summary')).toHaveText('0 assigned · 0 unassigned')

    // A table has one fixed judge.
    await page.getByLabel('Table name').fill('Table A')
    await page.getByLabel('Assigned judge').selectOption(judge.id)
    await page.getByRole('button', { name: 'Add table' }).click()
    await expect(page.getByTestId('tables')).toContainText('Table A')

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

    // The coach sees the table and sequence of their team.
    await logout(page)
    await login(page, coach.email, coach.password)
    await page.goto('/teams')
    await expect(page.getByTestId('my-teams')).toContainText(alpha)
    const schedule = page.getByTestId('my-schedule')
    await expect(schedule).toContainText(alpha, { timeout: 15_000 })
    await expect(schedule).toContainText('Table A')
    await expect(schedule).toContainText('3')
    await expect(schedule).not.toContainText(bravo)
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
