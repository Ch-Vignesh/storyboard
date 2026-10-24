import { expect, test } from '@playwright/test'

/**
 * Phase 14, item 7.7 (FR-15.3) — a seeded story is labelled an example
 * wherever it appears, above all on the request page browse sends helpers
 * to, which said nothing.
 */
test('a seeded story says it is an example on its request and contributors pages', async ({
  page,
}) => {
  const story = '/s/pride-and-prejudice-seedpride01'
  await page.goto(story)
  const request = page.locator('a[href*="/help/"]:not([href$="/help/new"])').first()
  const requestPath = await request.getAttribute('href')
  expect(requestPath).toBeTruthy()

  await page.goto(requestPath!)
  await expect(page.getByText('An example story from the public domain')).toBeVisible()
  await expect(page.getByText('Example', { exact: true }).first()).toBeVisible()

  await page.goto(`${story}/contributors`)
  await expect(page.getByText('An example story from the public domain')).toBeVisible()

  // Browse labels its cards the same way.
  await page.goto('/browse')
  await expect(page.getByText('Example', { exact: true }).first()).toBeVisible()
})
