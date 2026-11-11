import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createBlock,
  createColumn,
  createDay,
  createEvent,
  createRound,
  createUser,
  getRoundPhases,
  placePhase,
} from '../support/backend'
import { login, logout } from '../support/pages'

// M4-14: multi-day schedule planner. The grid's time axis starts at 08:00 (default day hours)
// and shows 1.6 px per minute.
const PX_PER_MINUTE = 1.6
const AXIS_START = 8 * 60

const body = (page: Page, dayId: string) =>
  page.locator(`section[data-day="${dayId}"] .planner-body`)
const item = (page: Page, key: string) => page.locator(`[data-item^="${key}"]`).first()

/** Viewport point of a time in a day's first column. */
async function point(page: Page, dayId: string, time: string) {
  const box = (await body(page, dayId).boundingBox())!
  const [h, m] = time.split(':').map(Number)
  return { x: box.x + 60, y: box.y + (h! * 60 + m! - AXIS_START) * PX_PER_MINUTE }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 2, from.y + 8, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

async function center(locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + Math.min(12, box.height / 2) }
}

test.describe('Schedule planner', () => {
  test('manager places, moves, resizes and creates blocks across days', async ({ page }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const day1 = await createDay(event.id, '2026-06-01', 'Day 1')
    const day2 = await createDay(event.id, '2026-06-02', 'Day 2')
    const round = await createRound(category.id, 'R1', 30, 60)
    const phases = await getRoundPhases(round.id)
    await placePhase(phases.maintenance!.id, day1.id, '09:00')

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}/planner`)
    await expect(page.getByRole('heading', { name: 'Schedule planner' })).toBeVisible()
    await expect(page.locator('section[data-day]')).toHaveCount(2)

    // Drag the unplaced scoring run from the tray into day 1 at 10:00 (M4-14-09).
    const tray = page.getByTestId('planner-tray')
    await expect(tray).toContainText('Scoring')
    await drag(
      page,
      await center(tray.locator(`[data-tray="${phases.scoring!.id}"]`)),
      await point(page, day1.id, '10:00'),
    )
    const scoring = item(page, `phase:${phases.scoring!.id}`)
    await expect(scoring).toContainText('10:00–11:00')
    await expect(page.getByTestId('planner-tray')).toBeHidden()

    // Move maintenance 30 minutes later; scoring stays (M4-14-11).
    const maintenance = item(page, `phase:${phases.maintenance!.id}`)
    const start = await center(maintenance)
    await drag(page, start, { x: start.x, y: start.y + 30 * PX_PER_MINUTE })
    await expect(maintenance).toContainText('09:30–10:00')
    await expect(scoring).toContainText('10:00–11:00')

    // Resize the scoring run at its lower edge by 15 minutes (M4-14-12).
    await scoring.scrollIntoViewIfNeeded()
    const box = (await scoring.boundingBox())!
    const edge = { x: box.x + box.width / 2, y: box.y + box.height - 3 }
    await drag(page, edge, { x: edge.x, y: edge.y + 15 * PX_PER_MINUTE })
    await expect(scoring).toContainText('10:00–11:15')
    expect((await getRoundPhases(round.id)).scoring!.duration_minutes).toBe(75)

    // Create a block by dragging on empty space on day 2 (M4-14-15).
    await drag(page, await point(page, day2.id, '11:00'), await point(page, day2.id, '12:00'))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'New block' })).toBeVisible()
    await expect(dialog.getByLabel('Start')).toHaveValue('11:00')
    await expect(dialog.getByLabel('Duration (min)')).toHaveValue('60')
    await dialog.getByLabel('Title').fill('Lunch')
    await dialog.getByLabel('Place').fill('Cafeteria')
    await dialog.getByLabel('Responsibility').fill('Catering team')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    const lunch = page.locator('[data-item^="block:"]', { hasText: 'Lunch' }).first()
    await expect(lunch).toContainText('11:00–12:00')
    await expect(lunch).toContainText('Cafeteria · Catering team')

    // Keyboard: move it 5 minutes later (M4-14-17).
    await lunch.focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-item^="block:"]', { hasText: 'Lunch' }).first()).toContainText(
      '11:05–12:05',
    )

    // Undo restores the previous time (M4-14-32).
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-item^="block:"]', { hasText: 'Lunch' }).first()).toContainText(
      '11:00–12:00',
    )

    // Deep link: opening a block puts it in the URL; a reload opens it again (M4-14-16).
    await page.locator('[data-item^="block:"]', { hasText: 'Lunch' }).first().click()
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Edit block' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/item=block%3A|item=block:/)
    await page.reload()
    await expect(page.getByRole('dialog').getByLabel('Title')).toHaveValue('Lunch')
  })

  test('coaches see a read-only schedule with public blocks only', async ({ page }) => {
    const { event, category } = await createEvent()
    const coach = await createUser()
    await createApprovedTeam(event.id, category.id, `Team ${Date.now()}`, coach.id)
    const day = await createDay(event.id, '2026-06-01', 'Day 1')
    const round = await createRound(category.id, 'R1', 30, 60)
    const phases = await getRoundPhases(round.id)
    await placePhase(phases.scoring!.id, day.id, '10:00')
    await createBlock(event.id, { day: day.id, starts_at: '12:00', title: 'Lunch' })
    await createBlock(event.id, {
      day: day.id,
      starts_at: '08:00',
      title: 'Judges briefing',
      public: false,
    })

    await login(page, coach.email, coach.password)
    await page.goto(`/events/${event.id}/planner`)
    await expect(page.getByRole('heading', { name: 'Schedule', exact: true })).toBeVisible()
    await expect(page.getByTestId('planner-grid')).toContainText('Lunch')
    await expect(page.getByTestId('planner-grid')).not.toContainText('Judges briefing')
    await expect(page.getByRole('button', { name: 'New block' })).toHaveCount(0)

    await item(page, `phase:${phases.scoring!.id}`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Scoring run')
    await expect(dialog).toContainText('10:00–11:00')
    await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)
  })

  test('custom columns sit next to the categories and hold custom blocks', async ({ page }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const coach = await createUser()
    await createApprovedTeam(event.id, category.id, `Team ${Date.now()}`, coach.id)
    const day = await createDay(event.id, '2026-06-01', 'Day 1')
    await createColumn(event.id, 'Judges', { public: false })
    await createBlock(event.id, {
      day: day.id,
      starts_at: '09:00',
      title: 'Coach meeting',
      categories: [category.id],
    })

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}/planner`)
    await page.getByRole('button', { name: 'Custom columns' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('New column name').fill('Visitors')
    await dialog.getByRole('button', { name: 'Add column' }).click()
    await expect(dialog.getByLabel('Name of Visitors')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()

    const headers = page.locator(`section[data-day="${day.id}"] [data-column]`)
    await expect(headers).toHaveText(['RoboMission Junior', 'Judges', 'Visitors'])

    // Create a block by dragging in the Visitors column (third column).
    const box = (await body(page, day.id).boundingBox())!
    const x = box.x + 168 * 2 + 60
    const at = (time: string) => {
      const [h, m] = time.split(':').map(Number)
      return box.y + (h! * 60 + m! - AXIS_START) * PX_PER_MINUTE
    }
    await drag(page, { x, y: at('10:00') }, { x, y: at('11:00') })
    const form = page.getByRole('dialog')
    await form.getByLabel('Title').fill('Open house')
    await expect(form.getByLabel('Visitors')).toBeChecked()
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form).toBeHidden()
    const openHouse = page.locator('[data-item^="block:"]', { hasText: 'Open house' }).first()
    await expect(openHouse).toBeVisible()
    expect((await openHouse.boundingBox())!.x).toBeGreaterThan(box.x + 168 * 2)

    // Drag the coach meeting from its category into the Visitors column.
    const meeting = page.locator('[data-item^="block:"]', { hasText: 'Coach meeting' }).first()
    const start = await center(meeting)
    await drag(page, start, { x: start.x + 168 * 2, y: start.y })
    await expect.poll(async () => (await meeting.boundingBox())!.x).toBeGreaterThan(box.x + 168 * 2)

    // A column with blocks cannot be deleted.
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Custom columns' }).click()
    await page.getByRole('button', { name: 'Delete Visitors' }).click()
    await expect(page.getByRole('dialog')).toContainText('Blocks are still placed in this column')

    // Coaches see public columns only.
    await page.keyboard.press('Escape')
    await logout(page)
    await login(page, coach.email, coach.password)
    await page.goto(`/events/${event.id}/planner`)
    await expect(page.locator(`section[data-day="${day.id}"] [data-column]`)).toHaveText([
      'RoboMission Junior',
      'Visitors',
    ])
    await expect(page.getByTestId('planner-grid')).toContainText('Open house')
  })
})
