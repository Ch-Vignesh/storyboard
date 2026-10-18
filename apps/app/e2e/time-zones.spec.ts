import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 1.18 — dates in the reader's own time zone. Server components
 * formatted dates in the server's zone, which is UTC on the host, and the
 * history panel was rendered once in that zone and again in the browser's.
 *
 * Auckland rather than the plan's Kolkata: the machine these flows run on is
 * in Kolkata, so a server that ignored the browser's zone would still have
 * matched it there, and the test would have proved nothing.
 */
const ZONE = 'Pacific/Auckland'

test('the server writes a time in the browser’s own zone', async ({ browser, baseURL }) => {
  // The browser's half: a page tells the server its zone.
  const context = await browser.newContext({ timezoneId: ZONE })
  const page = await context.newPage()
  await signUpAndOnboard(page)
  expect((await context.cookies()).find((cookie) => cookie.name === 'tz')?.value).toBe(
    encodeURIComponent(ZONE),
  )

  await page.goto('/new')
  await page.getByLabel('Title').fill('Clocks')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/clocks-/)
  const path = new URL(page.url()).pathname

  await page.getByRole('link', { name: 'Edit' }).first().click()
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('It was late, or early, depending on where you stood.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The server's half: with scripts off, what it rendered is all there is. The
  // same cookies, so it is the same person and the same zone.
  const plain = await browser.newContext({ javaScriptEnabled: false, timezoneId: ZONE })
  await plain.addCookies(await context.cookies())
  const quiet = await plain.newPage()
  await quiet.goto(`${path}/c/1/1/history`)
  const stamp = quiet.locator('time').first()
  const iso = await stamp.getAttribute('datetime')
  if (!iso) throw new Error(`No <time> on the history page at ${baseURL ?? ''}${path}.`)
  const expected = new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  })
  await expect(stamp).toHaveText(expected)

  await plain.close()
  await context.close()
})
