import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  createCategoryTable,
  createDay,
  createEvent,
  createRound,
  createUser,
  unique,
} from '../support/backend'
import { login } from '../support/pages'

// M8-D: event templates and the setup checklist (M8-T12 – M8-T14).
test.describe('M8-D event templates', () => {
  test('admin saves an event as template, downloads and uploads it, and starts a new event from it', async ({
    page,
  }) => {
    const { event, category } = await createEvent({ name: unique('Regional') })
    await createDay(event.id, '2026-05-09', 'Saturday')
    await createDay(event.id, '2026-05-10', 'Sunday')
    await createRound(category.id, 'R1')
    await createCategoryTable(event.id, 'Table 1', category.id, 1)
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    const templateName = unique('Regional format')
    const newName = unique('Regional 2027')
    await login(page, admin.email, admin.password)

    // Save to the library (M8-21).
    await page.goto(`/events/${event.id}`)
    await page.getByRole('button', { name: 'Save as template' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(templateName)
    // The file download (M8-22, M8-T12).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Download file' }).click(),
    ])
    const file = JSON.parse(await readFile((await download.path())!, 'utf8'))
    expect(file).toMatchObject({ format: 'judge26.event-template', version: 1 })
    expect(JSON.stringify(file)).not.toMatch(/"(teams|games|judges)"/)
    await dialog.getByRole('button', { name: 'Save to library' }).click()
    await expect(page.getByText('Saved to the template library.')).toBeVisible()

    // Library: a newer-version file is refused with a reason (M8-T14); a valid one is kept.
    await page.goto('/admin/templates')
    await expect(page.locator(`[data-template="${templateName}"]`)).toContainText('2 days')
    const chooser = page.locator('[data-testid=template-upload]')
    await chooser.setInputFiles({
      name: 'newer.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...file, version: 99 })),
    })
    await expect(page.getByText('newer version of Judge26 (format 99)')).toBeVisible()
    await chooser.setInputFiles({
      name: 'copy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...file, name: `${templateName} upload` })),
    })
    await expect(page.locator(`[data-template="${templateName} upload"]`)).toContainText(
      'Uploaded file',
    )

    // New event from the template with a new first day (M8-23, M8-T13).
    await page.goto('/events')
    await page.getByRole('button', { name: 'From template' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Template').selectOption({ label: templateName })
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByLabel('First day').fill('2027-05-15')
    await dialog.getByRole('button', { name: 'Create event' }).click()

    // It opens on the setup checklist (M8-20).
    await expect(page.getByRole('heading', { name: newName })).toBeVisible()
    const checklist = page.getByTestId('setup-checklist')
    await expect(checklist.locator('[data-step=days]')).toHaveAttribute('data-done', 'true')
    await expect(checklist.locator('[data-step=teams]')).toHaveAttribute('data-done', 'false')
    // Judges are not part of a template, so the copied tables wait for them (M9-C).
    await expect(checklist.locator('[data-step=judges]')).toHaveAttribute('data-done', 'false')
    await expect(checklist.locator('[data-step=tables]')).toHaveAttribute('data-done', 'false')
    await expect(checklist.locator('[data-step=tables]')).toContainText('1 table without a judge')
    await expect(checklist.locator('[data-step=tables]')).toContainText(/Needs .*Judges first\./)
    await expect(checklist.locator('[data-step=schedule]')).toContainText(
      'Needs Tables, Teams first.',
    )

    await checklist.getByRole('link', { name: 'Open: Competition days' }).click()
    // The template's days moved to the new first day.
    const days = page.getByTestId('competition-days')
    await expect(days).toContainText('Saturday')
    await expect(days.locator('[aria-label*="2027-05-15"]').first()).toBeVisible()
    await expect(days.locator('[aria-label*="2027-05-16"]').first()).toBeVisible()
  })
})
