import { expect, test } from '@playwright/test'
import { createEvent, createUser } from '../support/backend'
import { login } from '../support/pages'

// M8-C: an admin views the app as a judge of an event and returns (M8-T08). Admins work on
// desktops.
test.describe('M8-C view as', () => {
  test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1000, 'desktop only')

  test('M8-T08: an admin switches to a judge with the hotkey and back', async ({ page }) => {
    const { event } = await createEvent()
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    await login(page, admin.email, admin.password)
    await page.goto(`/events/${event.id}`)
    await expect(page.getByRole('heading', { name: event.name })).toBeVisible()

    await page.keyboard.press('Alt+Shift+KeyV')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Event')).toHaveValue(event.id)
    await dialog.getByLabel('Role').selectOption('judge')
    await dialog.getByRole('button', { name: 'Switch' }).click()

    await expect(page).toHaveURL(/\/judging/)
    const banner = page.getByTestId('view-as-banner')
    await expect(banner).toContainText(`Viewing as Judge of ${event.name}`)
    await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0)

    // The switch survives a reload; admin pages stay closed.
    await page.goto('/admin/audit')
    await expect(page).not.toHaveURL(/\/admin\/audit/)
    await expect(banner).toBeVisible()

    await page.keyboard.press('Alt+Shift+KeyV')
    await expect(banner).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/events/${event.id}`))
    await page.goto('/admin/audit')
    await expect(page.getByText(`Started viewing as judge · ${event.name}`)).toBeVisible()
  })
})
