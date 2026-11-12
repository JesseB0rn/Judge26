import { expect, test } from '@playwright/test'
import {
  createApprovedTeam,
  createEvent,
  createPlacedGame,
  createRound,
  createTable,
  createUser,
  mailsTo,
  processOutbox,
  unique,
} from '../support/backend'
import { login } from '../support/pages'

// M7-04: schedule emails to team contacts (desktop; managers do not work on tablets).
test.describe('M7 notifications', () => {
  test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1000, 'desktop only')

  test('M7-T03: a manager notifies the team contacts of a changed schedule', async ({ page }) => {
    const { event, category } = await createEvent()
    const manager = await createUser({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    const round = await createRound(category.id, 'R1')
    const table = await createTable(event.id, 'Table 1', judge.id)
    const contactEmail = `${unique('contact')}@test.local`
    const teamName = unique('Gear Heads')
    const team = await createApprovedTeam(event.id, category.id, teamName, contactEmail)
    await createPlacedGame(round.id, team.id, table.id, 1)

    await login(page, manager.email, manager.password)
    await page.goto(`/events/${event.id}?tab=messages`)
    const card = page.getByTestId('schedule-notify')
    await expect(card.getByTestId('affected-count')).toHaveText('1 affected')
    await expect(card.locator('[data-changed=true]')).toContainText('table Table 1, position 1')

    await card.getByLabel('Message (optional)').fill('Please arrive 30 minutes early.')
    await card.getByRole('button', { name: 'Notify affected teams' }).click()
    await expect(page.getByText('One email queued.')).toBeVisible()
    await expect(card.getByTestId('affected-count')).toHaveText('0 affected')

    await processOutbox()
    await expect
      .poll(async () => (await mailsTo(contactEmail)).map((m) => m.subject))
      .toContain(`Schedule for ${teamName} at ${event.name}`)
    const mail = (await mailsTo(contactEmail)).find((m) => m.subject.startsWith('Schedule'))!
    expect(mail.html).toContain('Please arrive 30 minutes early.')

    // The event's delivery log shows the message as sent; adding the team sent nothing (M8-A).
    await page.reload()
    const log = page.getByTestId('outbox')
    await expect(log.locator('[data-status=sent]')).toHaveCount(1)
  })
})
