import { expect, test } from '@playwright/test'

test.describe('M0 smoke', () => {
  test('M0-T02: frontend loads and reaches the backend', async ({ page }) => {
    await page.goto('/status')
    await expect(page.getByRole('heading', { name: 'Judge26 status' })).toBeVisible()
    await expect(page.getByTestId('backend-status-badge')).toHaveText('online')
    await expect(page.getByTestId('backend-status')).toContainText('test')
  })

  test('unknown routes render the not-found page', async ({ page }) => {
    await page.goto('/this/route/does/not/exist')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})
