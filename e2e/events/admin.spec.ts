import { expect, test } from '@playwright/test'
import { createUser, unique } from '../support/backend'
import { login } from '../support/pages'

test.describe('M1 event administration', () => {
  test('admin creates an event with two days, categories from a template and staff', async ({
    page,
  }) => {
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    const judge = await createUser({ name: 'Jo Judge' })
    const eventName = unique('Swiss Final')
    const templateCode = unique('TPL').replace(/[^A-Za-z0-9_-]/g, '')
    await login(page, admin.email, admin.password)

    // Template in the category library (M1-08/09).
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Categories' })
      .click()
    await page.getByRole('button', { name: 'New template' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Future Innovators')
    await dialog.getByLabel('Code').fill(templateCode)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('cell', { name: templateCode, exact: true })).toBeVisible()

    // Event (M1-06).
    await page.goto('/events')
    await page.getByRole('button', { name: 'New event' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(eventName)
    await dialog.getByLabel('Status').selectOption('published')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: eventName })).toBeVisible()

    // Two competition days (M1-07, M1-T06).
    for (const [date, label] of [
      ['2026-06-13', 'Day 1'],
      ['2026-06-14', 'Day 2'],
    ]) {
      await page.getByLabel('Date').fill(date!)
      await page.getByLabel('Label').fill(label!)
      await page.getByRole('button', { name: 'Add day' }).click()
      await expect(page.getByTestId('competition-days')).toContainText(label!)
    }
    await expect(page.getByTestId('competition-days').locator('li')).toHaveCount(2)

    // Category from template (M1-T07).
    await page.getByRole('tab', { name: 'Categories' }).click()
    await page.getByRole('button', { name: 'Add from template' }).click()
    dialog = page.getByRole('dialog')
    await dialog
      .getByLabel('Template')
      .selectOption({ label: `${templateCode} – Future Innovators` })
    await dialog.getByLabel('Code').fill('FI')
    await dialog.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByRole('cell', { name: 'FI', exact: true })).toBeVisible()

    // Staff (M1-05, M8-B): an existing account is added to the event right away.
    await page.getByRole('tab', { name: 'Staff' }).click()
    const invite = page.getByTestId('invite-form')
    await invite.getByLabel('Name').fill('Jo Judge')
    await invite.getByLabel('Email').fill(judge.email)
    await invite.getByLabel('Role').selectOption('judge')
    await invite.getByRole('button', { name: 'Invite' }).click()
    await expect(page.getByTestId('event-staff')).toContainText('Jo Judge')
    await expect(
      page.locator(`[data-staff="${judge.email.toLowerCase()}"]`).getByTestId('staff-status'),
    ).toHaveText('Active')

    // Users page: search by email and grant the admin role.
    await page.goto('/admin/users')
    await page.getByLabel('Search users').fill(judge.email)
    const usersTable = page.getByTestId('users')
    await expect(usersTable.getByRole('row')).toHaveCount(2)
    await expect(usersTable).toContainText('Judge')
    await usersTable.getByRole('button', { name: 'Make admin' }).click()
    await expect(usersTable).toContainText('Administrator')

    // Archive (M1-T12).
    await page.goto('/events')
    await page.getByRole('link', { name: eventName }).click()
    await page.getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByText('This event is archived')).toBeVisible()
  })
})
