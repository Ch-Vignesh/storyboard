import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Critical flow 2 (architecture section 8):
 * create a storyboard -> write a section.
 *
 * The flow continues into opening a contribution request, which is phase 2.
 * It stops at the section, as the phase plan says.
 */
test('a writer creates a storyboard and writes a section', async ({ page }) => {
  await signUpAndOnboard(page)

  await page
    .getByRole('link', { name: /start a storyboard/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/new/)

  await page.getByLabel('Title').fill('The ship never lands')
  await page.getByLabel('What is it?').selectOption('NOVEL')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()

  // FR-13.6 — the honest warning about copying is on the selector itself when
  // public is chosen, not behind a link.
  await expect(page.getByText(/anyone can copy what they read/i)).toBeVisible()

  await page.getByRole('button', { name: /create and start writing/i }).click()

  // FR-2.2 — never a blank slate: the main draft, one chapter, one section.
  await expect(page).toHaveURL(/\/s\/the-ship-never-lands-/)
  await expect(page.getByRole('heading', { name: 'The ship never lands' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /chapter one/i })).toBeVisible()
  await expect(page.getByText(/this section is empty/i)).toBeVisible()

  // Write.
  await page.getByRole('link', { name: 'Edit' }).first().click()
  await expect(page).toHaveURL(/\/edit$/)

  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('The harbour had been empty for a year before she noticed.')

  // FR-2.5 — a live word count.
  await expect(page.getByText(/\b11 words\b/)).toBeVisible()

  // FR-4.4 — a durable version on demand, and on blur.
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The words are in the manuscript.
  await page.getByRole('link', { name: /back to the storyboard/i }).click()
  await expect(page.getByText(/the harbour had been empty for a year/i)).toBeVisible()

  // FR-8.2, FR-8.3 — the version is in the history, attributed and immutable.
  await page.getByRole('link', { name: 'History' }).first().click()
  await expect(page.getByRole('heading', { name: /history of/i })).toBeVisible()

  // Two versions: the empty one the storyboard was created with (FR-2.2) and
  // the one just written. The chain grows; nothing was overwritten.
  const versions = page.getByRole('listitem')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('current')
  await expect(versions.first()).toContainText('11 words')
  await expect(versions.first()).toContainText(/written by the author/i)
  await expect(versions.last()).toContainText('0 words')

  // FR-8.4 — an earlier version can be restored; the current one cannot.
  await expect(versions.last().getByRole('button', { name: /restore this version/i })).toBeVisible()
  await expect(versions.first().getByRole('button', { name: /restore this version/i })).toHaveCount(
    0,
  )
})

test('a guest reads a public storyboard and is asked to sign in only to help', async ({
  browser,
}) => {
  // FR-1.2 and the sixty-second target: the account wall sits in front of
  // helping, not reading. The seeded example is public (FR-15.2).
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/s/the-yellow-wallpaper-seedyellow1')

  await expect(page.getByRole('heading', { name: 'The Yellow Wallpaper' })).toBeVisible()
  // FR-15.3 — a seeded storyboard is labelled, never passed off as a user's.
  await expect(page.getByText('Example', { exact: true })).toBeVisible()
  await expect(page.getByText(/it is very seldom that mere ordinary people/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in to help/i })).toBeVisible()

  // A guest gets no authoring affordances at all.
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)

  await context.close()
})

test('a private storyboard is invisible to a stranger, not merely read-only', async ({
  browser,
}) => {
  // The phase 1 exit criterion: 404 at every route, including the API.
  const author = await browser.newContext()
  const authorPage = await author.newPage()
  await signUpAndOnboard(authorPage)

  await authorPage.goto('/new')
  await authorPage.getByLabel('Title').fill('Kept to myself')
  await authorPage.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await authorPage.getByRole('radio', { name: /private/i }).check()
  await authorPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(authorPage).toHaveURL(/\/s\/kept-to-myself-/)
  const url = new URL(authorPage.url()).pathname
  await author.close()

  // A signed-in stranger.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  await signUpAndOnboard(strangerPage)

  const page = await strangerPage.goto(url)
  expect(page?.status()).toBe(404)

  // And the routes underneath it.
  for (const suffix of ['/settings', '/contents', '/c/1/1/edit', '/c/1/1/history']) {
    const response = await strangerPage.goto(`${url}${suffix}`)
    expect(response?.status(), `${url}${suffix} should be 404`).toBe(404)
  }
  await stranger.close()

  // And a guest.
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  const guestResponse = await guestPage.goto(url)
  expect(guestResponse?.status()).toBe(404)
  await guest.close()
})
