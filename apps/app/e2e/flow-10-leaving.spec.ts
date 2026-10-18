import { expect, test } from '@playwright/test'

import { readFileSync } from 'node:fs'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 9's exit criterion: a person can delete their account, and what happens
 * to the work they leave behind is something a stranger could read and agree
 * with (OD-3's second half, decision 0024).
 *
 * The flow asserts the uncomfortable half as hard as the easy half. Deleting
 * freezes the person and **keeps the writing** — because the writing is not
 * only theirs — and a test that only checked "the account went away" would pass
 * just as happily on an implementation that took a co-author's chapter with it.
 */

test('a writer deletes their account, and can stop it before it happens', async ({ page }) => {
  const { email, username } = await signUpAndOnboard(page)

  // Something to leave behind.
  await page.goto('/new')
  await page.getByLabel('Title').fill('The harbour year')
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/the-harbour-year-/u)
  const storyboardPath = new URL(page.url()).pathname

  // ── Asking to be deleted ────────────────────────────────────────────────
  await page.goto('/settings')
  await page.getByRole('button', { name: /delete my account/i }).click()

  // The screen has to say what is kept before anybody presses anything.
  await expect(page.getByText(/every story you own/i)).toBeVisible()
  await expect(page.getByText(/a former member/i)).toBeVisible()

  const confirm = page.getByRole('button', { name: /^delete my account$/i })
  // Nothing happens until the username is typed: this must not be a mis-click.
  await expect(confirm).toBeDisabled()
  await page.getByLabel(/type .* to confirm/i).fill(username)
  await expect(confirm).toBeEnabled()
  await confirm.click()

  // ── Frozen, not gone ────────────────────────────────────────────────────
  await expect(page.getByText(/this account is being deleted/i)).toBeVisible()
  await expect(page.getByText(/it will be erased on/i)).toBeVisible()

  // Phase 14, item 1.5 — never silent. The address is told at once, and every
  // signed-in page says so until the account is kept.
  await expect
    .poll(
      () => {
        try {
          const log = readFileSync(process.env.MAIL_LOG_FILE ?? '', 'utf8')
          return log.includes(`To: ${email}`) && /will be deleted on/i.test(log)
        } catch {
          return false
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  const banner = page.getByRole('region', { name: /account deletion/i })
  await page.goto('/')
  await expect(banner).toContainText(/being deleted/i)

  // The profile is hidden at once, though the seven days have not passed.
  const profile = await page.goto(`/@${username}`)
  expect(profile?.status()).toBe(404)

  // And the work is still there, still readable by its author.
  await page.goto(storyboardPath)
  await expect(page.getByText('The harbour year').first()).toBeVisible()

  // Writing is refused while the deletion is pending.
  await page.goto('/new')
  await page.getByLabel('Title').fill('Something new')
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page.getByText(/being deleted/i).first()).toBeVisible()
  await expect(page).not.toHaveURL(/\/s\/something-new/u)

  // ── Changing their mind ─────────────────────────────────────────────────
  // From the banner, on a page that is not settings (phase 14, item 1.5).
  await page.goto(storyboardPath)
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: /keep my account/i }).click()
  await expect(banner).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: /delete my account/i })).toBeVisible()

  // The profile is back.
  const restored = await page.goto(`/@${username}`)
  expect(restored?.status()).toBe(200)

  // And so is writing.
  await page.goto('/new')
  await page.getByLabel('Title').fill('Something new')
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/something-new-/u)
})

test('every format FR-14.2 names can actually be downloaded', async ({ page }) => {
  await signUpAndOnboard(page)

  await page.goto('/new')
  await page.getByLabel('Title').fill('Exportable')
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/exportable-/u)
  const slug = new URL(page.url()).pathname.split('/')[2] ?? ''

  await page.goto(`/s/${slug}/export`)

  // `.epub` was built in phase 9 and, for one commit, was unreachable: the
  // format existed and the list of what to offer was written out by hand. This
  // asserts the screen, not the library.
  await expect(page.getByText('EPUB (.epub)')).toBeVisible()

  for (const format of ['docx', 'pdf', 'md', 'epub']) {
    const response = await page.request.get(`/api/export/${slug}?format=${format}`)
    expect(response.status(), format).toBe(200)
    const body = await response.body()
    expect(body.byteLength, format).toBeGreaterThan(100)
  }

  // An epub is a zip, and its first entry is the uncompressed mimetype.
  const epub = await (await page.request.get(`/api/export/${slug}?format=epub`)).body()
  expect(epub.subarray(0, 2).toString('ascii')).toBe('PK')
  expect(epub.subarray(30, 38).toString('ascii')).toBe('mimetype')

  // A version that is not this story's is not found, not a server fault (it
  // was a 500 until the 2026-10-16 spec review).
  const stray = await page.request.get(`/api/export/${slug}?format=md&version=not-a-version`)
  expect(stray.status()).toBe(404)
})
