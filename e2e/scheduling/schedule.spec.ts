import { expect, test, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createEvent,
  createRound,
  createScheduledGame,
  createUser,
  unique,
} from '../support/backend'
import { login, logout } from '../support/pages'

const row = (page: Page, team: string) =>
  page.getByTestId('schedule-games').locator('tr', { hasText: team })

test.describe('M4 tables and scheduling', () => {
  test('manager sets up tables and time, generates a schedule, edits it; the coach sees it', async ({
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
    const round = await createRound(category.id, 'R1', 15)
    const alphaTeam = await createApprovedTeam(event.id, category.id, alpha, coach.id)
    const bravoTeam = await createApprovedTeam(event.id, category.id, bravo)
    await createScheduledGame(round.id, alphaTeam.id)
    await createScheduledGame(round.id, bravoTeam.id)

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Schedule' }).click()
    await expect(page.getByTestId('schedule-summary')).toHaveText('0 placed · 2 unplaced')

    // M4-01: a table.
    await page.getByLabel('Table name').fill('Table A')
    await page.getByRole('button', { name: 'Add table' }).click()
    await expect(page.getByTestId('tables')).toContainText('Table A')

    // M4-03: an availability period (local time of the browser).
    await page.getByLabel('Start').fill('2026-11-14T09:00')
    await page.getByLabel('End').fill('2026-11-14T11:00')
    await page.getByRole('button', { name: 'Add period' }).click()
    await expect(page.getByTestId('time-slots')).toContainText('Available')

    // M4-06: preview changes nothing, generation stores the schedule.
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByTestId('generation-summary')).toContainText('Preview: all 2 games fit')
    await expect(page.getByTestId('schedule-summary')).toHaveText('0 placed · 2 unplaced')
    await page.getByRole('button', { name: 'Generate schedule' }).click()
    await expect(page.getByTestId('generation-summary')).toContainText('2 games placed')
    await expect(page.getByTestId('schedule-summary')).toHaveText('2 placed · 0 unplaced')
    await expect(page.getByTestId('schedule-issues')).toContainText('No conflicts')

    // M4-05 / M4-09: assign a judge manually.
    await page.getByRole('button', { name: `Schedule ${alpha}` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(judge.name).check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(row(page, alpha)).toContainText(judge.name)

    // M4-T11: moving the second game onto the first game's slot (09:00, same table) is rejected.
    // Which team the generator places first is not specified, so use the table order.
    const rows = page.getByTestId('schedule-games').locator('tbody tr')
    const second = rows.nth(1)
    const secondStart = await second.locator('td').first().innerText()
    await second.getByRole('button', { name: /^Schedule / }).click()
    await dialog.getByLabel('Start').fill('2026-11-14T09:00')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toContainText('already booked')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(rows.nth(1).locator('td').first()).toHaveText(secondStart)

    // The coach sees the time and table of their team.
    await logout(page)
    await login(page, coach.email, coach.password)
    await page.goto('/teams')
    const schedule = page.getByTestId('my-schedule')
    await expect(schedule).toContainText(alpha)
    await expect(schedule).toContainText('Table A')
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
