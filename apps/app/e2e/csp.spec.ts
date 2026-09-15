import { expect, test, type Page } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * The Content-Security-Policy, and the way it fails (OD-10, decision 0025).
 *
 * This file exists because of a specific bug, and the bug is worth stating
 * because nothing else in the suite would have named it.
 *
 * A nonce is minted per request. Statically prerendered HTML is written once,
 * at build time, so it cannot carry one. With `'strict-dynamic'` the browser
 * ignores `'self'` and trusts only what carries the nonce — so a prerendered
 * page arrives looking completely normal, because the markup is server
 * rendered, and then every script on it is refused. Nothing is interactive.
 * Nothing in the server log says so. Seventeen flows failed and the only common
 * thread was that each of them clicked something.
 *
 * The other specs catch it as seventeen unrelated timeouts. This one catches it
 * as what it is.
 */

/**
 * Long enough for a refused script to complain, short enough to be free.
 *
 * Not `networkidle`: the dashboard and the notifications page both poll, so it
 * never settles and the test times out having proved nothing. A CSP violation
 * is raised when the script is parsed, which is before `load` — the wait after
 * it is only so the console event has somewhere to land.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.waitForTimeout(250)
}

/** Collects the browser's own CSP complaints, which are the ground truth. */
function violations(page: Page): string[] {
  const found: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (/content security policy|violates the following/iu.test(text)) found.push(text)
  })
  page.on('pageerror', (error) => {
    if (/content security policy/iu.test(error.message)) found.push(error.message)
  })
  return found
}

/** Signed out, and every one of these was prerendered before decision 0025. */
const PUBLIC_PAGES = ['/signup', '/signin', '/rules', '/browse', '/a-page-that-does-not-exist']

test('every page is sent with a policy that carries a nonce', async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    const response = await page.goto(path)
    const policy = response?.headers()['content-security-policy']

    expect(policy, `${path} has no policy`).toBeTruthy()
    expect(policy, path).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/]+={0,2}'/u)
    expect(policy, path).toContain("'strict-dynamic'")
    // The directive that makes the rest of it worth having.
    expect(policy, path).not.toMatch(/script-src[^;]*'unsafe-inline'/u)
  }
})

test('and the nonce reaches the markup, not only the header', async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path)
    const html = await page.content()

    // The whole bug in one assertion: a prerendered page has the policy on the
    // response and no nonce in the HTML, so every script on it is refused.
    expect(
      (html.match(/nonce=/gu) ?? []).length,
      `${path} carries no nonce — it is probably being prerendered again`,
    ).toBeGreaterThan(0)
  }
})

test('a signed-out visitor triggers no violation on any public page', async ({ page }) => {
  const found = violations(page)

  for (const path of PUBLIC_PAGES) {
    await page.goto(path)
    await settle(page)
  }

  expect(found).toEqual([])
})

test('and nor does somebody signed in, on the screens they write from', async ({ page }) => {
  const found = violations(page)

  await signUpAndOnboard(page)
  for (const path of ['/', '/new', '/import', '/settings', '/notifications']) {
    await page.goto(path)
    await settle(page)
  }

  expect(found).toEqual([])
})

test('the page is actually interactive, which is what a blocked script costs', async ({ page }) => {
  // The strongest guard in this file. A CSP failure leaves the markup intact
  // and hydration dead, so anything that only checks for text passes happily.
  // This asserts that client JavaScript ran.
  await page.goto('/signup')

  const button = page.getByRole('button', { name: /email me a link/i })
  await expect(button).toBeEnabled()

  await page.getByLabel('Email').fill('not-a-real-address')
  await button.click()

  // The message comes from client-side validation. If scripts were refused,
  // this never appears and the form does a full page submit instead.
  await expect(page.getByText(/email/i).first()).toBeVisible()
  await expect(page).toHaveURL(/\/signup/u)
})
