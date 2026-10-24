import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 8.4 and 8.10 — a story's settings. The create form says to
 * choose 1 to 3 genres, and says so again when sent without one; the type
 * changes within its family; "Saved" means saved; finishing lives here; and a
 * co-author changes the details and is told who changes the rest.
 */
test('authors keep a story’s details, and the owner its reach and its end', async ({ browser }) => {
  test.setTimeout(120_000)

  const ownerContext = await browser.newContext()
  const page = await ownerContext.newPage()
  const owner = await signUpAndOnboard(page)

  // 8.10 — the genre hint, and a sentence rather than a dead button.
  await page.goto('/new')
  await page.getByLabel('Title').fill('A harbour in parts')
  await expect(page.getByText('(Choose 1 to 3)')).toBeVisible()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page.getByText(/choose a genre first/i)).toBeVisible()
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/a-harbour-in-parts-/u)
  const slug = new URL(page.url()).pathname.split('/')[2] ?? ''

  // 8.4 — prose becomes another kind of prose; a script is not offered.
  await page.goto(`/s/${slug}/settings`)
  const type = page.getByLabel('What is it?')
  await expect(type.locator('option', { hasText: 'Screenplay' })).toHaveCount(0)
  await type.selectOption('POETRY')
  // 8.10 — "Saved" once it is, and not after the next change.
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.getByLabel('Logline').fill('Four people, one harbour.')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('What is it?')).toHaveValue('POETRY')

  // 8.10 — finishing is here now, and the export page points here.
  await page.getByRole('button', { name: /^mark it finished$/i }).click()
  await page.getByRole('button', { name: /^mark it finished$/i }).click()
  await expect(page.getByText(/marked finished/i).first()).toBeVisible()
  await page.goto(`/s/${slug}/export`)
  await expect(page.getByRole('button', { name: /mark it finished/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Its settings' })).toBeVisible()

  // A co-author.
  const writerContext = await browser.newContext()
  const writerPage = await writerContext.newPage()
  const writer = await signUpAndOnboard(writerPage)
  await page.goto(`/s/${slug}/coauthors`)
  await page.getByLabel(/invite a co-author/i).fill(`@${writer.username}`)
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByText(/invited, and not yet answered/i)).toBeVisible()
  await writerPage.goto('/')
  await writerPage.getByRole('link', { name: 'Answer' }).click()
  await writerPage.getByRole('button', { name: /become a co-author/i }).click()
  // The answer lands, and the page goes to the story, before the next address.
  await expect(writerPage).toHaveURL(new RegExp(`/s/${slug}$`, 'u'))

  // 8.10 — the details are theirs too; the owner's parts say whose they are.
  await writerPage.goto(`/s/${slug}/settings`)
  await writerPage.getByLabel('Title').fill('A harbour in four parts')
  await writerPage.getByRole('button', { name: 'Save details' }).click()
  await expect(writerPage.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await expect(
    writerPage.getByText(`Only ${owner.username} can change who can read it.`),
  ).toBeVisible()
  await expect(
    writerPage.getByText(`Only ${owner.username} can mark it finished, or open it again.`),
  ).toBeVisible()
  await expect(writerPage.getByText(`Only ${owner.username} can delete this story.`)).toBeVisible()
  await expect(writerPage.getByRole('button', { name: 'Make it private' })).toHaveCount(0)
  await expect(writerPage.getByRole('button', { name: 'Delete this story' })).toHaveCount(0)

  await writerContext.close()
  await ownerContext.close()
})
