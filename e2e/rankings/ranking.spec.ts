import { expect, test, type Page } from '@playwright/test'
import { createApprovedTeam, createEvent, createUser, unique } from '../support/backend'
import { login } from '../support/pages'

async function enterResult(
  page: Page,
  team: string,
  round: string,
  points: string,
  seconds: string,
) {
  await page.getByRole('button', { name: `Results of ${team} in ${round}` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Points').fill(points)
  await dialog.getByLabel('Time (seconds)').fill(seconds)
  await dialog.getByRole('button', { name: 'Save result' }).click()
  await expect(dialog).toBeHidden()
}

const rankingRows = (page: Page) => page.getByTestId('ranking').locator('[data-team]')

test.describe('M3 rounds and ranking', () => {
  test('manager sets up rounds, records results, ranks teams and publishes a snapshot', async ({
    page,
  }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const alpha = unique('Alpha')
    const bravo = unique('Bravo')
    await createApprovedTeam(event.id, category.id, alpha)
    await createApprovedTeam(event.id, category.id, bravo)

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}`)
    await page.getByRole('tab', { name: 'Categories' }).click()
    await page.getByRole('link', { name: 'Rounds and ranking for RM-J' }).click()
    await expect(page.getByText('Configure the ranking to see results.')).toBeVisible()

    // M3-01: rounds.
    await page.getByRole('tab', { name: 'Rounds' }).click()
    for (const [key, name] of [
      ['R1', 'Round 1'],
      ['R2', 'Round 2'],
    ]) {
      await page.getByLabel('Key').fill(key!)
      await page.getByLabel('Round name').fill(name!)
      await page.getByRole('button', { name: 'Add round' }).click()
      await expect(page.getByTestId('rounds')).toContainText(name!)
    }

    // Configuration: total of all rounds, tie-break by total time.
    await page.getByRole('tab', { name: 'Configuration' }).click()
    await page.getByRole('button', { name: 'Generate from rounds' }).click()
    await expect(page.getByTestId('config-valid')).toBeVisible()
    await page.getByRole('button', { name: 'Save configuration' }).click()
    await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled()

    // M3-03: results.
    await page.getByRole('tab', { name: 'Results' }).click()
    await enterResult(page, alpha, 'Round 1', '100', '120')
    await enterResult(page, alpha, 'Round 2', '50', '90')
    await enterResult(page, bravo, 'Round 1', '80', '100')
    await enterResult(page, bravo, 'Round 2', '70', '95.5')
    await expect(page.locator(`[data-team="${alpha}"] [data-round="R1"]`)).toContainText(
      '100 / 120.000 s',
    )

    // M3-13 / M3-14: equal totals (150), decided by total time (210 s vs 195.5 s).
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect(rankingRows(page).nth(0)).toHaveAttribute('data-team', bravo)
    await expect(rankingRows(page).nth(1)).toContainText('by Total time')
    await page.getByRole('button', { name: `Explain ${alpha}` }).click()
    await expect(page.getByTestId(`explain-${alpha}`)).toContainText('ADD(100, 50) = 150')

    // M3-17: snapshot.
    await page.getByLabel('Snapshot title').fill('After round 2')
    await page.getByRole('button', { name: 'Publish snapshot' }).click()
    await expect(page.getByTestId('snapshot-fingerprint')).toBeVisible()
    await expect(rankingRows(page).nth(0)).toHaveAttribute('data-team', bravo)

    // M3-T12 / M3-T13: a corrected result changes the live ranking, not the snapshot.
    await page.getByRole('tab', { name: 'Results' }).click()
    await page.getByRole('button', { name: `Results of ${alpha} in Round 2` }).click()
    await page.getByRole('dialog').getByLabel('Points').fill('60')
    await page.getByRole('dialog').getByRole('button', { name: 'Save result' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator(`[data-team="${alpha}"] [data-round="R2"]`)).toContainText(
      '60 / 90.000 s',
    )
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect(rankingRows(page).nth(0)).toHaveAttribute('data-team', alpha)

    await page.getByRole('tab', { name: 'Snapshots' }).click()
    await expect(rankingRows(page).nth(0)).toHaveAttribute('data-team', bravo)
  })

  test('judges can view the ranking but not change results', async ({ page }) => {
    const { event, category } = await createEvent()
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    await login(page, judge.email, judge.password)
    await page.goto(`/categories/${category.id}/ranking`)
    await expect(page.getByRole('heading', { name: /Rounds & ranking/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Rounds' }).click()
    await expect(page.getByRole('button', { name: 'Add round' })).toHaveCount(0)
  })
})
