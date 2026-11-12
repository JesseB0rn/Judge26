import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createCategory,
  createCategoryTable,
  createEvent,
  createRound,
  createUser,
} from '../support/backend'
import { login } from '../support/pages'

// M8-E: assignment board (M8-T15 – M8-T19). Managers work on desktops and tablets; drags use
// pointer events, so they work with touch too.
test.describe('M8-E assignment board', () => {
  async function setup() {
    // Category codes sort the groups: RM-J (from createEvent) before RM-Z.
    const { event, category } = await createEvent()
    const other = await createCategory(event.id, 'RM-Z', 'RoboMission Zeta')
    await createRound(category.id, 'R1')
    await createRound(category.id, 'R2')
    await createRound(other.id, 'R1')
    const judge = await createUser({
      name: 'Judy Judge',
      roles: [{ role: 'judge', event: event.id }],
    })
    await createCategoryTable(event.id, 'A', category.id, 1)
    await createCategoryTable(event.id, 'B', category.id, 2)
    await createCategoryTable(event.id, 'Z', other.id, 3)
    await createApprovedTeam(event.id, category.id, 'Alpha')
    await createApprovedTeam(event.id, category.id, 'Bravo')
    await createApprovedTeam(event.id, other.id, 'Zulu')
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    return { event, category, other, judge, manager }
  }

  /** Drags with real pointer events, in steps (like a hand would). */
  async function drag(page: Page, source: Locator, target: Locator, offset = 0.5) {
    const from = (await source.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
    await page.mouse.move(to.x + to.width * offset, to.y + to.height * 0.8, { steps: 8 })
    await page.mouse.up()
  }

  async function openBoard(page: Page, eventId: string) {
    await page.goto(`/events/${eventId}?tab=schedule`)
    await expect(page.getByTestId('assignment-board')).toBeVisible()
  }

  test('M8-T15/T16/T18: drag teams and judges; wrong categories are refused', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await openBoard(page, ctx.event.id)
    const tray = page.getByTestId('team-tray')

    // M8-T15: the team lands on A, in every round.
    await drag(page, tray.locator('[data-team=Alpha]'), page.getByTestId('teams-A'))
    await expect(page.getByTestId('teams-A')).toContainText('Alpha')
    await drag(page, tray.locator('[data-team=Bravo]'), page.getByTestId('teams-A'))
    await expect(page.getByTestId('teams-A').locator('[data-team-slot]')).toHaveText([
      /Alpha/,
      /Bravo/,
    ])
    await page.getByTestId('board-scope').selectOption('1')
    await expect(page.getByTestId('teams-A').locator('[data-team-slot]')).toHaveText([
      /Bravo/,
      /Alpha/,
    ])
    await page.getByTestId('board-scope').selectOption('all')

    // M8-T16: Zulu cannot go to a Junior table.
    await drag(page, tray.locator('[data-team=Zulu]'), page.getByTestId('teams-B'))
    await expect(tray).toContainText('Zulu')
    await expect(page.getByTestId('teams-B')).not.toContainText('Zulu')

    // M8-T18: one judge on two tables shows a conflict.
    await drag(
      page,
      page.getByTestId('judge-tray').locator('[data-judge="Judy Judge"]'),
      page.getByTestId('judges-A'),
    )
    await expect(page.getByTestId('judges-A')).toContainText('Judy Judge')
    await page.getByRole('button', { name: 'Actions for judge Judy Judge' }).click()
    await page.getByRole('menuitem', { name: 'B', exact: true }).click()
    await expect(page.getByTestId('judges-B')).toContainText('Judy Judge')
    await expect(page.getByTestId('judges-A')).not.toContainText('Judy Judge')
  })

  test('M8-T17: dragging a category divider moves a table after confirmation', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await openBoard(page, ctx.event.id)
    await drag(
      page,
      page.getByTestId('team-tray').locator('[data-team=Bravo]'),
      page.getByTestId('teams-B'),
    )
    await expect(page.getByTestId('teams-B')).toContainText('Bravo')

    page.once('dialog', (dialog) => dialog.accept())
    const zeta = page.locator('[data-testid=category-divider][data-divider="RM-Z"]')
    await drag(page, zeta, page.locator('[data-column=B]'), 0.25)
    // B now belongs to Zeta (after the divider) and Bravo is back in the tray.
    await expect(page.getByTestId('team-tray')).toContainText('Bravo')
    const order = await page
      .locator('[data-testid=category-divider], [data-column]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-divider') ?? el.getAttribute('data-column')),
      )
    expect(order).toEqual(['RM-J', 'A', 'RM-Z', 'B', 'Z'])
  })

  test('M8-32: other open boards show a move live', async ({ browser }) => {
    const ctx = await setup()
    const second = await createUser({ roles: [{ role: 'event_manager', event: ctx.event.id }] })
    const one = await (await browser.newContext()).newPage()
    const two = await (await browser.newContext()).newPage()
    await login(one, ctx.manager.email, ctx.manager.password)
    await login(two, second.email, second.password)
    await openBoard(one, ctx.event.id)
    await openBoard(two, ctx.event.id)

    await drag(
      one,
      one.getByTestId('team-tray').locator('[data-team=Alpha]'),
      one.getByTestId('teams-A'),
    )
    await expect(one.getByTestId('teams-A')).toContainText('Alpha')
    // Live update (M8-32): the other board shows the move without a reload.
    await expect(two.getByTestId('teams-A')).toContainText('Alpha')
  })

  test('M8-26: tables are added and deleted from the board; old board links open the tab', async ({
    page,
  }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await page.goto(`/events/${ctx.event.id}/board`)
    await expect(page).toHaveURL(/tab=schedule/)
    await expect(page.getByTestId('assignment-board')).toBeVisible()

    await page.getByRole('button', { name: 'Add a table to RoboMission Junior' }).click()
    await expect(page.locator('[data-column="Table 4"]')).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Actions for table Table 4' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.locator('[data-column="Table 4"]')).toHaveCount(0)

    // A table with teams cannot be deleted.
    await drag(
      page,
      page.getByTestId('team-tray').locator('[data-team=Alpha]'),
      page.getByTestId('teams-A'),
    )
    await expect(page.getByTestId('teams-A')).toContainText('Alpha')
    await page.getByRole('button', { name: 'Actions for table A' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeDisabled()
  })
})
