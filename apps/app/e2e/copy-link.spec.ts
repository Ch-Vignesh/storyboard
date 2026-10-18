import { expect, test } from '@playwright/test'

/**
 * Phase 14, item 6.11 — "Copy link" on the reader, a request, a suggestion and
 * a profile puts the page's address on the clipboard and says so through a
 * live region, for a guest as much as anyone.
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('copies the address and announces it', async ({ page, baseURL }) => {
  const story = '/s/pride-and-prejudice-seedpride01'
  await page.goto(story)
  const request = page.locator('a[href*="/help/"]:not([href$="/help/new"])').first()
  const requestPath = (await request.count()) ? await request.getAttribute('href') : null

  const copied = async (path: string) => {
    await page.goto(path)
    await page.getByRole('button', { name: 'Copy link' }).first().click()
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toHaveCount(1)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}${path}`)
  }

  await copied(story)
  await copied('/@example-helper-1')
  if (requestPath) {
    await copied(requestPath)
    // A suggestion's own page, where the request has one to read.
    const suggestion = page.locator(`a[href^="${requestPath}/s/"]`).first()
    const suggestionPath = (await suggestion.count()) ? await suggestion.getAttribute('href') : null
    if (suggestionPath) await copied(suggestionPath)
  }
})
