import { expect, test } from '@playwright/test'
import { linkFromMail, PASSWORD, unique } from '../support/backend'
import { login, logout } from '../support/pages'

test.describe('M1 account lifecycle', () => {
  test('M1-01/02/03: register, verify email, sign out and sign in', async ({ page }) => {
    const email = `${unique('coach')}@test.local`

    await page.goto('/register')
    await page.getByLabel('Full name').fill('Grace Coach')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    // Unverified users cannot reach protected pages.
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
    await page.goto('/events')
    await expect(page).toHaveURL(/\/auth\/verify-email/)

    // Open the link from the verification email.
    const link = await linkFromMail(email, '/auth/verify-email')
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByTestId('verification-success')).toBeVisible()
    await page.getByRole('link', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Grace Coach' })).toBeVisible()

    await logout(page)
    await login(page, email, PASSWORD)
    await expect(page.getByTestId('current-user')).toHaveText('Grace Coach')
  })

  test('M1-T02: duplicate registration is rejected', async ({ page }) => {
    const email = `${unique('dup')}@test.local`
    for (const attempt of [1, 2]) {
      await page.goto('/register')
      await page.getByLabel('Full name').fill('Dup')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(PASSWORD)
      await page.getByRole('button', { name: 'Create account' }).click()
      if (attempt === 1) {
        await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
        await page.getByRole('button', { name: 'Sign out' }).click()
      }
    }
    await expect(page.getByText(/must be unique|already/i)).toBeVisible()
  })

  test('M1-T03: invalid password is denied', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@test.local')
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Failed to authenticate')
    await expect(page).toHaveURL(/\/login/)
  })

  test('M1-04: reset the password through the emailed link', async ({ page }) => {
    const email = `${unique('reset')}@test.local`
    await page.goto('/register')
    await page.getByLabel('Full name').fill('Reset Me')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()

    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByTestId('reset-sent')).toBeVisible()

    const link = await linkFromMail(email, '/auth/reset-password')
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await page.getByLabel('New password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByTestId('reset-done')).toBeVisible()

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    // The new password works. Completing a reset also proves ownership of the
    // email address, so PocketBase marks the account as verified.
    await expect(page.getByRole('heading', { name: 'Welcome, Reset Me' })).toBeVisible()
  })
})
