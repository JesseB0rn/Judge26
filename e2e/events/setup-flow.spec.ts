import { expect, test, type Page } from '@playwright/test'
import {
  createCategory,
  createCategoryTable,
  createDay,
  createEvent,
  createRound,
  createUser,
  getCategoryByCode,
  getRoundPhases,
  placePhase,
  publishRuleset,
  unique,
  updateRound,
} from '../support/backend'
import { login, moreAction, section } from '../support/pages'

// M11 exit criteria (docs/specifications/M11-setup-flow.md): an empty event set up to published
// by following the setup checklist, every round added and timed on the Categories tab, every link
// landing on its work with Back returning; and an event from a template where only teams, judges,
// judges on tables and placement remain.

const RULESET = {
  schemaVersion: 1,
  root: {
    id: 'root',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'flag', label: 'Flag', type: 'boolean', points: 10 }],
  },
}

const step = (page: Page, key: string) =>
  page.getByTestId('setup-checklist').locator(`[data-step=${key}]`)

test.describe('M11 event setup flow', () => {
  test('M11-T13 / T08 / T10 / T15: an empty event set up from the checklist to published', async ({
    page,
  }) => {
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    const eventName = unique('Setup Cup')
    await login(page, admin.email, admin.password)

    // M11-10 / M11-11: a draft with its first day, no status field.
    await page.goto('/events')
    await page.getByRole('button', { name: 'New event' }).click()
    let dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Status')).toHaveCount(0)
    await dialog.getByLabel('Name').fill(eventName)
    await dialog.getByLabel('Date').fill('2026-06-13')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name: eventName })).toBeVisible()
    await expect(page).toHaveURL(/tab=setup/)
    await expect(step(page, 'days')).toHaveAttribute('data-done', 'true')
    const eventId = new URL(page.url()).pathname.split('/')[2]!

    // M11-06: Categories and rulesets opens the Categories tab.
    await page.getByRole('link', { name: 'Open: Categories and rulesets' }).click()
    await expect(page).toHaveURL(/tab=categories/)
    await page.getByRole('button', { name: 'New category' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('RoboMission Junior')
    await dialog.getByLabel('Code').fill('RMJ')
    await dialog.getByRole('button', { name: 'Save' }).click()
    const row = page.locator('tr[data-category="RMJ"]')
    // M11-03: a new category says at once that it needs a ruleset.
    await expect(row.getByTestId('rules-link')).toContainText('No published ruleset')

    // M11-08 / M11-T10: Rules, then Back to the Categories tab.
    await row.getByTestId('rules-link').click()
    await expect(page.getByRole('heading', { name: /RoboMission Junior/ })).toBeVisible()
    await page.getByTestId('back-link').click()
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}\\?tab=categories`))

    const category = await getCategoryByCode(eventId, 'RMJ')
    await publishRuleset(category.id, RULESET)
    await page.reload()
    await expect(row.getByTestId('rules-link')).toHaveAttribute('data-rules', 'published')

    // M11-02 / M11-05: the round is added and timed on the Categories tab.
    await row.getByRole('button', { name: 'Add a round to RMJ' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Key').fill('R1')
    await dialog.getByLabel('Round name').fill('Final')
    await dialog.getByLabel('Competition day').selectOption({ index: 1 })
    await dialog.getByLabel('Start of the scoring run').fill('10:00')
    await dialog.getByRole('button', { name: 'Add round' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.locator('[data-round=R1]')).toContainText('10:00')

    // The checklist: categories and rounds done; the round is timed; the planner and back.
    await section(page, 'Setup').click()
    await expect(step(page, 'categories')).toHaveAttribute('data-done', 'true')
    await expect(step(page, 'rounds')).toHaveAttribute('data-done', 'true')
    await expect(step(page, 'schedule').locator('[data-line=timed]')).toContainText(
      '1 of 1 rounds timed',
    )
    await step(page, 'schedule').getByTestId('schedule-timed-link').click()
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}/planner`))
    // M11-15: the planner is in the event frame; Setup is one click away in its navigation.
    await expect(section(page, 'Planner')).toHaveAttribute('aria-current', 'page')
    await section(page, 'Setup').click()
    await expect(page).toHaveURL(/tab=setup/)
    await step(page, 'schedule').getByTestId('schedule-placed-link').click()
    await expect(page).toHaveURL(/tab=assignments/)
    await expect(section(page, 'Assignments')).toHaveAttribute('aria-current', 'page')

    // M11-13 / M11-T15: publishing an incomplete setup asks first.
    await page.getByTestId('header-publish').click()
    dialog = page.getByTestId('publish-dialog')
    await expect(dialog.getByTestId('publish-open-steps')).toContainText('Teams')
    await expect(dialog.getByTestId('publish-open-steps')).not.toContainText('Rounds')
    await dialog.getByRole('button', { name: 'Publish anyway' }).click()
    await expect(page.getByTestId('header-publish')).toHaveCount(0)
    await section(page, 'Setup').click()
    await expect(step(page, 'publish')).toHaveAttribute('data-done', 'true')
  })

  test('M11-T11: an event from a template leaves teams, judges and placement', async ({ page }) => {
    const admin = await createUser({ name: 'Ada Admin', roles: [{ role: 'admin' }] })
    const { event: source } = await createEvent({
      status: 'draft',
      name: unique('Template source'),
    })
    const day = await createDay(source.id, '2026-05-09', 'Saturday')
    const extra = await createCategory(source.id, 'RME', 'RoboMission Elementary')
    for (const c of [await getCategoryByCode(source.id, 'RM-J'), extra]) {
      await publishRuleset(c.id, RULESET)
      const round = await createRound(c.id, 'R1')
      await updateRound(round.id, { day: day.id })
      const phases = await getRoundPhases(round.id)
      await placePhase(phases.scoring!.id, day.id, '10:00')
    }
    const rmj = await getCategoryByCode(source.id, 'RM-J')
    await createCategoryTable(source.id, 'Table 1', rmj.id, 1)
    await createCategoryTable(source.id, 'Table 2', extra.id, 2)

    await login(page, admin.email, admin.password)
    await page.goto(`/events/${source.id}`)
    await moreAction(page, 'Save as template')
    const templateName = unique('M11 template')
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill(templateName)
    await dialog.getByRole('button', { name: 'Save to library' }).click()
    await expect(dialog).toBeHidden()

    await page.goto('/events')
    await page.getByRole('button', { name: 'New event' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('From a template').check()
    await dialog.getByLabel('Template', { exact: true }).selectOption({ label: templateName })
    const newName = unique('From template')
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByLabel('First day').fill('2027-05-15')
    await dialog.getByRole('button', { name: 'Create event' }).click()
    await expect(page.getByRole('heading', { name: newName })).toBeVisible()

    for (const done of ['days', 'categories', 'rounds']) {
      await expect(step(page, done)).toHaveAttribute('data-done', 'true')
    }
    for (const open of ['teams', 'judges', 'tables', 'schedule', 'publish']) {
      await expect(step(page, open)).toHaveAttribute('data-done', 'false')
    }
    // M11-09: the copied tables are named.
    await expect(step(page, 'tables')).toContainText('Table 1, Table 2 have no judge')
    await expect(step(page, 'schedule').locator('[data-line=timed]')).toContainText(
      '2 of 2 rounds timed',
    )
  })
})
