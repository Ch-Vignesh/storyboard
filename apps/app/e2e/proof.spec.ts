import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — a proof anyone can check. The writer
 * follows "Proof that you wrote this" from the history to the version's
 * public record and takes the PDF from there; a guest opens the same address
 * and reads the same record, with the story named while it is public and
 * "a private story" once it is not.
 */
test('a writer hands out a proof of authorship that a guest can check', async ({
  page,
  browser,
}) => {
  await signUpAndOnboard(page)

  await page.goto('/new')
  await page.getByLabel('Title').fill('A proof of the harbour')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/a-proof-of-the-harbour-/u)
  const slug = new URL(page.url()).pathname.split('/')[2] ?? ''

  await page.goto(`/s/${slug}/c/1/1/edit`)
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('The harbour had been empty for a year before she noticed.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // From the history, the writer's own version leads to its record.
  await page.goto(`/s/${slug}/c/1/1/history`)
  const current = page.getByRole('listitem').first()
  const fingerprint =
    (await current.getByTitle(/the whole fingerprint/i).getAttribute('title'))?.split(': ')[1] ?? ''
  expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u)
  await current.getByRole('link', { name: /proof that you wrote this/i }).click()
  await expect(page).toHaveURL(/\/proof\/[^/]+$/u)
  const recordPath = new URL(page.url()).pathname

  await expect(page.getByRole('heading', { name: 'Proof of authorship' })).toBeVisible()
  await expect(page.getByText(fingerprint)).toBeVisible()
  await expect(page.getByRole('link', { name: 'A proof of the harbour' })).toBeVisible()
  await expect(page.getByText(/versions can.t be changed once written/i)).toBeVisible()
  await expect(page.getByText(/cannot show that they were original to that person/i)).toBeVisible()

  // The writer takes it away as a PDF, which prints this address.
  const pdf = page.getByRole('link', { name: /download this record as a pdf/i })
  const response = await page.request.get((await pdf.getAttribute('href')) ?? '')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('pdf')

  // A guest reads the same record at the same address, with no PDF to take.
  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(recordPath)
  await expect(guest.getByRole('heading', { name: 'Proof of authorship' })).toBeVisible()
  await expect(guest.getByText(fingerprint)).toBeVisible()
  await expect(guest.getByRole('link', { name: 'A proof of the harbour' })).toBeVisible()
  await expect(guest.getByRole('link', { name: /download this record as a pdf/i })).toHaveCount(0)

  // Once the story is private, the record stays and the story is not named.
  await page.goto(`/s/${slug}/settings`)
  await page.getByRole('button', { name: 'Make it private' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Make it private' }).click()
  await expect(page.getByText('This story is private.')).toBeVisible()

  await guest.reload()
  await expect(guest.getByText(fingerprint)).toBeVisible()
  await expect(guest.getByText('a private story')).toBeVisible()
  await expect(guest.getByText('A proof of the harbour')).toHaveCount(0)
  await guestContext.close()
})
