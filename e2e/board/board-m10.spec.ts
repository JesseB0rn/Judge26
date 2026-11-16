import { expect, test, type Locator, type Page } from '@playwright/test'
import PocketBase from 'pocketbase'
import {
  API_URL,
  createApprovedTeam,
  createCategory,
  createCategoryTable,
  createEvent,
  createRound,
  createUser,
} from '../support/backend'
import { login } from '../support/pages'

// M10-E: board fixes from the trial run (M10-T39 – M10-T44).
test.describe('M10-E assignment board', () => {
  async function drag(page: Page, source: Locator, target: Locator) {
    const from = (await source.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.8, { steps: 8 })
    await page.mouse.up()
  }

  async function openBoard(page: Page, eventId: string) {
    await page.goto(`/events/${eventId}?tab=schedule`)
    await expect(page.getByTestId('assignment-board')).toBeVisible()
  }

  test('M10-T42/T43/T44: shift-select teams and place them together; no text stays selected', async ({
    page,
  }) => {
    const { event, category } = await createEvent()
    const other = await createCategory(event.id, 'RM-Z', 'RoboMission Zeta')
    await createRound(category.id, 'R1')
    await createRound(other.id, 'R1')
    await createCategoryTable(event.id, 'A', category.id, 1)
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
      await createApprovedTeam(event.id, category.id, name)
    }
    await createApprovedTeam(event.id, other.id, 'Zulu')
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await openBoard(page, event.id)
    const tray = page.getByTestId('team-tray')

    // M10-T43: a selection with Zulu (other category) is refused as a whole.
    await tray.locator('[data-team=Delta]').click()
    await tray.locator('[data-team=Zulu]').click({ modifiers: ['ControlOrMeta'] })
    await drag(page, tray.locator('[data-team=Delta]'), page.getByTestId('teams-A'))
    await expect(page.getByTestId('teams-A').locator('[data-team-slot]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(tray.locator('[data-selected]')).toHaveCount(0)

    // M10-T42: Alpha … Charlie with Shift, dragged by the middle card: one write, tray order.
    await tray.locator('[data-team=Alpha]').click()
    await tray.locator('[data-team=Charlie]').click({ modifiers: ['Shift'] })
    await expect(page.getByTestId('tray-selection')).toContainText('3 selected')
    const writes: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/board/teams')) writes.push(r.url())
    })
    await drag(page, tray.locator('[data-team=Bravo]'), page.getByTestId('teams-A'))
    await expect(page.getByTestId('teams-A').locator('[data-team-slot]')).toHaveText([
      /Alpha/,
      /Bravo/,
      /Charlie/,
    ])
    expect(writes).toHaveLength(1)
    await expect(tray).not.toContainText('Bravo')

    // M10-T44: nothing is selected after the drop (Shift+click and the drag used to select text).
    expect(await page.evaluate("window.getSelection()?.toString() ?? ''")).toBe('')
  })

  test('M10-T40: assigning and live updates keep the board’s scroll position', async ({ page }) => {
    const { event, category } = await createEvent()
    await createRound(category.id, 'R1')
    for (let i = 1; i <= 10; i++) await createCategoryTable(event.id, `T${i}`, category.id, i)
    await createApprovedTeam(event.id, category.id, 'Alpha')
    await createApprovedTeam(event.id, category.id, 'Bravo')
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await page.setViewportSize({ width: 1280, height: 900 })
    await login(page, manager.email, manager.password)
    await openBoard(page, event.id)

    // Ten tables are wider than the board: the group scrolls sideways by itself.
    const group = page.locator(`[data-group="${category.id}"]`)
    await group.evaluate((el) => (el.scrollLeft = el.scrollWidth))
    const left = await group.evaluate((el) => el.scrollLeft)
    expect(left).toBeGreaterThan(0)

    await drag(
      page,
      page.getByTestId('team-tray').locator('[data-team=Alpha]'),
      page.getByTestId('teams-T10'),
    )
    await expect(page.getByTestId('teams-T10')).toContainText('Alpha')
    expect(await group.evaluate((el) => el.scrollLeft)).toBe(left)

    // Another manager places Bravo; the live update keeps the position, too.
    const second = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const pb = new PocketBase(API_URL)
    await pb.collection('users').authWithPassword(second.email, second.password)
    type Board = {
      tables: { id: string; name: string }[]
      teams: { id: string; name: string }[]
      games: { id: string; table: string; updated: string }[]
    }
    const board = await pb.send<Board>(`/api/events/${event.id}/board`, {})
    const t10 = board.tables.find((t) => t.name === 'T10')!
    await pb.send(`/api/events/${event.id}/board/teams`, {
      method: 'POST',
      body: {
        team: board.teams.find((t) => t.name === 'Bravo')!.id,
        table: t10.id,
        index: 1,
        expected: Object.fromEntries(
          board.games.filter((g) => g.table === t10.id).map((g) => [g.id, g.updated]),
        ),
      },
    })
    await expect(page.getByTestId('teams-T10')).toContainText('Bravo')
    expect(await group.evaluate((el) => el.scrollLeft)).toBe(left)
  })

  test('M10-T41: category groups wrap instead of scrolling the page', async ({ page }) => {
    const { event, category } = await createEvent()
    const b = await createCategory(event.id, 'RM-K', 'RoboMission Kilo')
    const c = await createCategory(event.id, 'RM-L', 'RoboMission Lima')
    let position = 1
    for (const cat of [category, b, c]) {
      await createRound(cat.id, 'R1')
      for (const n of [1, 2]) {
        await createCategoryTable(event.id, `${cat.code}-${n}`, cat.id, position++)
      }
    }
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await page.setViewportSize({ width: 1024, height: 900 })
    await login(page, manager.email, manager.password)
    await openBoard(page, event.id)

    const groups = page.getByTestId('category-group')
    await expect(groups).toHaveCount(3)
    const tops = await groups.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))
    expect(tops[2]!).toBeGreaterThan(tops[0]!)
    expect(
      await page.evaluate(
        'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
      ),
    ).toBe(true)
  })

  test('M10-T39: tables are labelled by the chosen scheme and can be relabelled', async ({
    page,
  }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await openBoard(page, event.id)

    await page.getByTestId('board-labels').selectOption('letter')
    const add = page.getByRole('button', { name: `Add a table to ${category.name}` })
    for (let i = 0; i < 3; i++) {
      await add.click()
      await expect(page.locator('[data-column]')).toHaveCount(i + 1)
    }
    await expect(page.locator('[data-column]')).toHaveText([/^A/, /^B/, /^C/])

    await page.getByTestId('board-labels').selectOption('table_number')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByTestId('board-relabel').click()
    await expect(page.locator('[data-column="Table 1"]')).toBeVisible()
    await expect(page.locator('[data-column="Table 3"]')).toBeVisible()
  })
})
