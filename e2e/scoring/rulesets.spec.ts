import { expect, test, type Page } from '@playwright/test'
import { createEvent, createUser } from '../support/backend'
import { login } from '../support/pages'

// Saving a ruleset reloads the rulesets list, whose M2 access rule slows down with the amount of
// events, roles and teams in the shared test database (~1.5 s per list by the end of a full run;
// see docs/test-plans/M5-judging.md, "Not covered yet"). Until those rules are rewritten, waits
// after a save get more time than the 5 s default.
const afterSave = expect.configure({ timeout: 15_000 })

const sheet = (page: Page) => page.getByTestId('score-sheet')
const criterion = (page: Page, id: string) => page.locator(`[data-node="${id}"]`)

test.describe('M2 scoring rulesets', () => {
  test('manager creates, previews, publishes and versions a ruleset', async ({ page }) => {
    const { event } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)

    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Categories' }).click()
    await page.getByRole('link', { name: 'Scoring rules for RM-J' }).click()
    await expect(page.getByText('No scoring ruleset yet')).toBeVisible()

    // First draft starts from the example ruleset.
    await page.getByRole('button', { name: 'Create first draft' }).click()
    await afterSave(page.getByTestId('ruleset-status')).toHaveText('Draft')
    // The visual builder opens first (M2-15).
    await expect(page.getByTestId('builder-status')).toHaveText(/Valid/)

    // Live preview (M2-13, M5-04/06 groundwork).
    await page.getByRole('tab', { name: 'Preview' }).click()
    await criterion(page, 'flag').getByRole('button', { name: /^Yes/ }).click()
    await criterion(page, 'blocks').getByRole('button', { name: 'Increase' }).click()
    await criterion(page, 'blocks').getByRole('button', { name: 'Increase' }).click()
    await expect(sheet(page).getByTestId('score-total')).toHaveText('20')
    // Conditional bonus (M2-F05) becomes available only for a three-level tower.
    await expect(criterion(page, 'bonus').getByRole('button', { name: /^Yes/ })).toBeDisabled()
    await criterion(page, 'tower')
      .getByRole('radio', { name: /Three levels/ })
      .click()
    await criterion(page, 'bonus').getByRole('button', { name: /^Yes/ }).click()
    await expect(sheet(page).getByTestId('score-total')).toHaveText('55')
    // Exclusive parking group (M2-F02).
    await criterion(page, 'parkFull').getByRole('button', { name: /^Yes/ }).click()
    await criterion(page, 'parkPartial').getByRole('button', { name: /^Yes/ }).click()
    await expect(criterion(page, 'parkFull').getByRole('button', { name: /^Yes/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(sheet(page).getByTestId('score-total')).toHaveText('60')
    await expect(page.getByTestId('sheet-valid')).toBeVisible()
    await expect(page.getByTestId('explanation')).toContainText('SUM(10, 10, 5, 20, 15) = 60')

    // Invalid definitions cannot be published (M2-12).
    await page.getByRole('tab', { name: 'Definition' }).click()
    await page.getByRole('radio', { name: 'JSON' }).click()
    const editor = page.getByLabel('Ruleset definition (JSON)')
    const original = await editor.inputValue()
    await editor.fill(original.replace('"ref": "tower"', '"ref": "ghost"'))
    await expect(page.getByTestId('ruleset-issues')).toContainText('Unknown node "ghost"')
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await editor.fill(original)

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Publish' }).click()
    await afterSave(page.getByTestId('ruleset-status')).toHaveText('Published')
    await expect(editor).toHaveAttribute('readonly', '')

    // A new version does not change the published one (M2-T10, M2-T11).
    await page.getByRole('button', { name: 'New draft from selected' }).click()
    await afterSave(page.getByTestId('ruleset-status')).toHaveText('Draft')
    await editor.fill(
      (await editor.inputValue()).replace(
        '"points": 10,\n            "required": true',
        '"points": 50,\n            "required": true',
      ),
    )
    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByRole('button', { name: 'Publish' }).click()
    // Version 1 is relabelled "published" only once the list has reloaded after publishing.
    await afterSave(page.getByTestId('ruleset-status')).toHaveText('Published')
    await expect(page.getByRole('combobox', { name: 'Version' })).toHaveValue(/.+/)

    await page.getByRole('tab', { name: 'Preview' }).click()
    await criterion(page, 'flag').getByRole('button', { name: /^Yes/ }).click()
    await expect(sheet(page).getByTestId('score-total')).toHaveText('50')

    await page
      .getByRole('combobox', { name: 'Version' })
      .selectOption({ label: 'Version 1 – published' })
    await criterion(page, 'flag').getByRole('button', { name: /^Yes/ }).click()
    await expect(sheet(page).getByTestId('score-total')).toHaveText('10')

    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByTestId('ruleset-history')).toContainText('published (active)')
  })

  test('users without a role can read the scoring rules but not change them', async ({ page }) => {
    const { event, category } = await createEvent()
    const user = await createUser()
    await login(page, user.email, user.password)
    await page.goto(`/categories/${category.id}/scoring`)
    await expect(page.getByRole('heading', { name: 'Scoring: RoboMission Junior' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Create first draft|New draft/ })).toHaveCount(0)
    expect(event.id).toBeTruthy()
  })
})
