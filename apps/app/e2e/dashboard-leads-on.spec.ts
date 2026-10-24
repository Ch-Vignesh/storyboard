import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 9.2 — the dashboard's genre region is a sample, and its
 * "See all" leads on to browse filtered to the same genres. (The news
 * region's leads to the suggestions page; it shows only once there is news,
 * which takes an author's decision this flow does not make.)
 */
test('the genre region leads on to browse, filtered to the pinned genres', async ({ page }) => {
  await signUpAndOnboard(page)

  const seeAll = page.getByRole('link', { name: 'See all stuck passages in your genres' })
  await expect(seeAll).toBeVisible()
  const href = (await seeAll.getAttribute('href')) ?? ''
  // Onboarding pinned three genres (helpers.ts); each rides in the address.
  expect(new URL(href, 'http://localhost').searchParams.get('genre')?.split(',')).toHaveLength(3)

  await seeAll.click()
  await expect(page).toHaveURL(/\/browse\?genre=/u)
  await expect(page.getByRole('heading', { name: /where people are stuck/i })).toBeVisible()
})
