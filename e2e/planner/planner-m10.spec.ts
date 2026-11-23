import { expect, test, type Locator, type Page } from '@playwright/test'
import PocketBase from 'pocketbase'
import {
  API_URL,
  createBlock,
  createCategory,
  createDay,
  createEvent,
  createUser,
} from '../support/backend'
import { login, section } from '../support/pages'

// M10-D: planner editing from the trial run (M10-T33 – M10-T38). The grid's time axis starts at
// 08:00, shows 1.6 px per minute and has 168 px wide columns.
const PX_PER_MINUTE = 1.6
const AXIS_START = 8 * 60
const COL = 168

const body = (page: Page, dayId: string) =>
  page.locator(`section[data-day="${dayId}"] .planner-body`)
const block = (page: Page, title: string) =>
  page.locator('[data-item^="block:"]', { hasText: title }).first()

async function at(page: Page, dayId: string, column: number, time: string) {
  const box = (await body(page, dayId).boundingBox())!
  const [h, m] = time.split(':').map(Number)
  return {
    x: box.x + COL * column + 60,
    y: box.y + (h! * 60 + m! - AXIS_START) * PX_PER_MINUTE,
  }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 2, from.y + 8, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

async function top(locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + 6 }
}

async function setup() {
  const { event, category } = await createEvent()
  const kilo = await createCategory(event.id, 'RM-K', 'RoboMission Kilo')
  const lima = await createCategory(event.id, 'RM-L', 'RoboMission Lima')
  const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
  const day = await createDay(event.id, '2026-06-01', 'Day 1')
  return { event, categories: [category, kilo, lima], manager, day }
}

async function openPlanner(page: Page, eventId: string) {
  await page.goto(`/events/${eventId}/planner`)
  await expect(section(page, 'Planner')).toHaveAttribute('aria-current', 'page')
}

test.describe('M10-D schedule planner', () => {
  test('M10-T35/T34: double click opens the dialog; a drag across columns covers them all', async ({
    page,
  }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await openPlanner(page, ctx.event.id)
    const dialog = page.getByRole('dialog')

    // M10-T35: a single click does nothing.
    const point = await at(page, ctx.day.id, 0, '10:00')
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(300)
    await expect(dialog).toHaveCount(0)

    // A double click opens the new block dialog for that column and time.
    await page.mouse.dblclick(point.x, point.y)
    await expect(dialog.getByRole('heading', { name: 'New block' })).toBeVisible()
    await expect(dialog.getByLabel('Start')).toHaveValue('10:00')
    await expect(dialog.getByLabel('Duration (min)')).toHaveValue('30')
    await expect(dialog.getByLabel('RoboMission Junior')).toBeChecked()
    await expect(dialog.getByLabel('RoboMission Kilo')).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await page.evaluate("window.getSelection()?.toString() ?? ''")).toBe('')

    // M10-T34: dragging from the first to the third column: one block over all three.
    await drag(page, await at(page, ctx.day.id, 0, '09:00'), await at(page, ctx.day.id, 2, '10:00'))
    await expect(dialog.getByRole('heading', { name: 'New block' })).toBeVisible()
    for (const name of ['RoboMission Junior', 'RoboMission Kilo', 'RoboMission Lima']) {
      await expect(dialog.getByLabel(name)).toBeChecked()
    }
    await dialog.getByLabel('Title').fill('Opening')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    const opening = block(page, 'Opening')
    await expect(opening).toContainText('09:00–10:00')
    const box = (await opening.boundingBox())!
    expect(box.width).toBeGreaterThan(COL * 3 - 10)

    const pb = new PocketBase(API_URL)
    await pb.collection('users').authWithPassword(ctx.manager.email, ctx.manager.password)
    const stored = await pb
      .collection('schedule_blocks')
      .getFirstListItem(pb.filter('event = {:e} && title = "Opening"', { e: ctx.event.id }))
    expect([...stored.categories].sort()).toEqual(ctx.categories.map((c) => c.id).sort())
  })

  test('M10-T36/T37/T38: "move later" shifts the rest of the column in one write', async ({
    page,
  }) => {
    const ctx = await setup()
    const [junior, kilo] = ctx.categories
    const make = (
      title: string,
      starts_at: string,
      categories: ({ id: string } | undefined)[],
      duration = 30,
    ) =>
      createBlock(ctx.event.id, {
        day: ctx.day.id,
        starts_at,
        duration_minutes: duration,
        title,
        categories: categories.map((c) => c!.id),
      })
    await make('Early', '08:00', [junior])
    await make('Briefing', '09:00', [junior])
    await make('Practice', '10:00', [junior])
    await make('Joint', '11:00', [junior, kilo])
    await make('Kilo before', '09:30', [kilo])
    await make('Kilo after', '13:00', [kilo])

    await login(page, ctx.manager.email, ctx.manager.password)
    await openPlanner(page, ctx.event.id)
    await page.getByLabel('Move later items too').check()

    const batches: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/batch')) batches.push(r.url())
    })
    const start = await top(block(page, 'Briefing'))
    await drag(page, start, { x: start.x, y: start.y + 15 * PX_PER_MINUTE })

    // M10-T36: the rest of the Junior column moves by 15 minutes; earlier items stay.
    await expect(block(page, 'Briefing')).toContainText('09:15–09:45')
    await expect(block(page, 'Practice')).toContainText('10:15–10:45')
    await expect(block(page, 'Early')).toContainText('08:00–08:30')
    // M10-T37: the joint block spans Kilo: Kilo's later items move, its earlier ones stay.
    await expect(block(page, 'Joint')).toContainText('11:15–11:45')
    await expect(block(page, 'Kilo after')).toContainText('13:15–13:45')
    await expect(block(page, 'Kilo before')).toContainText('09:30–10:00')
    expect(batches).toHaveLength(1)

    // M10-T38: one undo step restores all of them.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(block(page, 'Briefing')).toContainText('09:00–09:30')
    await expect(block(page, 'Practice')).toContainText('10:00–10:30')
    await expect(block(page, 'Kilo after')).toContainText('13:00–13:30')

    // M10-T38: if one item would leave its day, nothing moves.
    await make('Late', '23:20', [junior])
    await page.reload()
    await page.getByLabel('Move later items too').check()
    const again = await top(block(page, 'Briefing'))
    await drag(page, again, { x: again.x, y: again.y + 15 * PX_PER_MINUTE })
    await expect(page.getByText('Nothing was moved: “Late” would leave its day.')).toBeVisible()
    await expect(block(page, 'Briefing')).toContainText('09:00–09:30')
    await expect(block(page, 'Late')).toContainText('23:20–23:50')
  })

  test('M10-T33: day times are edited from the planner; items outside are flagged', async ({
    page,
  }) => {
    const ctx = await setup()
    await createBlock(ctx.event.id, {
      day: ctx.day.id,
      starts_at: '08:15',
      duration_minutes: 30,
      title: 'Welcome',
    })
    await login(page, ctx.manager.email, ctx.manager.password)
    await openPlanner(page, ctx.event.id)

    await page.getByTestId('planner-day-times').click()
    const dialog = page.getByTestId('day-times-dialog')
    await expect(dialog.getByRole('heading', { name: 'Times of Day 1' })).toBeVisible()
    await dialog.getByLabel('Starts').fill('09:00')
    await dialog.getByLabel('Ends').fill('17:00')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByTestId('planner-day-times')).toHaveText('09:00–17:00')
    await expect(block(page, 'Welcome')).toContainText('08:15–08:45')
    await expect(page.getByTestId('planner-issues')).toContainText('Welcome')
  })
})
