import { expect, test, type Page } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, milestone 8 — the writing tool: saving survives a bad connection
 * and words typed while it could not are offered back (8.5); the editor leads
 * on through the story and back to the section it is on (8.1); a section moves
 * to another chapter by a form (8.3); and two tabs on one section say so (8.6).
 */

async function newStory(page: Page, title: string): Promise<string> {
  await page.goto('/new')
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//u)
  return /^\/s\/[^/]+/u.exec(new URL(page.url()).pathname)![0]
}

async function typeAtEnd(page: Page, text: string) {
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.press('ControlOrMeta+End')
  await editor.pressSequentially(text)
}

const KEPT = /Couldn.t save\. Your words are kept on this device\. Trying again/u

test('saving survives a lost connection, and the editor leads on and back', async ({
  page,
  context,
}) => {
  await signUpAndOnboard(page)
  const path = await newStory(page, 'The offline harbour')
  // A second section, for "Next section".
  await page.goto(`${path}/contents`)
  await page.getByRole('button', { name: 'Add a section' }).click()
  await expect(page.getByRole('link', { name: 'Write' })).toHaveCount(2)

  await page.goto(`${path}/c/1/1/edit`)
  await typeAtEnd(page, 'Saved before the storm.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // Item 8.5 — no connection: said plainly, kept, and tried again.
  await context.setOffline(true)
  await typeAtEnd(page, ' Written with no connection.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText(KEPT)).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 20_000 })

  // Item 8.1 — on through the story and back, a section at a time.
  await page.getByRole('link', { name: /^Next section:/u }).click()
  await expect(page).toHaveURL(new RegExp(`${path}/c/1/2/edit$`, 'u'))
  await page.getByRole('link', { name: /^← Previous section:/u }).click()
  await expect(page).toHaveURL(new RegExp(`${path}/c/1/1/edit$`, 'u'))
  // Back to the story is back to this section, not to chapter one.
  await page.getByRole('link', { name: 'Back to the story' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}/c/1/1$`, 'u'))
  await expect(page.getByText('Written with no connection.')).toBeVisible()
})

test('words typed while saves cannot get through are offered back', async ({ page }) => {
  await signUpAndOnboard(page)
  const path = await newStory(page, 'The kept words')
  await page.goto(`${path}/c/1/1/edit`)

  // The saves never reach the server; the page itself still loads.
  await page.route('**/api/trpc/**', (route) =>
    /saveDraft|commitRevision/u.test(route.request().url())
      ? route.abort('internetdisconnected')
      : route.continue(),
  )
  await page.route('**/api/section/save-beacon', (route) => route.abort())
  await typeAtEnd(page, 'Words the server never heard.')
  await expect(page.getByText(KEPT)).toBeVisible({ timeout: 15_000 })

  page.on('dialog', (dialog) => void dialog.accept())
  await page.reload()
  await expect(page.getByText(/This device kept words you wrote here/u)).toBeVisible()
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.getByRole('button', { name: 'Put them back' }).click()
  await expect(page.getByRole('textbox', { name: /section text/i })).toContainText(
    'Words the server never heard.',
  )
  await page.getByRole('button', { name: /save now/i }).click()
  // They reach the story: what a reader is shown, not only the status line.
  await expect
    .poll(async () => (await page.request.get(`${path}/c/1/1`)).text(), { timeout: 15_000 })
    .toContain('Words the server never heard.')
})

test('renaming a story moves its address, and the old one follows (8.7)', async ({ page }) => {
  await signUpAndOnboard(page)
  const path = await newStory(page, 'The first name')
  const publicId = path.slice(-10)
  await page.goto(`${path}/settings`)
  await page.getByLabel('Title', { exact: true }).fill('A better name')
  await page.getByRole('button', { name: 'Save details' }).click()
  const renamed = `/s/a-better-name-${publicId}`
  await expect(page).toHaveURL(new RegExp(`${renamed}/settings$`, 'u'))

  // An address from before, with more after it, arrives at the same page now.
  await page.goto(`${path}/contributors`)
  await expect(page).toHaveURL(new RegExp(`${renamed}/contributors$`, 'u'))
  const response = await page.request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toBe(renamed)
})

test('a section moves to another chapter, and a second tab is warned', async ({
  page,
  context,
}) => {
  await signUpAndOnboard(page)
  const path = await newStory(page, 'The moved passage')
  await page.goto(`${path}/contents`)
  await page.getByRole('button', { name: 'Add a section' }).click()
  await expect(page.getByRole('link', { name: 'Write' })).toHaveCount(2)
  await page.getByLabel('New chapter name').fill('Landfall')
  await page.getByRole('button', { name: 'Add a chapter' }).click()
  await expect(page.getByLabel('Chapter 2 name')).toHaveValue('Landfall')

  // Item 8.3 — the second section of chapter one goes to the top of chapter two.
  await page.getByLabel('Chapter 1, section 2 name').fill('Vessel')
  await page.getByLabel('Chapter 1, section 2 name').blur()
  await page.getByRole('button', { name: 'Move to…' }).nth(1).click()
  await page.getByLabel('Chapter', { exact: true }).selectOption({ label: '2. Landfall' })
  await page.getByLabel('Place').selectOption({ index: 0 })
  await page.getByRole('button', { name: 'Move it to that chapter' }).click()
  await expect(page.getByLabel('Chapter 2, section 1 name')).toHaveValue('Vessel')
  // Item 8.11 — its handle says what it moves.
  await expect(page.getByRole('button', { name: 'Move section ‘Vessel’' })).toBeVisible()

  // Item 8.6 — the same section in two tabs: both are told.
  await page.goto(`${path}/c/2/1/edit`)
  const second = await context.newPage()
  await second.goto(`${path}/c/2/1/edit`)
  await expect(second.getByText(/This section is open in another tab/u)).toBeVisible()
  await expect(page.getByText(/This section is open in another tab/u)).toBeVisible()
  await second.close()
})
