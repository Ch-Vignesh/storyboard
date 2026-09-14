import { expect, test } from '@playwright/test'

import { newEmail, readVerificationLink, uniqueUsername } from './helpers'

/**
 * Critical flow 1 (architecture section 8):
 * sign up -> verify -> onboard -> land on a populated dashboard.
 *
 * FR-1.3 in full: email, verification link, password, username, genres.
 */
test('a new writer signs up, verifies, onboards and reaches the dashboard', async ({ page }) => {
  const email = newEmail()
  const username = uniqueUsername()

  // Step 1 — email.
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.getByText(/check your inbox/i)).toBeVisible()

  // Step 2 — the verification link, read from the message the console mailer
  // wrote. The token really does come from the email.
  const link = await readVerificationLink(email)
  await page.goto(link)

  // Step 3 — set a password. FR-1.4's link is single-use, so this is the only
  // time it works.
  await page.getByLabel('Password').fill('a-long-enough-passphrase')
  await page.getByRole('button', { name: /set password/i }).click()

  // Step 4 — choose a username. FR-1.3 warns that it is permanent, and the
  // warning has to be acknowledged before the name can be taken.
  await expect(page).toHaveURL(/\/onboarding\/username/)
  await expect(page.getByText(/cannot change this later/i)).toBeVisible()
  await page.getByLabel('Username').fill(username)
  const take = page.getByRole('button', { name: /take this name/i })
  await expect(take).toBeDisabled()
  await page.getByRole('checkbox').check()
  await expect(take).toBeEnabled()
  await take.click()

  // Step 5 — pin at least three genres (FR-1.3).
  await expect(page).toHaveURL(/\/onboarding\/genres/)
  const finish = page.getByRole('button', { name: /finish/i })
  await expect(finish).toBeDisabled()
  for (const genre of ['Literary fiction', 'Fantasy', 'Horror']) {
    await page.getByRole('button', { name: genre, exact: true }).click()
  }
  await expect(finish).toBeEnabled()
  await finish.click()

  // FR-1.5 — onboarding ends on the dashboard, and the dashboard is never a
  // dead end even with nothing in it.
  await expect(page).toHaveURL(/\/$|\/\?/)
  await expect(page.getByRole('heading', { name: /your dashboard/i })).toBeVisible()
  await expect(page.getByText(/storyboards you are writing/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /start your first storyboard/i })).toBeVisible()
})

test('a half-onboarded writer is sent back to the step they left', async ({ page }) => {
  const email = newEmail()

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await page.goto(await readVerificationLink(email))
  await page.getByLabel('Password').fill('a-long-enough-passphrase')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/username/)

  // Skipping ahead is not possible: the proxy knows which step is outstanding.
  await page.goto('/onboarding/genres')
  await expect(page).toHaveURL(/\/onboarding\/username/)

  await page.goto('/new')
  await expect(page).toHaveURL(/\/onboarding\/username/)
})
