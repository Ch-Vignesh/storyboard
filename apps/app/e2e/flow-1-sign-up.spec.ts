import { expect, test } from '@playwright/test'

import {
  newEmail,
  openRequest,
  readVerificationLink,
  signUpAndOnboard,
  uniqueUsername,
} from './helpers'

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
  // OD-7, decision 0020 — the form does not submit without it.
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.getByText(/check your inbox/i)).toBeVisible()

  // Step 2 — the verification link, read from the message the console mailer
  // wrote. The token really does come from the email.
  const link = await readVerificationLink(email)
  await page.goto(link)

  // Step 3 — set a password. FR-1.4's link is single-use, so this is the only
  // time it works. It can be read back before it is sent, and hidden again.
  const password = page.getByLabel('Password')
  await password.fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  // Item 3.9 — typed twice, and the rule under the field ticks as it is met.
  await expect(page.getByText('A capital letter, done')).toBeVisible()
  await page.getByLabel('Type it again').fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: /set password/i }).click()

  // Step 4 — choose a username. FR-1.3 warns that it is permanent, and the
  // warning has to be acknowledged before the name can be taken.
  await expect(page).toHaveURL(/\/onboarding\/username/)
  await expect(page.getByText(/cannot change this later/i)).toBeVisible()
  // Item 3.7 — a refused name says why, under the field.
  await page.getByLabel('Username').fill('ab')
  await expect(page.getByText('Use at least 3 characters.')).toBeVisible()
  await page.getByLabel('Username').fill('admin')
  await expect(page.getByText('That name is reserved.')).toBeVisible()
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
  // FR-13.4 (item 2.3) — the rules are on this step, a line each, and Finish
  // waits for the tick that says they were read.
  await expect(page.getByText(/nothing here is private/i)).toBeVisible()
  await expect(finish).toBeDisabled()
  await page.getByRole('checkbox', { name: /community rules/i }).check()
  await expect(finish).toBeEnabled()
  await finish.click()

  // FR-1.5 — onboarding ends on the dashboard, and the dashboard is never a
  // dead end even with nothing in it.
  await expect(page).toHaveURL(/\/$|\/\?/)
  await expect(page.getByRole('heading', { name: /your dashboard/i })).toBeVisible()
  await expect(page.getByText(/stories you are writing/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /start your first story/i })).toBeVisible()

  // FR-1.4 (phase 14, item 1.16) — the same link, opened again now that the
  // account is finished, says so. It read "This link has expired… Request a
  // new one" and led back to sign-up.
  await page.goto(link)
  await expect(page.getByRole('heading', { name: /your account is ready/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible()
})

test('a half-onboarded writer is sent back to the step they left', async ({ page }) => {
  const email = newEmail()

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  // OD-7, decision 0020 — the form does not submit without it.
  await page.getByRole('button', { name: /email me a link/i }).click()
  await page.goto(await readVerificationLink(email))
  await page.getByLabel('Password').fill('A-long-enough-passphrase-1!')
  await page.getByLabel('Type it again').fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/username/)

  // Skipping ahead is not possible: the proxy knows which step is outstanding.
  await page.goto('/onboarding/genres')
  await expect(page).toHaveURL(/\/onboarding\/username/)

  await page.goto('/new')
  await expect(page).toHaveURL(/\/onboarding\/username/)
})

/** Phase 14, item 3.4 — a wrong password leaves the address where it was typed. */
test('a wrong password keeps the email filled in, and the dead ends are named', async ({
  page,
}) => {
  const { email } = await signUpAndOnboard(page)
  await page.goto('/signin')
  await expect(page).toHaveURL(/\/$|\/\?/)
  // Item 3.11 — signed in, so /signin sends them home. Sign out to see the form.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/signin/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('Not the right one 1!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/do not match/i)).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(email)
  await expect(page.getByText(/never got the confirmation email/i)).toBeVisible()
  await expect(page.getByText(/signed up with google/i)).toBeVisible()
})

/**
 * Phase 14, item 3.6 — a way out of onboarding: whoever is signed in can sign
 * out from the frame, before taking a permanent name.
 */
test('somebody half way through onboarding can sign out', async ({ page }) => {
  const email = newEmail()
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await page.goto(await readVerificationLink(email))
  await page.getByLabel('Password').fill('A-long-enough-passphrase-1!')
  await page.getByLabel('Type it again').fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/username/)

  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/signin/)
  await page.goto('/onboarding/username')
  await expect(page).toHaveURL(/\/signin/)
})

/**
 * Phase 14, item 3.5 — the page a guest came from survives sign-up: "Sign in
 * to help" on a request, "Create an account", the emailed link, the password,
 * the username, the genres, and then that request, not the dashboard.
 */
test('a guest who came to help lands back on the request after signing up', async ({
  page,
  browser,
}) => {
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)
  const { requestPath } = await openRequest(authorPage, 'The weir in spring')
  await authorContext.close()

  await page.goto(requestPath)
  await page.getByRole('link', { name: /sign in to help/i }).click()
  await expect(page).toHaveURL(/\/signin\?next=/)
  await page.getByRole('link', { name: /create an account/i }).click()
  await expect(page).toHaveURL(/\/signup\?next=/)

  const email = newEmail()
  const username = uniqueUsername()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()
  const link = await readVerificationLink(email)
  expect(link).toContain('next=')
  await page.goto(link)
  await page.getByLabel('Password').fill('A-long-enough-passphrase-1!')
  await page.getByLabel('Type it again').fill('A-long-enough-passphrase-1!')
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page).toHaveURL(/\/onboarding\/username\?next=/)
  await page.getByLabel('Username').fill(username)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /take this name/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/genres\?next=/)
  for (const genre of ['Literary fiction', 'Fantasy', 'Horror']) {
    await page.getByRole('button', { name: genre, exact: true }).click()
  }
  await page.getByRole('checkbox', { name: /community rules/i }).check()
  await page.getByRole('button', { name: /finish/i }).click()

  await expect(page).toHaveURL(new RegExp(`${requestPath.replaceAll('/', '\\/')}$`))
  await expect(page.getByRole('button', { name: /write a suggestion/i })).toBeVisible()
})
