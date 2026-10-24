import { expect, test, type Page } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 7b.1 and 7b.2 (decision 0044) — publishing. An owner
 * publishes the main draft as an edition; a guest reads it at its own
 * address; the working draft changes and the edition does not; publishing
 * again makes the next edition current and keeps the first readable; and the
 * working draft says there is an edition to read.
 */

const FIRST = 'The harbour had been empty for a year before she noticed.'
const SECOND = 'The harbour filled overnight, and nobody would say from where.'

async function writeAStory(page: Page, title: string) {
  await page.goto('/new')
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//)
  const path = /^\/s\/[^/]+/u.exec(new URL(page.url()).pathname)![0]
  await rewrite(page, path, FIRST)
  return path
}

async function rewrite(page: Page, path: string, text: string) {
  await page.goto(`${path}/c/1/1/edit`)
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.press('Control+A')
  await editor.pressSequentially(text)
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}

async function publish(page: Page, path: string, number: number, note?: string) {
  await page.goto(`${path}/versions`)
  await page.getByRole('button', { name: 'Publish an edition' }).click()
  if (note) await page.getByLabel(/what changed since the last edition/i).fill(note)
  await expect(page.getByText(/cannot be changed or taken back/i)).toBeVisible()
  await page.getByRole('button', { name: `Publish edition ${String(number)}` }).click()
  await expect(
    page
      .getByRole('list', { name: 'Published editions' })
      .getByRole('link', { name: `Edition ${String(number)}` }),
  ).toBeVisible()
}

test('an owner publishes an edition, a guest reads it, and the next replaces it', async ({
  page,
  browser,
}) => {
  const { username } = await signUpAndOnboard(page)
  const path = await writeAStory(page, 'The harbour edition')
  await publish(page, path, 1, 'The first telling.')

  const guest = await browser.newPage()
  await guest.goto(`${path}/published`)
  await expect(guest.getByText(/^Edition 1, published .+, by /u)).toBeVisible()
  await expect(guest.getByText('The first telling.')).toBeVisible()
  await expect(guest.getByText(FIRST)).toBeVisible()
  // An edition is a still page: no margin, no asking for help, no editing.
  await expect(guest.getByRole('complementary', { name: 'In the margin' })).toHaveCount(0)
  await expect(guest.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0)

  // The working draft moves on; the edition does not.
  await rewrite(page, path, SECOND)
  await guest.reload()
  await expect(guest.getByText(FIRST)).toBeVisible()
  await expect(guest.getByText(SECOND)).toHaveCount(0)

  // Publishing again makes the next edition current, and keeps the first.
  await publish(page, path, 2)
  await guest.goto(`${path}/published`)
  await expect(guest.getByText(/^Edition 2, published /u)).toBeVisible()
  await expect(guest.getByText(SECOND)).toBeVisible()
  await guest.goto(`${path}/published/1`)
  await expect(guest.getByText(FIRST)).toBeVisible()
  await guest.getByRole('link', { name: 'Read the current edition' }).click()
  await expect(guest).toHaveURL(new RegExp(`${path}/published$`, 'u'))

  // The working draft says there is an edition, and leads to it.
  await page.goto(path)
  await expect(page.getByText(/^Published edition 2, /u)).toBeVisible()
  await page.getByRole('link', { name: 'Read the edition' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}/published$`, 'u'))
  // An author is offered the way back to the working draft.
  await page.getByRole('link', { name: 'Read the working draft' }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`, 'u'))
  // Item 7b.3 — the export page starts on the published edition, and its
  // file is named for it.
  await page.goto(`${path}/export`)
  await expect(page.getByLabel('Which version').locator('option:checked')).toHaveText(
    'The published edition (edition 2)',
  )
  const download = await page
    .getByRole('link', { name: 'Download Markdown (.md)' })
    .getAttribute('href')
  const file = await page.request.get(download!)
  expect(file.status()).toBe(200)
  expect(file.headers()['content-disposition']).toMatch(/-edition-2\.md/u)
  expect(await file.text()).toContain(SECOND)
  // And the working draft can still be chosen: the page used to go straight
  // back to the edition.
  await page.getByLabel('Which version').selectOption({ label: 'The main draft' })
  await expect(page).toHaveURL(/\/export\?version=/u)
  await expect(page.getByLabel('Which version').locator('option:checked')).toHaveText(
    'The main draft',
  )

  // Item 7b.3 — the profile marks a published story.
  await guest.goto(`/@${username}`)
  await expect(guest.getByText('Published, edition 2')).toBeVisible()
  await guest.close()
})
