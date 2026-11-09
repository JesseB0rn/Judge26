import { expect, test } from '@playwright/test'
import { createEvent, createUser } from '../support/backend'
import { login } from '../support/pages'

test.describe('M1 permissions in the UI', () => {
  test('M1-T04: non-admins cannot open admin pages', async ({ page }) => {
    const { event } = await createEvent()
    const judge = await createUser({ roles: [{ role: 'judge', event: event.id }] })
    await login(page, judge.email, judge.password)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).not.toContainText('Users')
  })

  test('M1-T05: a judge cannot open another event', async ({ page }) => {
    const { event: own } = await createEvent({ status: 'draft' })
    const { event: other } = await createEvent({ status: 'draft' })
    const judge = await createUser({ roles: [{ role: 'judge', event: own.id }] })
    await login(page, judge.email, judge.password)

    await page.goto(`/events/${own.id}`)
    await expect(page.getByRole('heading', { name: own.name })).toBeVisible()
    await page.goto(`/events/${other.id}`)
    await expect(page.getByRole('alert')).toContainText(/not found|wasn't found/i)
    await page.goto('/events')
    await expect(page.getByTestId('event-list')).not.toContainText(other.name)
  })

  test('anonymous users are sent to the login page', async ({ page }) => {
    await page.goto('/teams')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)teams/)
  })
})
