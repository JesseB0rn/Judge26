import { expect, test, type Page } from '@playwright/test'
import {
  createApprovedTeam,
  createDay,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  publishRuleset,
  recordScoredResult,
  setPublication,
  setRanking,
  unique,
  updateRound,
} from '../support/backend'
import { login } from '../support/pages'

// M10-C: time for zero-point runs and run time precision (M10-T27, M10-T30).
const RULESET = {
  schemaVersion: 1,
  zeroPointsTimeMs: 120_000,
  root: {
    id: 'root',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'flag', label: 'Flag raised', type: 'boolean', points: 10 }],
  },
}

test.describe('M10-C run times', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'desktop only')

  async function setup() {
    const { event, category } = await createEvent({ time_decimals: 1 })
    const day = await createDay(event.id, '2026-06-13', 'Saturday')
    const round = await createRound(category.id, 'R1')
    await updateRound(round.id, { day: day.id })
    await setRanking(category.id, {
      schemaVersion: 1,
      precision: 0,
      rounds: [{ key: 'R1' }],
      ranking: {
        keys: [
          { source: { round: 'R1' }, field: 'points', order: 'desc', label: 'Points' },
          { source: { round: 'R1' }, field: 'time', order: 'asc', label: 'Time' },
        ],
      },
    })
    const ruleset = await publishRuleset(category.id, RULESET)
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    const table = await createTable(event.id, 'Table A', judge.id)
    const names = { alpha: unique('Alpha'), bravo: unique('Bravo'), charlie: unique('Charlie') }
    const games: Record<string, { id: string }> = {}
    let sequence = 1
    for (const [key, name] of Object.entries(names)) {
      const team = await createApprovedTeam(event.id, category.id, name)
      games[key] = await createPlacedGame(round.id, team.id, table.id, sequence++)
    }
    return { event, category, ruleset, judge, names, games }
  }

  const row = (page: Page, team: string) =>
    page.locator(`[data-testid=ranking] [data-team="${team}"]`)

  test('M10-T30/T27: the live ranking and TV show times in tenths; zero points count as 2:00', async ({
    page,
  }) => {
    const ctx = await setup()
    await recordScoredResult(ctx.games.alpha!.id, ctx.ruleset.id, { flag: true }, 95_379)
    await recordScoredResult(ctx.games.bravo!.id, ctx.ruleset.id, { flag: false }, 43_000)
    await setPublication(ctx.category.id, { public_live: true })

    const viewer = await createUser()
    await login(page, viewer.email, viewer.password)
    await page.goto(`/live/${ctx.event.id}`)
    await expect(row(page, ctx.names.alpha)).toContainText('1:35.3')
    await expect(row(page, ctx.names.alpha)).not.toContainText('1:35.37')
    await expect(row(page, ctx.names.bravo)).toContainText('2:00.0')

    await page.goto(`/live/${ctx.event.id}/tv?view=ranking`)
    const tv = page.getByTestId('tv-ranking-row')
    await expect(tv.filter({ hasText: ctx.names.alpha })).toContainText('1:35.3')
    await expect(tv.filter({ hasText: ctx.names.bravo })).toContainText('2:00.0')
  })

  test('M10-T27: the judge sees that a zero-point run counts as 2:00', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.judge.email, ctx.judge.password)
    await page.goto(`/judging/games/${ctx.games.charlie!.id}`)
    await expect(page.getByTestId('team-name')).toHaveText(ctx.names.charlie)
    await page.getByRole('button', { name: 'Edit time' }).click()
    await page.locator('#manual-time').fill('0:43.27')
    await page.getByRole('button', { name: 'Set time' }).click()
    // Tenths, cut not rounded.
    await expect(page.getByTestId('stopwatch-display')).toHaveText('0:43.2')
    await page.locator('[data-node="flag"]').getByRole('button', { name: /^No/ }).click()
    await expect(page.getByTestId('zero-points-time')).toContainText('counts as 2:00.0')
    await page.locator('[data-node="flag"]').getByRole('button', { name: /^Yes/ }).click()
    await expect(page.getByTestId('zero-points-time')).toHaveCount(0)
  })
})
