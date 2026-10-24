import { expect, test } from '@playwright/test'

import { readEmailedLink, signIn, signUpAndOnboard } from './helpers'

/**
 * FR-1.7, decision 0036 — a forgotten password.
 *
 * The whole of it, through the interface: from "Forgot your password?" to a
 * link in the email, a new password typed twice, and signing in with it. And
 * the part that is easy to forget and hard to notice: a device that was
 * signed in before the reset is signed out by it, and the old password and the
 * used link are both dead.
 */

const NEW_PASSWORD = 'A completely different passphrase 2?'

test('a writer who forgot their password resets it, and every earlier session ends', async ({
  page,
  browser,
}) => {
  // `page` stays signed in throughout: the laptop left open at home.
  const { email } = await signUpAndOnboard(page)

  const elsewhere = await browser.newContext()
  const phone = await elsewhere.newPage()

  // Step 1 — ask for a link.
  await phone.goto('/signin')
  await phone.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(phone).toHaveURL(/\/forgot-password$/u)
  await phone.getByLabel('Email').fill(email)
  await phone.getByRole('button', { name: 'Email me a reset link' }).click()
  await expect(phone.getByText(/a link to choose a new password is on its way/iu)).toBeVisible()
  // Item 3.10 — back to the form, the address still there to correct.
  await phone.getByRole('button', { name: 'Use a different address' }).click()
  await expect(phone.getByLabel('Email')).toHaveValue(email)

  // Step 2 — the link, read from the email it was sent in.
  const link = await readEmailedLink(email, '/reset-password')
  await phone.goto(link)
  await expect(phone.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

  // Step 3 — the new password, typed twice. A mismatch is caught first.
  await phone.getByLabel('New password').fill(NEW_PASSWORD)
  await phone.getByLabel('Type it again').fill('not the same one at all')
  await phone.getByRole('button', { name: 'Set new password' }).click()
  await expect(phone.getByText('The two passwords do not match.')).toBeVisible()
  await phone.getByLabel('Type it again').fill(NEW_PASSWORD)
  await phone.getByRole('button', { name: 'Set new password' }).click()

  // Step 4 — signed out, and asked to sign in with the new one.
  await expect(phone).toHaveURL(/\/signin\?reset=1$/u)
  await expect(phone.getByText('Your password has been changed.', { exact: false })).toBeVisible()

  // The old password is dead.
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill('A-long-enough-passphrase-1!')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    phone.getByText('That email and password do not match.', { exact: false }),
  ).toBeVisible()

  // The new one works.
  await signIn(phone, email, NEW_PASSWORD)
  await expect(phone.getByRole('heading', { name: /your dashboard/iu })).toBeVisible()

  // The laptop, signed in before the reset, is signed out by it.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/signin/u)

  // And the link was good for one use.
  await phone.goto(link)
  await expect(phone.getByRole('heading', { name: 'This link has expired' })).toBeVisible()

  await elsewhere.close()
})

/**
 * Phase 14, item 3.1 — changing the password from settings while signed in.
 * The old one stops working, the new one works, and this device stays signed
 * in: behind the scenes it signs in again with the new password.
 */
test('a password is changed from settings, and this device stays signed in', async ({
  page,
  browser,
}) => {
  const changed = 'A changed passphrase 3?'
  const { email } = await signUpAndOnboard(page)

  await page.goto('/settings')
  // As in the address test below: what is typed before the page hydrates is
  // lost, and the button reloads the page instead of changing anything.
  await page.waitForLoadState('networkidle')
  // Two forms ask for the current password (the address form first, item 3.2).
  await page
    .getByLabel('Current password', { exact: true })
    .last()
    .fill('A-long-enough-passphrase-1!')
  await page.getByLabel('New password', { exact: true }).fill(changed)
  await page.getByLabel('Type it again').fill(changed)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText(/^Changed\./)).toBeVisible()

  // Still signed in here.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings/u)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Elsewhere, the old password is dead and the new one works.
  const elsewhere = await browser.newContext()
  const phone = await elsewhere.newPage()
  await phone.goto('/signin')
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill('A-long-enough-passphrase-1!')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    phone.getByText('That email and password do not match.', { exact: false }),
  ).toBeVisible()
  await signIn(phone, email, changed)
  await expect(phone.getByRole('heading', { name: /your dashboard/iu })).toBeVisible()
  await elsewhere.close()
})

/**
 * Phase 14, item 3.3 — "Sign out on every device" ends this session and the
 * others, and says so on the sign-in page.
 */
test('signing out on every device ends the other sessions too', async ({ page, browser }) => {
  const { email } = await signUpAndOnboard(page)
  const elsewhere = await browser.newContext()
  const phone = await elsewhere.newPage()
  await signIn(phone, email, 'A-long-enough-passphrase-1!')
  await expect(phone.getByRole('heading', { name: /your dashboard/iu })).toBeVisible()

  await page.goto('/settings')
  // A click before the page hydrates does nothing.
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Sign out on every device' }).click()
  await expect(page).toHaveURL(/\/signin\?ended=1/u)

  await phone.goto('/settings')
  await expect(phone).toHaveURL(/\/signin/u)
  await elsewhere.close()
})

/**
 * Phase 14, item 3.2 — changing the address, through the mail log: the link
 * goes to the new address, the button there makes it the account's, every
 * session ends, and the new address signs in with the old password.
 */
test('a writer changes their email address from the link sent to the new one', async ({ page }) => {
  const { email } = await signUpAndOnboard(page)
  const newEmail = email.replace('@', '-moved@')

  await page.goto('/settings')
  // Typed before the page hydrates, the fields are reset and "Email me a link"
  // stays disabled: the first attempt failed that way on a cold server
  // (phase 14 final pass, 2026-10-24).
  await page.waitForLoadState('networkidle')
  await page.getByLabel('New email address').fill(newEmail)
  await page
    .getByLabel('Current password', { exact: true })
    .first()
    .fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByText(/sent a link to/i)).toBeVisible()

  const link = await readEmailedLink(newEmail, '/settings/email')
  await page.goto(link)
  await expect(page.getByRole('heading', { name: new RegExp(`Make ${newEmail}`) })).toBeVisible()
  await page.getByRole('button', { name: 'Make this my address' }).click()
  await expect(page.getByText(/is now your address/i)).toBeVisible()

  // Every session ended with it; the new address signs in.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/signin/u)
  await signIn(page, newEmail, 'A-long-enough-passphrase-1!')
  await expect(page.getByRole('heading', { name: /your dashboard/iu })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByText(newEmail, { exact: false }).first()).toBeVisible()
})
