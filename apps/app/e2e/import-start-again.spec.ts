import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 8.4 and 8.9 — import. A script file is offered as a
 * screenplay; "Start again" leaves no `?job=` behind for a reload to bring
 * back; and an upload in progress can be cancelled.
 */
const SCRIPT = [
  'Title: Harbour lights',
  '',
  'INT. HARBOUR OFFICE - NIGHT',
  '',
  'Rain against the glass.',
  '',
  'MARGARET',
  'You came.',
  '',
].join('\n')

test('a script comes in as a screenplay, and starting again starts clean', async ({ page }) => {
  await signUpAndOnboard(page)
  await page.goto('/import')

  const file = {
    name: 'harbour-lights.fountain',
    mimeType: 'text/plain',
    buffer: Buffer.from(SCRIPT),
  }

  // 8.9 — an upload that never finishes can be stopped, and nothing is kept.
  await page.route('**/api/import/upload**', () => {
    // Held: the upload neither finishes nor fails until it is cancelled.
  })
  await page.getByLabel('Your manuscript').setInputFiles(file)
  await page.getByRole('button', { name: 'Cancel the upload' }).click()
  await expect(page.getByText('Upload cancelled. Nothing was brought in.')).toBeVisible()
  await expect(page.getByLabel('Your manuscript')).toBeEnabled()
  await page.unroute('**/api/import/upload**')

  // 8.4 — .fountain is preselected as a screenplay.
  await page.getByLabel('Your manuscript').setInputFiles(file)
  await expect(page.getByRole('heading', { name: /is this where the chapters are/i })).toBeVisible()
  await expect(page.getByLabel('What is it?')).toHaveValue('SCREENPLAY')
  await expect(page).toHaveURL(/\/import\?job=/u)

  // 8.9 — starting again clears the address, so a reload is a fresh start.
  await page.getByRole('button', { name: /start again with another file/i }).click()
  await expect(page).toHaveURL(/\/import$/u)
  await expect(page.getByLabel('Your manuscript')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Your manuscript')).toBeVisible()
  await expect(page.getByRole('heading', { name: /is this where the chapters are/i })).toHaveCount(
    0,
  )
})
