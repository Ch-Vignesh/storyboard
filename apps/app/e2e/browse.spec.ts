import { expect, test } from '@playwright/test'

/**
 * FR-11.3 (phase 14, item 9.1) — browse pages through everything: the count
 * is of everything the filters match, "Show more" adds the next page below
 * the cards already read, and each card says when its request was opened.
 * Read-only, so it runs against a deployment too.
 *
 * The seeded library alone holds more open requests than one page, so the
 * first page here is never the whole of it.
 */
test('browse shows how many there are, and shows more of them @deployed', async ({ page }) => {
  await page.goto('/browse')
  const requests = page.getByRole('list', { name: 'Passages open for help' }).locator(':scope > li')
  const status = page.getByRole('status').first()

  await expect(status).toHaveText(/^Showing \d+ of \d+$/u)
  const [, shown, total] =
    /^Showing (\d+) of (\d+)$/u.exec((await status.textContent()) ?? '') ?? []
  expect(Number(total)).toBeGreaterThan(Number(shown))
  await expect(requests).toHaveCount(Number(shown))
  // Item 9.1 — when each was opened, beside when it closes (item 6.15).
  await expect(requests.first()).toContainText(/Opened \d{1,2} \w+ · Closes on/u)

  await page.getByRole('button', { name: /^Show \d+ more passages?$/u }).click()
  await expect(requests).not.toHaveCount(Number(shown))
  const after = await requests.count()
  expect(after).toBeGreaterThan(Number(shown))
  // Still counting the same whole, from further down it.
  await expect(status).toHaveText(
    after < Number(total)
      ? `Showing ${String(after)} of ${total ?? ''}`
      : `${total ?? ''} passages`,
  )
})
