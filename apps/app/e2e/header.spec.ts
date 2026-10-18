import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 4.1 — one header, everywhere. Before it, a story's
 * sub-pages, a profile and the rules page had none: no notifications, no way
 * out. A guest reads it the other way round: the wordmark goes to Browse,
 * which needs no account, and the two ways in are offered.
 */
test('every page carries the site header, read right for guests and members', async ({ page }) => {
  const header = () => page.locator('header').first()

  // A guest, on a public page.
  await page.goto('/rules')
  await expect(header().getByRole('link', { name: 'Draftboard' })).toHaveAttribute(
    'href',
    '/browse',
  )
  await expect(header().getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(header().getByRole('link', { name: 'Create an account' })).toBeVisible()
  await expect(header().getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  // Item 4.10 — the rules page's own way back goes where a guest may go.
  await expect(page.getByRole('link', { name: 'Back to Draftboard' })).toHaveAttribute(
    'href',
    '/browse',
  )

  // A member, on a story's sub-pages, their profile and the public pages.
  const { username } = await signUpAndOnboard(page)
  await page.goto('/new')
  await page.getByLabel('Title').fill('A story with a header')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//)
  const story = new URL(page.url()).pathname

  for (const url of [
    `${story}/contents`,
    `${story}/contributors`,
    `${story}/versions`,
    `/@${username}`,
    '/rules',
    '/contact',
  ]) {
    await page.goto(url)
    await expect(header().getByRole('link', { name: 'Draftboard' }), url).toHaveAttribute(
      'href',
      '/',
    )
    await expect(header().getByRole('link', { name: 'Your suggestions' }), url).toBeVisible()
    await expect(header().getByRole('link', { name: 'Notifications' }), url).toBeVisible()
    await expect(header().getByRole('button', { name: 'Sign out' }), url).toBeVisible()
  }

  // The reader keeps its own header, with Browse and the account end of this one.
  await page.goto(story)
  await expect(header().getByRole('link', { name: 'Browse' })).toBeVisible()
  await expect(header().getByRole('link', { name: `@${username}` })).toBeVisible()
  await expect(header().getByRole('button', { name: 'Sign out' })).toBeVisible()
})

/**
 * Phase 14, item 4.2 — at phone width the links fold behind "Menu": a
 * disclosure that says whether it is open, closes on Escape, and hands focus
 * back to the button.
 */
test('at phone width the header folds into a menu that opens, closes on Escape and keeps focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/rules')
  const header = page.locator('header').first()
  const menu = header.getByRole('button', { name: 'Menu' })
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(header.getByRole('link', { name: 'Create an account' })).toBeHidden()

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(header.getByRole('link', { name: 'Create an account' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(header.getByRole('link', { name: 'Create an account' })).toBeHidden()
  await expect(menu).toBeFocused()

  // From `sm` up the button is gone and the links are a row.
  await page.setViewportSize({ width: 1024, height: 800 })
  await expect(menu).toBeHidden()
  await expect(header.getByRole('link', { name: 'Create an account' })).toBeVisible()
})
