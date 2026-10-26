import { expect, test } from '@playwright/test'

/**
 * Phase 14, item 6.11 — "Copy link" on the reader, a request, a suggestion and
 * a profile puts the page's address on the clipboard and says so through a
 * live region, for a guest as much as anyone.
 *
 * On the seeded example (item 9.5), whose second stuck point has a suggestion
 * waiting, so no step can be skipped: the request and suggestion steps sat
 * behind an `if` until the 2026-10-24 final pass.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('copies the address and announces it', async ({ page, baseURL }) => {
  const story = '/s/the-yellow-wallpaper-seedyellow1'

  const copied = async (path: string) => {
    await page.goto(path)
    await page.getByRole('button', { name: 'Copy link' }).first().click()
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toHaveCount(1)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}${path}`)
  }

  await copied(story)
  await copied('/@example-helper-1')

  await page.goto(story)
  await page
    .getByRole('link', { name: /read what they need/i })
    .nth(1)
    .click()
  await expect(page).toHaveURL(/\/help\//u)
  const requestPath = new URL(page.url()).pathname
  await copied(requestPath)

  // A suggestion's own page.
  const suggestion = page.locator(`a[href^="${requestPath}/s/"]`).first()
  await expect(suggestion).toBeAttached()
  const suggestionPath = await suggestion.getAttribute('href')
  expect(suggestionPath).toMatch(/\/s\/[^/]+$/u)
  await copied(suggestionPath ?? '')
})
