import { expect, type Page } from '@playwright/test'

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}
