import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  createApprovedTeam,
  createEvent,
  createRound,
  createScheduledGame,
  createUser,
  recordResult,
  setRanking,
  unique,
} from '../support/backend'
import { login } from '../support/pages'

// M7-05 – M7-07: exports of the ranking (desktop; exports are an office task).
test.describe('M7 exports', () => {
  test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1000, 'desktop only')

  async function setup() {
    const { event, category } = await createEvent({ name: unique('Swiss Final') })
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const round = await createRound(category.id, 'R1')
    await setRanking(category.id, {
      schemaVersion: 1,
      precision: 0,
      rounds: [{ key: 'R1', label: 'Round 1' }],
      ranking: {
        keys: [
          { source: { round: 'R1' }, field: 'points', order: 'desc', label: 'Points' },
          { source: { round: 'R1' }, field: 'time', order: 'asc', label: 'Time' },
        ],
      },
    })
    const alpha = unique('Alpha')
    const bravo = unique('Bravo')
    for (const [name, points, time] of [
      [alpha, 120, 61_500],
      [bravo, 120, 58_250],
    ] as const) {
      const team = await createApprovedTeam(event.id, category.id, name)
      await recordResult((await createScheduledGame(round.id, team.id)).id, points, time)
    }
    return { event, category, manager, alpha, bravo }
  }

  test('M7-T04 / M7-T05: the ranking downloads as CSV and Excel', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await page.goto(`/categories/${ctx.category.id}/ranking`)
    await expect(page.getByTestId('ranking').locator('[data-team]')).toHaveCount(2)

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    expect(csv.suggestedFilename()).toMatch(/^ranking-robomission-junior-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = (await readFile((await csv.path())!, 'utf8')).replace(/^﻿/, '')
    expect(text.trimEnd().split('\r\n')).toEqual([
      'Rank,Shared,Team,Organization,Country,Points,Time (s),Round 1 points,Round 1 time (s),Round 1 status,Provisional,Decided by',
      `1,,${ctx.bravo},,,120,58.250,120,58.250,,,`,
      `2,,${ctx.alpha},,,120,61.500,120,61.500,,,Time`,
    ])

    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Excel' }).click(),
    ])
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)
    const bytes = await readFile((await xlsx.path())!)
    expect(bytes.subarray(0, 2).toString()).toBe('PK') // a zip package
    expect(bytes.length).toBeGreaterThan(1000)
  })

  test('M7-T06: the printable ranking report is generated as PDF', async ({ page }) => {
    const ctx = await setup()
    await login(page, ctx.manager.email, ctx.manager.password)
    await page.goto(`/categories/${ctx.category.id}/ranking`)
    await page.getByRole('link', { name: 'PDF' }).click()

    const report = page.getByTestId('ranking-report')
    await expect(report.getByTestId('report-category')).toHaveText('RoboMission Junior (RM-J)')
    await expect(report.getByTestId('report-event')).toContainText(ctx.event.name)
    const rows = report.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(ctx.bravo)
    await expect(rows.nth(0)).toContainText('58.250 s')
    await expect(rows.nth(1)).toContainText(ctx.alpha)

    // Printed: only the report, no navigation or buttons.
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('button', { name: 'Print / save as PDF' })).toBeHidden()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    const pdf = await page.pdf({ format: 'A4' })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
