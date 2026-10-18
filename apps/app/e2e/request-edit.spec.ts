import { expect, test } from '@playwright/test'

import { openRequest, signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 6.1 and 6.2 — an author changes an open request without
 * closing it, the page says it was edited, and the character notes have a
 * place of their own that a helper's composer shows.
 */
test('an author changes an open request, and a helper sees the change', async ({
  page,
  browser,
}) => {
  await signUpAndOnboard(page)
  const { requestPath } = await openRequest(page, 'A request that changes')

  await page.getByRole('link', { name: 'Change this request' }).click()
  await expect(page).toHaveURL(/\/edit$/u)
  // The kind and the section are what a request is.
  await expect(page.getByLabel('Which section?')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0)

  await page.getByLabel('Title').fill('What happens the next morning, really?')
  // Item 6.12 — the form counts, and says the range in words before the server has to.
  await expect(page.getByText('38 of 120 characters')).toBeVisible()
  await page.getByLabel('At least').fill('50')
  await expect(
    page.getByRole('status').filter({ hasText: 'Between 100 and 2,000 words.' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save the changes' })).toBeDisabled()
  await page.getByLabel('At least').fill('150')
  await page.getByLabel('Character notes').fill('Ruth never explains herself.')
  await expect(page.getByText('28 of 2,000 characters')).toBeVisible()
  await page.getByRole('button', { name: 'Save the changes' }).click()

  await expect(page).toHaveURL(new RegExp(`${requestPath.replaceAll('/', '\\/')}$`, 'u'))
  await expect(
    page.getByRole('heading', { name: 'What happens the next morning, really?' }),
  ).toBeVisible()
  await expect(page.getByText(/· edited/u)).toBeVisible()
  // Item 6.15 (D-8) — the day it closes by itself, from the day it opened.
  await expect(page.getByText(/Closes on \d{1,2} [A-Z][a-z]+ \d{4}/u)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Characters' })).toBeVisible()
  await expect(page.getByText('Ruth never explains herself.')).toBeVisible()

  // A helper's composer carries the characters under their own heading.
  const helperContext = await browser.newContext()
  const helperPage = await helperContext.newPage()
  await signUpAndOnboard(helperPage)
  await helperPage.goto(requestPath)
  // Items 6.3 and 6.4 — know before you write, and while writing.
  await expect(
    helperPage.getByText(/0 of your 3 suggestions waiting on this story · 10 sends left today/u),
  ).toBeVisible()
  await helperPage.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(helperPage).toHaveURL(/\/write$/u)
  // The side panel is drawn twice (item 4.5): the visible copy is the one that counts.
  await expect(
    helperPage.getByText('Ruth never explains herself.').filter({ visible: true }),
  ).toBeVisible()
  await expect(helperPage.getByText(/0 of your 3 suggestions waiting on this story/u)).toBeVisible()
  // The ask is in view, folded behind Read all when it is long.
  await helperPage.getByRole('button', { name: 'Read all' }).click()
  await expect(helperPage.getByText(/minutes of a meeting/u)).toBeVisible()
  await helperContext.close()
})
