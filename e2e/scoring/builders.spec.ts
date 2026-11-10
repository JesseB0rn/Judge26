import { expect, test, type Locator, type Page } from '@playwright/test'
import { createEvent, createUser } from '../support/backend'
import { login } from '../support/pages'

// See rulesets.spec.ts: saves reload slow lists in the shared test database.
const afterSave = expect.configure({ timeout: 15_000 })

const block = (page: Page, id: string) => page.locator(`[data-block="${id}"]`)
const status = (page: Page) => page.getByTestId('builder-status')

/** Drags a wire with the mouse from a block's output terminal to a terminal. */
async function wire(page: Page, from: string, to: Locator) {
  const start = await page.locator(`[data-output="${from}"]`).boundingBox()
  const end = await to.boundingBox()
  if (!start || !end) throw new Error('terminal not visible')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 })
  await page.mouse.up()
}
const port = (page: Page, node: string, id: string) =>
  page.locator(`[data-node="${node}"][data-port="${id}"]`)

/** Commits an inspector field (fields commit on change). */
async function setField(page: Page, label: string, value: string) {
  const field = page.getByTestId('inspector').getByLabel(label, { exact: true })
  await field.fill(value)
  await field.press('Enter')
}

test.describe('Visual builders', () => {
  test('M2-15: a manager builds a conditional criterion by wiring blocks', async ({ page }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await page.goto(`/categories/${category.id}/scoring`)
    await page.getByRole('button', { name: 'Create first draft' }).click()
    await afterSave(page.getByTestId('ruleset-status')).toHaveText('Draft')
    await expect(status(page)).toHaveText(/Valid/)

    // Palette: a yes/no task goes into the selected group (Missions, 0).
    await block(page, '0').click()
    await page.getByRole('button', { name: 'Add Yes / no' }).click()
    await expect(page.getByTestId('inspector')).toContainText('Criterion')
    await setField(page, 'Label', 'Ramp crossed')
    await setField(page, 'Id', 'ramp')
    await setField(page, 'Points if yes', '7')
    await expect(block(page, '0.5')).toHaveAttribute('aria-label', /Ramp crossed/)

    // Wire the flag (0.0) into the ramp's enable terminal: it only counts with the flag raised.
    await page.getByRole('button', { name: 'Fit diagram' }).click()
    await wire(page, '0.0', port(page, '0.5', 'enable'))
    await expect(page.getByTestId('condition')).toContainText('Flag raised')
    await expect(status(page)).toHaveText(/Valid/)

    await page.getByRole('button', { name: 'Save draft' }).click()
    await page.getByRole('tab', { name: 'Preview' }).click()
    const ramp = page.locator('[data-node="ramp"]')
    await expect(ramp.getByRole('button', { name: /^Yes/ })).toBeDisabled()
    await page.locator('[data-node="flag"]').getByRole('button', { name: /^Yes/ }).click()
    await ramp.getByRole('button', { name: /^Yes/ }).click()
    await expect(page.getByTestId('score-sheet').getByTestId('score-total')).toHaveText('17')

    // M2-T15: a circular condition blocks publishing.
    await page.getByRole('tab', { name: 'Definition' }).click()
    await page.getByRole('button', { name: 'Fit diagram' }).click()
    await wire(page, '0.5', port(page, '0.0', 'enable'))
    await expect(status(page)).toHaveText(/1 error/)
    await expect(page.locator('[data-block][aria-label*="Circular"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(status(page)).toHaveText(/Valid/)
    await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })

  test('M3-18: a manager wires a sum-of-best tie-breaker into the ranking', async ({ page }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    await login(page, manager.email, manager.password)
    await page.goto(`/categories/${category.id}/ranking?tab=configuration`)
    await page.getByRole('button', { name: 'Load example' }).click()
    await expect(status(page)).toHaveText(/Valid/)

    await page.getByRole('button', { name: 'Add Sum of best N' }).click()
    await expect(status(page)).toHaveText(/error/) // no inputs yet
    await page.getByRole('button', { name: 'Fit diagram' }).click()
    await wire(page, 'round:0', port(page, 'calc:2', 'in0'))
    await wire(page, 'round:1', port(page, 'calc:2', 'in1'))
    await wire(page, 'round:2', port(page, 'calc:2', 'in2'))
    await setField(page, 'N (results)', '2')
    await setField(page, 'Label', 'Best two')
    await expect(status(page)).toHaveText(/Valid/)
    await wire(page, 'calc:2', port(page, 'ranking', 'in3'))
    await expect(block(page, 'ranking')).toHaveAttribute('aria-label', /Ranking/)
    await expect(port(page, 'ranking', 'in4')).toBeAttached() // new spare terminal

    // M3-T17: a circular reference is shown and saving is blocked.
    await wire(page, 'calc:0', port(page, 'calc:1', 'in3'))
    await wire(page, 'calc:1', port(page, 'calc:0', 'in3'))
    await expect(status(page)).toHaveText(/error/)
    await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(status(page)).toHaveText(/Valid/)

    await page.getByRole('button', { name: 'Save configuration' }).click()
    await afterSave(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled()
    await page.reload()
    await page.getByRole('radio', { name: 'JSON' }).click()
    const json = await page.getByLabel('Ranking configuration (JSON)').inputValue()
    expect(JSON.parse(json).ranking.keys[3]).toEqual({
      source: { calc: 'bestN1' },
      field: 'points',
      order: 'desc',
    })
  })
})
