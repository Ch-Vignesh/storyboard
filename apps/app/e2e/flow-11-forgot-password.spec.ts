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

const NEW_PASSWORD = 'a completely different passphrase'

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
  await phone.getByLabel('Password').fill('a-long-enough-passphrase')
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
