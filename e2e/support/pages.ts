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

/** A place in the event navigation (M11-17): a tab of the event page, the planner or print. */
export function section(page: Page, name: string) {
  return page.getByTestId('event-nav').getByRole('link', { name, exact: true })
}

/** An event action from the header's More menu (M11-16): Save as template, Archive, Restore. */
export async function moreAction(page: Page, name: string) {
  await page.getByTestId('event-more').click()
  await page.getByRole('menuitem', { name }).click()
}
