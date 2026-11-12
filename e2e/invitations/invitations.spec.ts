import { expect, test } from '@playwright/test'
import { createEvent, createUser, linkFromMail, unique } from '../support/backend'
import { login } from '../support/pages'

// M8-B: a manager invites a judge, who follows the emailed link, chooses a password and lands
// on the judge dashboard (M8-T05). Managers work on desktops.
test.describe('M8-B invitations', () => {
  test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1000, 'desktop only')

  test('M8-T05: an invited judge activates the account from the email', async ({ browser }) => {
    const { event } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const email = `${unique('invited')}@test.local`.toLowerCase()

    const managerPage = await (await browser.newContext()).newPage()
    await login(managerPage, manager.email, manager.password)
    await managerPage.goto(`/events/${event.id}?tab=staff`)
    const form = managerPage.getByTestId('invite-form')
    await form.getByLabel('Name').fill('Ivy Invited')
    await form.getByLabel('Email').fill(email)
    await form.getByRole('button', { name: 'Invite' }).click()
    await expect(managerPage.getByText('1 invited, 0 added')).toBeVisible()
    const row = managerPage.locator(`[data-staff="${email}"]`)
    await expect(row.getByTestId('staff-status')).toHaveText('Invited')

    // The judge follows the link (M8-12: tests read the captured email).
    const link = new URL(await linkFromMail(email, '/auth/invitation'))
    const judgePage = await (await browser.newContext()).newPage()
    await judgePage.goto(`${link.pathname}${link.search}`)
    await expect(judgePage.getByTestId('invitation-details')).toContainText(event.name)
    await judgePage.getByLabel('Password', { exact: true }).fill('ivy-password-1')
    await judgePage.getByLabel('Repeat password').fill('ivy-password-1')
    await judgePage.getByRole('button', { name: 'Activate account' }).click()
    await expect(judgePage).toHaveURL(/\/judging/)

    // The link works once; the manager sees the judge as active.
    await judgePage.goto(`${link.pathname}${link.search}`)
    await expect(judgePage.getByTestId('invitation-unusable')).toBeVisible()
    await managerPage.reload()
    await expect(row.getByTestId('staff-status')).toHaveText('Active')
  })

  test('M8-T04: a manager invites a CSV of judges after a preview', async ({ page }) => {
    const { event } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const existing = await createUser({ name: 'Existing Judge' })
    const fresh = `${unique('csv')}@test.local`.toLowerCase()
    const csv = [
      'name,email,role',
      `New Judge,${fresh},judge`,
      `Existing Judge,${existing.email},head_judge`,
      'Nobody,not-an-email,',
    ].join('\n')

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}?tab=staff`)
    await page.getByRole('button', { name: 'Import CSV' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('staff-import-file').setInputFiles({
      name: 'staff.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    await expect(dialog.getByTestId('staff-import-summary')).toHaveText(
      '1 to invite, 1 to add, 1 skipped.',
    )
    await dialog.getByRole('button', { name: 'Invite 2 people' }).click()
    await expect(page.getByText('1 invited, 1 added')).toBeVisible()
    await expect(page.locator(`[data-staff="${fresh}"]`).getByTestId('staff-status')).toHaveText(
      'Invited',
    )
    await expect(
      page.locator(`[data-staff="${existing.email}"]`).getByTestId('staff-status'),
    ).toHaveText('Active')
  })

  test('M8-11: admins read the captured emails in the dev mailbox', async ({ page }) => {
    const { event } = await createEvent()
    const admin = await createUser({ roles: [{ role: 'admin' }] })
    const email = `${unique('mailbox')}@test.local`.toLowerCase()
    await login(page, admin.email, admin.password)
    await page.goto(`/events/${event.id}?tab=staff`)
    const form = page.getByTestId('invite-form')
    await form.getByLabel('Name').fill('Mo Mailbox')
    await form.getByLabel('Email').fill(email)
    await form.getByRole('button', { name: 'Invite' }).click()
    await expect(page.getByText('1 invited')).toBeVisible()

    await page.getByRole('link', { name: 'Mailbox (dev)' }).click()
    await expect(page.getByTestId('mailbox-list')).toContainText(email)
    await page
      .getByTestId('mailbox-list')
      .getByRole('button', { name: new RegExp(email) })
      .click()
    const body = page.frameLocator('[data-testid=mailbox-body]')
    await expect(body.getByRole('link', { name: 'Accept invitation' })).toHaveAttribute(
      'href',
      /\/auth\/invitation\?token=/,
    )
  })
})
