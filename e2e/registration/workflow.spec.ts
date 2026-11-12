import { expect, test, type Page } from '@playwright/test'
import { createEvent, createUser, unique } from '../support/backend'
import { login } from '../support/pages'

async function fillTeam(page: Page, name: string, birthYears: number[]) {
  await page.getByLabel('Team name').fill(name)
  await page.getByLabel('School / organization').fill('Example School')
  for (const [i, year] of birthYears.entries()) {
    await page.getByRole('button', { name: 'Add member' }).click()
    await page.getByLabel(`Member ${i + 1} first name`).fill(`First${i + 1}`)
    await page.getByLabel(`Member ${i + 1} last name`).fill(`Last${i + 1}`)
    await page.getByLabel(`Member ${i + 1} birth year`).fill(String(year))
  }
}

// Teams (M1-12, M8-A): event managers add and import them; there is no self-registration.
test.describe('M8-A teams', () => {
  test('a manager adds an active team, withdraws and reactivates it', async ({ page }) => {
    const { event } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const teamName = unique('Robo Rangers')

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}?tab=teams`)
    await page.getByRole('link', { name: 'Add team' }).click()
    await fillTeam(page, teamName, [2013, 2014])
    await page.getByLabel('Contact', { exact: true }).fill('Jane Doe')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('team-status')).toHaveText('Active')

    await page.getByRole('button', { name: 'Withdraw team' }).click()
    await expect(page.getByTestId('team-status')).toHaveText('Withdrawn')
    await page.getByRole('button', { name: 'Activate team' }).click()
    await expect(page.getByTestId('team-status')).toHaveText('Active')

    await page.goto(`/events/${event.id}?tab=teams`)
    const row = page.locator(`[data-team="${teamName}"]`)
    await expect(row).toContainText('Jane Doe')
    await expect(row.getByTestId('team-status')).toHaveText('Active')
  })

  test('incomplete teams cannot be added', async ({ page }) => {
    const { event } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}/teams/new`)
    await fillTeam(page, unique('Solo'), [2013])
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('client-errors')).toContainText('at least 2 members')
  })

  test('M8-01 / M8-02: users without a role cannot register or see teams', async ({ page }) => {
    const { event } = await createEvent()
    const user = await createUser()
    await login(page, user.email, user.password)
    await expect(page.getByRole('link', { name: 'My teams' })).toHaveCount(0)
    await page.goto(`/events/${event.id}`)
    await expect(page.getByRole('heading', { name: event.name })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Teams' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Register a team' })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/coach/i)
  })
})
