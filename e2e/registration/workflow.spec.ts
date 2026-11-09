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

test.describe('M1 registration to approval', () => {
  test('coach registers and submits a team; admin approves it', async ({ browser }) => {
    const { event } = await createEvent()
    const coach = await createUser({ name: 'Cora Coach' })
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    const teamName = unique('Robo Rangers')

    // Coach: register and submit (M1-10, M1-T08).
    const coachPage = await (await browser.newContext()).newPage()
    await login(coachPage, coach.email, coach.password)
    await coachPage.getByRole('link', { name: 'Events' }).first().click()
    await coachPage.getByRole('link', { name: event.name }).click()
    await coachPage.getByRole('link', { name: 'Register a team' }).click()
    await fillTeam(coachPage, teamName, [2013, 2014])
    await coachPage.getByRole('button', { name: 'Submit registration' }).click()
    await expect(coachPage.getByTestId('team-status')).toHaveText('Submitted')
    await expect(coachPage.getByText('awaiting review')).toBeVisible()

    // Admin: approve (M1-11).
    const adminPage = await (await browser.newContext()).newPage()
    await login(adminPage, admin.email, admin.password)
    await adminPage.goto(`/events/${event.id}`)
    await adminPage.getByRole('tab', { name: 'Teams' }).click()
    const row = adminPage.locator(`[data-team="${teamName}"]`)
    await expect(row.getByTestId('team-status')).toHaveText('Submitted')
    await row.getByRole('button', { name: 'Approve' }).click()
    await expect(row.getByTestId('team-status')).toHaveText('Approved')

    // Coach sees the result.
    await coachPage.goto('/teams')
    await expect(coachPage.getByTestId('my-teams')).toContainText(teamName)
    await expect(coachPage.getByTestId('my-teams').getByTestId('team-status')).toHaveText(
      'Approved',
    )
  })

  test('M1-T09: rejected registrations show the reason and can be resubmitted', async ({
    browser,
  }) => {
    const { event } = await createEvent()
    const coach = await createUser()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const teamName = unique('Bot Builders')

    const coachPage = await (await browser.newContext()).newPage()
    await login(coachPage, coach.email, coach.password)
    await coachPage.goto(`/events/${event.id}/teams/new`)
    await fillTeam(coachPage, teamName, [2013, 2013])
    await coachPage.getByRole('button', { name: 'Submit registration' }).click()
    await expect(coachPage.getByTestId('team-status')).toHaveText('Submitted')

    const managerPage = await (await browser.newContext()).newPage()
    await login(managerPage, manager.email, manager.password)
    await managerPage.goto(`/events/${event.id}`)
    await managerPage.getByRole('tab', { name: 'Teams' }).click()
    await managerPage
      .locator(`[data-team="${teamName}"]`)
      .getByRole('button', { name: 'Reject' })
      .click()
    const dialog = managerPage.getByRole('dialog')
    await dialog.getByLabel('Reason').fill('Please add the school name in full.')
    await dialog.getByRole('button', { name: 'Reject' }).click()
    await expect(
      managerPage.locator(`[data-team="${teamName}"]`).getByTestId('team-status'),
    ).toHaveText('Rejected')

    await coachPage.reload()
    await expect(coachPage.getByTestId('review-note')).toContainText(
      'Please add the school name in full.',
    )
    await coachPage.getByLabel('School / organization').fill('Example School of Robotics')
    await coachPage.getByRole('button', { name: 'Submit registration' }).click()
    await expect(coachPage.getByTestId('team-status')).toHaveText('Submitted')
  })

  test('incomplete teams cannot be submitted', async ({ page }) => {
    const { event } = await createEvent()
    const coach = await createUser()
    await login(page, coach.email, coach.password)
    await page.goto(`/events/${event.id}/teams/new`)
    await fillTeam(page, unique('Solo'), [2013])
    await page.getByRole('button', { name: 'Submit registration' }).click()
    await expect(page.getByTestId('client-errors')).toContainText('at least 2 members')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByTestId('team-status')).toHaveText('Draft')
  })
})
