import { readFileSync } from 'node:fs'

import { expect, type Page } from '@playwright/test'

/**
 * Shared steps for the critical flows. Everything here goes through the real
 * interface; nothing reaches into the database to shortcut a state, because a
 * flow test that skips the flow proves nothing.
 */

const PASSWORD = 'a-long-enough-passphrase'

let counter = 0

/** A fresh address per test. `.invalid` is reserved and can never be delivered to. */
export function newEmail(): string {
  counter += 1
  return `flow-${String(Date.now())}-${String(counter)}@storyboard.invalid`
}

export function uniqueUsername(): string {
  counter += 1
  // Lowercase letters, digits and hyphens only (FR-1.3).
  return `flow-${String(Date.now()).slice(-8)}-${String(counter)}`
}

/**
 * A link to `route`, read from the newest message the console mailer appended
 * to `MAIL_LOG_FILE` for this recipient that carries one. Polls because the
 * mail is written while the request that sends it is still in flight.
 */
export async function readEmailedLink(email: string, route: string): Promise<string> {
  const path = process.env.MAIL_LOG_FILE
  if (!path) throw new Error('MAIL_LOG_FILE is not set; the flow cannot read its email.')
  const link = new RegExp(`https?://\\S*${route}\\?token=[A-Za-z0-9_-]+`, 'u')

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    let contents = ''
    try {
      contents = readFileSync(path, 'utf8')
    } catch {
      // Not written yet.
    }
    // Messages are appended, so the newest one to this recipient comes last.
    const blocks = contents.split('MAIL (not sent').filter((block) => block.includes(email))
    const match = blocks
      .reverse()
      .find((block) => link.test(block))
      ?.match(link)
    if (match) return match[0]
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No ${route} link for ${email} appeared in ${path}`)
}

/** FR-1.3 — the sign-up verification link. */
export function readVerificationLink(email: string): Promise<string> {
  return readEmailedLink(email, '/verify')
}

/** Sign up, verify, and complete both onboarding steps. Leaves you signed in. */
export async function signUpAndOnboard(page: Page): Promise<{ email: string; username: string }> {
  const email = newEmail()
  const username = uniqueUsername()

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()

  await page.goto(await readVerificationLink(email))
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page).toHaveURL(/\/onboarding\/username/)
  await page.getByLabel('Username').fill(username)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /take this name/i }).click()

  await expect(page).toHaveURL(/\/onboarding\/genres/)
  for (const genre of ['Literary fiction', 'Fantasy', 'Horror']) {
    await page.getByRole('button', { name: genre, exact: true }).click()
  }
  await page.getByRole('button', { name: /finish/i }).click()
  await expect(page.getByRole('heading', { name: /your dashboard/i })).toBeVisible()

  return { email, username }
}

/** Signs an existing account in through the real form. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}
